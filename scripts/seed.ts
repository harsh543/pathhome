import type { PoolClient } from "pg";
import { closePool, withTransaction } from "../lib/db/client";
import { serializeError } from "../lib/db/errors";

// Block 1 baseline seed: 3 providers + 1 prompt_version, plus one small demo case so the
// Block 3 dashboard renders end-to-end. Idempotent by construction — it TRUNCATEs the
// domain tables first, so a fresh clone and a re-run both yield the same demo state.
// (Block 9 expands this into the full cinematic demo across two prompt versions.)

type IdRow = { id: string };

const DOMAIN_TABLES = [
  "audit_log",
  "call_metrics",
  "enrichment_results",
  "transcripts",
  "call_sessions",
  "follow_ups",
  "referrals",
  "needs",
  "cases",
  "consent_records",
  "people",
  "prompt_versions",
  "providers",
] as const;

async function insertProvider(
  client: PoolClient,
  name: string,
  type: string,
  neighborhood: string,
  capacity: number,
  contact: Record<string, string>,
): Promise<string> {
  const result = await client.query<IdRow>(
    `insert into providers (name, type, neighborhood, capacity, contact)
     values ($1, $2, $3, $4, $5::jsonb)
     returning id`,
    [name, type, neighborhood, capacity, JSON.stringify(contact)],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Failed to insert provider ${name}`);
  return row.id;
}

async function seed(): Promise<void> {
  await withTransaction(async (client) => {
    // Repeatable reset. schema_migrations is intentionally NOT touched.
    await client.query(`truncate table ${DOMAIN_TABLES.join(", ")} restart identity cascade`);

    // Sequential, not Promise.all: a single PoolClient cannot multiplex queries
    // inside one transaction (deprecated in pg@8, an error in pg@9).
    const providerIds: string[] = [];
    providerIds.push(
      await insertProvider(client, "Harbor Night Shelter", "shelter", "Downtown", 12, {
        phone: "555-0100",
        intake: "7pm-10pm",
      }),
    );
    providerIds.push(
      await insertProvider(client, "Second Start Workforce Center", "job_coaching", "Midtown", 30, {
        email: "intake@example.org",
      }),
    );
    providerIds.push(
      await insertProvider(client, "Bridge Ride Vouchers", "transport", "Citywide", 40, {
        phone: "555-0145",
      }),
    );

    const promptResult = await client.query<IdRow>(
      `insert into prompt_versions (name, version, system_prompt, params)
       values ($1, $2, $3, $4::jsonb)
       returning id`,
      [
        "pathhome-intake",
        "v1",
        "You are a reentry and housing intake assistant. Collect facts for human case managers and do not make final decisions.",
        JSON.stringify({ temperature: 0, optOutModelTraining: true }),
      ],
    );
    const prompt = promptResult.rows[0];
    if (!prompt) throw new Error("Failed to insert prompt version");

    const personResult = await client.query<IdRow>(
      `insert into people (first_name, last_name, phone, preferred_contact, notes)
       values ($1, $2, $3, $4, $5)
       returning id`,
      ["Jordan", "Reed", "555-0188", "phone", "Demo case seeded for PathHome Phase 1"],
    );
    const person = personResult.rows[0];
    if (!person) throw new Error("Failed to insert demo person");

    await client.query(
      `insert into consent_records (person_id, scope, granted, method)
       values ($1, $2, $3, $4)`,
      [person.id, "referral", true, "verbal"],
    );

    const caseResult = await client.query<IdRow>(
      `insert into cases (person_id, status, priority)
       values ($1, $2, $3)
       returning id`,
      [person.id, "open", "high"],
    );
    const demoCase = caseResult.rows[0];
    if (!demoCase) throw new Error("Failed to insert demo case");

    const needResult = await client.query<IdRow>(
      `insert into needs (case_id, category, description, urgency)
       values ($1, $2, $3, $4)
       returning id`,
      [demoCase.id, "shelter", "Needs a bed tonight after recent release.", "high"],
    );
    const need = needResult.rows[0];
    if (!need) throw new Error("Failed to insert demo need");

    await client.query(
      `insert into referrals (case_id, need_id, provider_id, status, notes)
       values ($1, $2, $3, $4, $5)`,
      [demoCase.id, need.id, providerIds[0], "proposed", "Seeded referral for operator review"],
    );

    await client.query(
      `insert into follow_ups (case_id, description, due_at, assigned_to)
       values ($1, $2, now() + interval '1 day', $3)`,
      [demoCase.id, "Confirm shelter availability and transportation plan.", "demo-operator"],
    );

    await client.query(
      `insert into audit_log (actor, action, entity, entity_id, meta)
       values ($1, $2, $3, $4, $5::jsonb)`,
      [
        "seed-script",
        "seed_phase_1",
        "cases",
        demoCase.id,
        JSON.stringify({ providerCount: providerIds.length, promptVersionId: prompt.id }),
      ],
    );

    console.log(
      JSON.stringify({
        level: "info",
        event: "seed_complete",
        providers: providerIds.length,
        promptVersionId: prompt.id,
        caseId: demoCase.id,
      }),
    );
  });
}

seed()
  .catch((error: unknown) => {
    console.error(JSON.stringify({ level: "error", event: "seed_failed", error: serializeError(error) }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
