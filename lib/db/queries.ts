import type { PoolClient } from "pg";
import { z } from "zod";
import { pool, withTransaction } from "./client";
import {
  AuditLogRowSchema,
  CallMetricsRowSchema,
  CaseDetailSchema,
  CaseListRowSchema,
  CaseRowSchema,
  ConsentRecordRowSchema,
  EnrichmentResultRowSchema,
  FleetMetricsRowSchema,
  FollowUpRowSchema,
  NeedRowSchema,
  PersonRowSchema,
  ReferralRowSchema,
  TranscriptRowSchema,
  UuidSchema,
  type AuditLogRow,
  type CallMetricsRow,
  type CaseDetail,
  type CaseListRow,
  type CaseRow,
  type ConsentRecordRow,
  type EnrichmentResultRow,
  type FleetMetricsRow,
  type FollowUpRow,
  type JsonValue,
  type NeedRow,
  type PersonRow,
  type ReferralRow,
  type TranscriptRow,
} from "../schemas/db";
import {
  AddNeedInputSchema,
  CreateCaseInputSchema,
  CreateFollowUpInputSchema,
  CreatePersonInputSchema,
  CreateReferralInputSchema,
  GetCaseDetailInputSchema,
  RecordConsentInputSchema,
  SaveEnrichmentInputSchema,
  SaveMetricsInputSchema,
  SaveTranscriptInputSchema,
} from "../schemas/tools";

type ParseSchema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

export class ConsentRequiredError extends Error {
  readonly code = "CONSENT_REQUIRED";
  readonly status = 409;

  constructor(readonly caseId: string) {
    super(`Referral consent is required before creating a referral for case ${caseId}`);
    this.name = "ConsentRequiredError";
  }
}

export function isConsentRequiredError(error: unknown): error is ConsentRequiredError {
  return error instanceof ConsentRequiredError;
}

async function fetchOne<T>(
  client: PoolClient,
  schema: ParseSchema<T>,
  text: string,
  values: readonly unknown[],
): Promise<T> {
  const result = await client.query<Record<string, unknown>>(text, [...values]);
  const row = result.rows[0];
  if (!row) {
    throw new Error("Expected one row but query returned none");
  }
  return schema.parse(row);
}

async function fetchOptional<T>(
  client: PoolClient,
  schema: ParseSchema<T>,
  text: string,
  values: readonly unknown[],
): Promise<T | null> {
  const result = await client.query<Record<string, unknown>>(text, [...values]);
  const row = result.rows[0];
  return row ? schema.parse(row) : null;
}

async function fetchMany<T>(
  client: PoolClient,
  schema: ParseSchema<T>,
  text: string,
  values: readonly unknown[],
): Promise<T[]> {
  const result = await client.query<Record<string, unknown>>(text, [...values]);
  return result.rows.map((row) => schema.parse(row));
}

function jsonb(value: JsonValue | undefined): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

async function writeAudit(
  client: PoolClient,
  input: {
    actor: string;
    action: string;
    entity: string;
    entityId: string | null;
    meta?: Record<string, JsonValue>;
  },
): Promise<AuditLogRow> {
  return fetchOne(
    client,
    AuditLogRowSchema,
    `insert into audit_log (actor, action, entity, entity_id, meta)
     values ($1, $2, $3, $4, $5::jsonb)
     returning *`,
    [input.actor, input.action, input.entity, input.entityId, jsonb(input.meta)],
  );
}

