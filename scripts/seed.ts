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

    // second need so the case detail shows a multi-need caseload
    await client.query(
      `insert into needs (case_id, category, description, urgency)
       values ($1, $2, $3, $4)`,
      [demoCase.id, "transport", "Needs a ride to court tomorrow morning.", "high"],
    );

    await client.query(
      `insert into follow_ups (case_id, description, due_at, assigned_to)
       values ($1, $2, now() + interval '1 day', $3)`,
      [demoCase.id, "Confirm shelter availability and transportation plan.", "demo-operator"],
    );
    await client.query(
      `insert into follow_ups (case_id, description, due_at, assigned_to)
       values ($1, $2, now() + interval '18 hours', $3)`,
      [demoCase.id, "Verify probation check-in / court logistics for tomorrow.", "demo-operator"],
    );

    // A completed call session with a redacted transcript + enrichment, so the case
    // detail renders transcript, summary, and the unresolved-blockers card end-to-end.
    const ttlHours = Number(process.env.TRANSCRIPT_TTL_HOURS ?? 72);
    const sessionResult = await client.query<IdRow>(
      `insert into call_sessions (case_id, person_id, channel, prompt_version_id, disposition, ended_at)
       values ($1, $2, 'browser', $3, 'completed', now())
       returning id`,
      [demoCase.id, person.id, prompt.id],
    );
    const session = sessionResult.rows[0];
    if (!session) throw new Error("Failed to insert demo call session");

    const turns = [
      { index: 0, speaker: "agent", text: "You've reached PathHome intake. Can I get your first name?" },
      { index: 1, speaker: "caller", text: "It's [NAME]. I was released today." },
      { index: 2, speaker: "agent", text: "Thanks [NAME]. Do you have somewhere to stay tonight?" },
      { index: 3, speaker: "caller", text: "No, I need a bed tonight. And I have court tomorrow morning." },
      { index: 4, speaker: "agent", text: "Understood. Do you need a ride to court?" },
      { index: 5, speaker: "caller", text: "Yes, I don't have transportation. I'm also looking for work." },
      { index: 6, speaker: "agent", text: "Got it. I'm noting shelter, transport, and job support for a caseworker to follow up." },
    ];
    await client.query(
      `insert into transcripts (call_session_id, turns, redacted, ttl_expires_at)
       values ($1, $2::jsonb, true, now() + make_interval(hours => $3))`,
      [session.id, JSON.stringify(turns), ttlHours],
    );

    await client.query(
      `insert into enrichment_results
         (call_session_id, summary, urgency_overall, completion_status,
          entities, topics, blockers, requires_human_followup, model)
       values ($1, $2, 'high', 'complete', $3::jsonb, $4::jsonb, $5::jsonb, true, 'seed-demo')`,
      [
        session.id,
        "Recently released caller needs a shelter bed tonight, has court tomorrow morning, needs transportation, and is seeking work.",
        JSON.stringify({
          neighborhoods: ["Downtown"],
          appointment_dates: ["tomorrow 9:00am"],
          provider_mentions: [],
          caseworker: null,
        }),
        JSON.stringify(["shelter", "probation", "transport", "employment"]),
        JSON.stringify([
          "No shelter bed confirmed for tonight",
          "Court appointment conflicts with shelter intake window",
        ]),
      ],
    );

    // call_metrics for v1 — fleet analysis page needs data to render
    await client.query(
      `insert into call_metrics
         (call_session_id, prompt_version_id, interruption_count, mean_turn_latency_ms,
          entity_capture_rate, completion, failure_mode)
       values ($1, $2, 1, 420, 0.85, true, 'none')`,
      [session.id, prompt.id],
    );

    // ── Second prompt version (v2) + second case for cinematic Fleet Analysis ──

    const prompt2Result = await client.query<IdRow>(
      `insert into prompt_versions (name, version, system_prompt, params)
       values ($1, $2, $3, $4::jsonb)
       returning id`,
      [
        "pathhome-intake",
        "v2",
        "You are a reentry and housing intake assistant. Ask only one question at a time. Collect facts for human case managers and do not make final decisions.",
        JSON.stringify({ temperature: 0, optOutModelTraining: true, maxTurns: 12 }),
      ],
    );
    const prompt2 = prompt2Result.rows[0];
    if (!prompt2) throw new Error("Failed to insert prompt v2");

    const person2Result = await client.query<IdRow>(
      `insert into people (first_name, last_name, phone, preferred_contact, notes)
       values ($1, $2, $3, $4, $5)
       returning id`,
      ["Alex", "Morgan", "555-0199", "phone", "Demo case v2 — cinematic seed"],
    );
    const person2 = person2Result.rows[0];
    if (!person2) throw new Error("Failed to insert demo person 2");

    await client.query(
      `insert into consent_records (person_id, scope, granted, method) values ($1, $2, $3, $4)`,
      [person2.id, "referral", true, "verbal"],
    );

    const case2Result = await client.query<IdRow>(
      `insert into cases (person_id, status, priority) values ($1, $2, $3) returning id`,
      [person2.id, "in_progress", "critical"],
    );
    const case2 = case2Result.rows[0];
    if (!case2) throw new Error("Failed to insert demo case 2");

    await client.query(
      `insert into needs (case_id, category, description, urgency) values ($1,$2,$3,$4)`,
      [case2.id, "medication", "Needs prescription refilled before parole meeting.", "critical"],
    );
    await client.query(
      `insert into needs (case_id, category, description, urgency) values ($1,$2,$3,$4)`,
      [case2.id, "id_docs", "Lost ID during incarceration — needs replacement.", "high"],
    );
    await client.query(
      `insert into follow_ups (case_id, description, due_at, assigned_to) values ($1,$2,now() + interval '6 hours',$3)`,
      [case2.id, "Contact pharmacy re: emergency prescription transfer.", "demo-operator"],
    );

    const session2Result = await client.query<IdRow>(
      `insert into call_sessions (case_id, person_id, channel, prompt_version_id, disposition, ended_at)
       values ($1,$2,'browser',$3,'completed',now()) returning id`,
      [case2.id, person2.id, prompt2.id],
    );
    const session2 = session2Result.rows[0];
    if (!session2) throw new Error("Failed to insert demo session 2");

    const turns2 = [
      { index: 0, speaker: "agent", text: "PathHome intake. What's your first name?" },
      { index: 1, speaker: "caller", text: "[NAME]. I'm on parole and I need help fast." },
      { index: 2, speaker: "agent", text: "What's the most urgent thing you need right now?" },
      { index: 3, speaker: "caller", text: "I ran out of my medication and my parole officer meets me in 8 hours." },
      { index: 4, speaker: "agent", text: "Got it. Do you have a prescription number or pharmacy?" },
      { index: 5, speaker: "caller", text: "It was at [PHARMACY] but they said they need authorization. I also have no ID." },
      { index: 6, speaker: "agent", text: "I'm flagging medication and ID replacement as critical needs for immediate caseworker follow-up." },
    ];
    await client.query(
      `insert into transcripts (call_session_id, turns, redacted, ttl_expires_at)
       values ($1,$2::jsonb,true,now() + make_interval(hours => $3))`,
      [session2.id, JSON.stringify(turns2), Number(process.env.TRANSCRIPT_TTL_HOURS ?? 72)],
    );

    await client.query(
      `insert into enrichment_results
         (call_session_id, summary, urgency_overall, completion_status,
          entities, topics, blockers, requires_human_followup, model)
       values ($1,$2,'critical','complete',$3::jsonb,$4::jsonb,$5::jsonb,true,'seed-demo')`,
      [
        session2.id,
        "Parolee needs emergency medication refill and ID replacement before parole meeting in ~8 hours.",
        JSON.stringify({ neighborhoods: [], appointment_dates: ["today in 8 hours"], provider_mentions: [], caseworker: null }),
        JSON.stringify(["medication", "id_docs", "probation"]),
        JSON.stringify([
          "Medication authorization not yet confirmed",
          "No ID — pharmacy cannot dispense without caseworker authorization",
          "Parole meeting is time-critical — 8-hour window",
        ]),
      ],
    );

    // v2 call_metrics — slightly worse completion + higher latency for contrast
    await client.query(
      `insert into call_metrics
         (call_session_id, prompt_version_id, interruption_count, mean_turn_latency_ms,
          entity_capture_rate, completion, failure_mode)
       values ($1,$2,3,680,0.70,true,'none')`,
      [session2.id, prompt2.id],
    );

    // A dropped call on v2 — populates interruption_loop failure mode
    const person3Result = await client.query<IdRow>(
      `insert into people (first_name, last_name, notes)
       values ($1,$2,$3) returning id`,
      ["Casey", "Rivera", "Dropped-call demo — cinematic seed"],
    );
    const person3 = person3Result.rows[0];
    if (!person3) throw new Error("Failed to insert person 3");

    const case3Result = await client.query<IdRow>(
      `insert into cases (person_id, status, priority) values ($1,'open','medium') returning id`,
      [person3.id],
    );
    const case3 = case3Result.rows[0];
    if (!case3) throw new Error("Failed to insert case 3");

    const session3Result = await client.query<IdRow>(
      `insert into call_sessions (case_id, person_id, channel, prompt_version_id, disposition, ended_at)
       values ($1,$2,'browser',$3,'dropped',now() - interval '2 hours') returning id`,
      [case3.id, person3.id, prompt2.id],
    );
    const session3 = session3Result.rows[0];
    if (!session3) throw new Error("Failed to insert demo session 3");

    await client.query(
      `insert into call_metrics
         (call_session_id, prompt_version_id, interruption_count, mean_turn_latency_ms,
          entity_capture_rate, completion, failure_mode)
       values ($1,$2,8,910,0.20,false,'interruption_loop')`,
      [session3.id, prompt2.id],
    );

    await client.query(
      `insert into audit_log (actor, action, entity, entity_id, meta)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [
        "seed-script",
        "seed_cinematic",
        "cases",
        demoCase.id,
        JSON.stringify({
          providerCount: providerIds.length,
          promptV1: prompt.id,
          promptV2: prompt2.id,
          cases: [demoCase.id, case2.id, case3.id],
        }),
      ],
    );

    console.log(
      JSON.stringify({
        level: "info",
        event: "seed_complete",
        providers: providerIds.length,
        promptVersions: [prompt.id, prompt2.id],
        cases: [demoCase.id, case2.id, case3.id],
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
