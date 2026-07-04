import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { closePool, query } from "./client";
import {
  addNeed,
  createCase,
  createReferral,
  isConsentRequiredError,
} from "./queries";

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

type IdRow = {
  id: string;
};

async function resetDb(): Promise<void> {
  await query(`truncate table ${DOMAIN_TABLES.join(", ")} restart identity cascade`);
}

async function insertPerson(): Promise<string> {
  const result = await query<IdRow>(
    `insert into people (first_name, last_name, phone, preferred_contact)
     values ($1, $2, $3, $4)
     returning id`,
    ["Taylor", "Morgan", "555-0199", "phone"],
  );
  const row = result.rows[0];
  assert.ok(row);
  return row.id;
}

async function insertProvider(): Promise<string> {
  const result = await query<IdRow>(
    `insert into providers (name, type, neighborhood, capacity, contact)
     values ($1, $2, $3, $4, $5::jsonb)
     returning id`,
    ["Test Shelter", "shelter", "Downtown", 2, JSON.stringify({ phone: "555-0101" })],
  );
  const row = result.rows[0];
  assert.ok(row);
  return row.id;
}

async function insertReferralConsent(personId: string): Promise<void> {
  await query(
    `insert into consent_records (person_id, scope, granted, method)
     values ($1, $2, $3, $4)`,
    [personId, "referral", true, "test"],
  );
}

async function createReferralFixture(): Promise<{
  caseId: string;
  needId: string;
  personId: string;
  providerId: string;
}> {
  const personId = await insertPerson();
  const providerId = await insertProvider();
  const caseRow = await createCase({
    actor: "unit-test",
    personId,
    priority: "high",
  });
  const need = await addNeed({
    actor: "unit-test",
    caseId: caseRow.id,
    category: "shelter",
    description: "Needs a bed tonight.",
    urgency: "high",
  });

  return {
    caseId: caseRow.id,
    needId: need.id,
    personId,
    providerId,
  };
}

beforeEach(async () => {
  await resetDb();
});

after(async () => {
  await resetDb();
  await closePool();
});

test("createReferral fails closed when referral consent is missing", async () => {
  const fixture = await createReferralFixture();

  await assert.rejects(
    createReferral({
      actor: "unit-test",
      caseId: fixture.caseId,
      needId: fixture.needId,
      providerId: fixture.providerId,
      notes: "Should not be written",
    }),
    (error: unknown) => {
      assert.equal(isConsentRequiredError(error), true);
      return true;
    },
  );

  const referrals = await query<{ count: string }>(
    `select count(*)::text as count from referrals where case_id = $1`,
    [fixture.caseId],
  );
  assert.equal(referrals.rows[0]?.count, "0");
});

test("createReferral succeeds and audits when referral consent exists", async () => {
  const fixture = await createReferralFixture();
  await insertReferralConsent(fixture.personId);

  const referral = await createReferral({
    actor: "unit-test",
    caseId: fixture.caseId,
    needId: fixture.needId,
    providerId: fixture.providerId,
    notes: "Consent-backed referral.",
  });

  assert.equal(referral.case_id, fixture.caseId);
  assert.equal(referral.need_id, fixture.needId);
  assert.equal(referral.provider_id, fixture.providerId);
  assert.equal(referral.status, "proposed");

  const audits = await query<{ count: string }>(
    `select count(*)::text as count
     from audit_log
     where action = $1
       and entity = $2
       and entity_id = $3`,
    ["create_referral", "referrals", referral.id],
  );
  assert.equal(audits.rows[0]?.count, "1");
});