export async function createPerson(payload: unknown): Promise<PersonRow> {
  const input = CreatePersonInputSchema.parse(payload);

  return withTransaction(async (client) => {
    const created = await fetchOne(
      client,
      PersonRowSchema,
      `insert into people (first_name, last_name, phone, preferred_contact, notes)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [
        input.firstName ?? null,
        input.lastName ?? null,
        input.phone ?? null,
        input.preferredContact ?? null,
        input.notes ?? null,
      ],
    );

    await writeAudit(client, {
      actor: input.actor,
      action: "create_person",
      entity: "people",
      entityId: created.id,
      meta: input.auditMeta,
    });

    return created;
  });
}

export async function recordConsent(payload: unknown): Promise<ConsentRecordRow> {
  const input = RecordConsentInputSchema.parse(payload);

  return withTransaction(async (client) => {
    const created = await fetchOne(
      client,
      ConsentRecordRowSchema,
      `insert into consent_records (person_id, scope, granted, method)
       values ($1, $2, $3, $4)
       returning *`,
      [input.personId, input.scope, input.granted, input.method],
    );

    await writeAudit(client, {
      actor: input.actor,
      action: "record_consent",
      entity: "consent_records",
      entityId: created.id,
      meta: { ...input.auditMeta, scope: input.scope, granted: input.granted },
    });

    return created;
  });
}

export async function createCase(payload: unknown): Promise<CaseRow> {
  const input = CreateCaseInputSchema.parse(payload);

  return withTransaction(async (client) => {
    const created = await fetchOne(
      client,
      CaseRowSchema,
      `insert into cases (person_id, status, priority)
       values ($1, $2, $3)
       returning *`,
      [input.personId ?? null, input.status ?? "open", input.priority ?? "medium"],
    );

    await writeAudit(client, {
      actor: input.actor,
      action: "create_case",
      entity: "cases",
      entityId: created.id,
      meta: input.auditMeta,
    });

    return created;
  });
}

export async function addNeed(payload: unknown): Promise<NeedRow> {
  const input = AddNeedInputSchema.parse(payload);

  return withTransaction(async (client) => {
    const created = await fetchOne(
      client,
      NeedRowSchema,
      `insert into needs (case_id, category, description, urgency, status)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [
        input.caseId,
        input.category,
        input.description ?? null,
        input.urgency ?? "medium",
        input.status ?? "open",
      ],
    );

    await writeAudit(client, {
      actor: input.actor,
      action: "add_need",
      entity: "needs",
      entityId: created.id,
      meta: input.auditMeta,
    });

    return created;
  });
}

export async function createReferral(payload: unknown): Promise<ReferralRow> {
  const input = CreateReferralInputSchema.parse(payload);

  try {
    return await withTransaction(async (client) => {
      const consentResult = await client.query<{ has_consent: boolean }>(
        `select exists (
           select 1
           from cases c
           join consent_records cr on cr.person_id = c.person_id
           where c.id = $1
             and cr.scope = $2
             and cr.granted = true
         ) as has_consent`,
        [input.caseId, "referral"],
      );

      if (consentResult.rows[0]?.has_consent !== true) {
        throw new ConsentRequiredError(input.caseId);
      }

      const created = await fetchOne(
        client,
        ReferralRowSchema,
        `insert into referrals (case_id, need_id, provider_id, status, notes)
         values ($1, $2, $3, $4, $5)
         returning *`,
        [
          input.caseId,
          input.needId ?? null,
          input.providerId ?? null,
          input.status ?? "proposed",
          input.notes ?? null,
        ],
      );

      await writeAudit(client, {
        actor: input.actor,
        action: "create_referral",
        entity: "referrals",
        entityId: created.id,
        meta: { ...input.auditMeta, consent_verified: true },
      });

      return created;
    });
  } catch (error) {
    if (isConsentRequiredError(error)) {
      // Record the fail-closed refusal OUTSIDE the rolled-back transaction so the
      // audit trail preserves the blocked attempt (parameterized; no interpolation).
      await pool.query(
        `insert into audit_log (actor, action, entity, entity_id, meta)
         values ($1, $2, $3, $4, $5::jsonb)`,
        [
          input.actor,
          "referral_blocked_no_consent",
          "referrals",
          null,
          JSON.stringify({
            ...(input.auditMeta ?? {}),
            caseId: input.caseId,
            reason: "missing_referral_consent",
          }),
        ],
      );
      console.error(
        JSON.stringify({
          level: "warn",
          event: "referral_blocked",
          reason: "missing_referral_consent",
          caseId: input.caseId,
          actor: input.actor,
        }),
      );
    }
    throw error;
  }
}

export async function createFollowUp(payload: unknown): Promise<FollowUpRow> {
  const input = CreateFollowUpInputSchema.parse(payload);

  return withTransaction(async (client) => {
    const created = await fetchOne(
      client,
      FollowUpRowSchema,
      `insert into follow_ups (case_id, description, due_at, assigned_to, status)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [
        input.caseId,
        input.description,
        input.dueAt ?? null,
        input.assignedTo ?? null,
        input.status ?? "pending",
      ],
    );

    await writeAudit(client, {
      actor: input.actor,
      action: "create_follow_up",
      entity: "follow_ups",
      entityId: created.id,
      meta: input.auditMeta,
    });

    return created;
  });
}

export async function saveTranscript(payload: unknown): Promise<TranscriptRow> {
  const input = SaveTranscriptInputSchema.parse(payload);

  return withTransaction(async (client) => {
    const created = await fetchOne(
      client,
      TranscriptRowSchema,
      `insert into transcripts (call_session_id, turns, redacted, ttl_expires_at)
       values ($1, $2::jsonb, $3, $4)
       returning *`,
      [
        input.callSessionId,
        JSON.stringify(input.turns),
        input.redacted,
        input.ttlExpiresAt ?? null,
      ],
    );

    await writeAudit(client, {
      actor: input.actor,
      action: "save_transcript",
      entity: "transcripts",
      entityId: created.id,
      meta: input.auditMeta,
    });

    return created;
  });
}

export async function saveEnrichment(payload: unknown): Promise<EnrichmentResultRow> {
  const input = SaveEnrichmentInputSchema.parse(payload);

  return withTransaction(async (client) => {
    const created = await fetchOne(
      client,
      EnrichmentResultRowSchema,
      `insert into enrichment_results (
         call_session_id,
         summary,
         urgency_overall,
         completion_status,
         entities,
         topics,
         blockers,
         requires_human_followup,
         model
       )
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)
       returning *`,
      [
        input.callSessionId,
        input.summary ?? null,
        input.urgencyOverall ?? null,
        input.completionStatus ?? null,
        jsonb(input.entities ?? null),
        jsonb(input.topics ?? null),
        jsonb(input.blockers ?? null),
        input.requiresHumanFollowup ?? null,
        input.model ?? null,
      ],
    );

    await writeAudit(client, {
      actor: input.actor,
      action: "save_enrichment",
      entity: "enrichment_results",
      entityId: created.id,
      meta: input.auditMeta,
    });

    return created;
  });
}

export async function saveMetrics(payload: unknown): Promise<CallMetricsRow> {
  const input = SaveMetricsInputSchema.parse(payload);

  return withTransaction(async (client) => {
    const created = await fetchOne(
      client,
      CallMetricsRowSchema,
      `insert into call_metrics (
         call_session_id,
         prompt_version_id,
         interruption_count,
         mean_turn_latency_ms,
         entity_capture_rate,
         completion,
         failure_mode
       )
       values ($1, $2, $3, $4, $5, $6, $7)
       returning *`,
      [
        input.callSessionId,
        input.promptVersionId ?? null,
        input.interruptionCount ?? null,
        input.meanTurnLatencyMs ?? null,
        input.entityCaptureRate ?? null,
        input.completion ?? null,
        input.failureMode ?? null,
      ],
    );

    await writeAudit(client, {
      actor: input.actor,
      action: "save_metrics",
      entity: "call_metrics",
      entityId: created.id,
      meta: input.auditMeta,
    });

    return created;
  });
}

export async function getCaseList(): Promise<CaseListRow[]> {
  const client = await pool.connect();
  try {
    return fetchMany(
      client,
      CaseListRowSchema,
      `select
         c.id,
         c.person_id,
         c.status,
         c.priority,
         c.opened_at,
         c.closed_at,
         coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Unassigned person') as person_summary,
         coalesce(open_needs.latest_needs_count, 0)::int as latest_needs_count
       from cases c
       left join people p on p.id = c.person_id
       left join lateral (
         select count(*)::int as latest_needs_count
         from needs n
         where n.case_id = c.id
           and n.status = 'open'
       ) open_needs on true
       order by
         case c.priority
           when 'critical' then 1
           when 'high' then 2
           when 'medium' then 3
           else 4
         end,
         c.opened_at desc`,
      [],
    );
  } finally {
    client.release();
  }
}

export async function getCaseDetail(payload: unknown): Promise<CaseDetail> {
  const input = GetCaseDetailInputSchema.parse(payload);

  return withTransaction(async (client) => {
    const caseRow = await fetchOne(
      client,
      CaseRowSchema,
      `select * from cases where id = $1`,
      [input.caseId],
    );

    const person = caseRow.person_id
      ? await fetchOptional(
          client,
          PersonRowSchema,
          `select * from people where id = $1`,
          [caseRow.person_id],
        )
      : null;

    const needs = await fetchMany(
      client,
      NeedRowSchema,
      `select * from needs where case_id = $1 order by created_at desc`,
      [input.caseId],
    );

    const referrals = await fetchMany(
      client,
      ReferralRowSchema,
      `select * from referrals where case_id = $1 order by created_at desc`,
      [input.caseId],
    );

    const followUps = await fetchMany(
      client,
      FollowUpRowSchema,
      `select * from follow_ups where case_id = $1 order by created_at desc`,
      [input.caseId],
    );

    const transcripts = await fetchMany(
      client,
      TranscriptRowSchema,
      `select t.*
       from transcripts t
       join call_sessions cs on cs.id = t.call_session_id
       where cs.case_id = $1
       order by t.ttl_expires_at desc nulls last, t.id desc`,
      [input.caseId],
    );

    const enrichments = await fetchMany(
      client,
      EnrichmentResultRowSchema,
      `select er.*
       from enrichment_results er
       join call_sessions cs on cs.id = er.call_session_id
       where cs.case_id = $1
       order by er.created_at desc`,
      [input.caseId],
    );

    return CaseDetailSchema.parse({
      case: caseRow,
      person,
      needs,
      referrals,
      followUps,
      transcripts,
      enrichments,
    });
  });
}

export async function getFleetMetrics(): Promise<FleetMetricsRow[]> {
  const client = await pool.connect();
  try {
    return fetchMany(
      client,
      FleetMetricsRowSchema,
      `with metric_agg as (
         select
           prompt_version_id,
           count(*)::int as total_calls,
           avg(case when completion then 1.0 else 0.0 end)::float as completion_rate,
           avg(mean_turn_latency_ms)::float as mean_turn_latency_ms,
           avg(entity_capture_rate)::float as entity_capture_rate
         from call_metrics
         where prompt_version_id is not null
         group by prompt_version_id
       ),
       failure_counts as (
         select
           prompt_version_id,
           coalesce(failure_mode, 'none') as failure_mode,
           count(*)::int as failure_count
         from call_metrics
         where prompt_version_id is not null
         group by prompt_version_id, coalesce(failure_mode, 'none')
       )
       select
         pv.id as prompt_version_id,
         pv.name as prompt_name,
         pv.version as prompt_version,
         coalesce(ma.total_calls, 0)::int as total_calls,
         coalesce(ma.completion_rate, 0)::float as completion_rate,
         ma.mean_turn_latency_ms,
         ma.entity_capture_rate,
         coalesce(
           jsonb_object_agg(fc.failure_mode, fc.failure_count) filter (where fc.failure_mode is not null),
           '{}'::jsonb
         ) as failure_modes
       from prompt_versions pv
       left join metric_agg ma on ma.prompt_version_id = pv.id
       left join failure_counts fc on fc.prompt_version_id = pv.id
       group by
         pv.id,
         pv.name,
         pv.version,
         ma.total_calls,
         ma.completion_rate,
         ma.mean_turn_latency_ms,
         ma.entity_capture_rate
       order by completion_rate desc, total_calls desc, pv.created_at desc`,
      [],
    );
  } finally {
    client.release();
  }
}

export function parseUuid(value: unknown): string {
  return UuidSchema.parse(value);
}
