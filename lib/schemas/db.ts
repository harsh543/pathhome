import { z } from "zod";

export const UuidSchema = z.string().uuid();
export const TimestampSchema = z.date();

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ]),
);

export const JsonObjectSchema = z.record(JsonValueSchema);

export const CaseStatusSchema = z.enum(["open", "in_progress", "resolved", "escalated"]);
export const NeedCategorySchema = z.enum([
  "shelter",
  "transport",
  "medication",
  "id_docs",
  "job_coaching",
  "probation",
  "food",
  "other",
]);
export const UrgencyLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export const ReferralStatusSchema = z.enum([
  "proposed",
  "sent",
  "accepted",
  "declined",
  "completed",
]);
export const ChannelTypeSchema = z.enum(["phone", "browser"]);

export const ProviderRowSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  type: z.string(),
  neighborhood: z.string().nullable(),
  capacity: z.number().int().nullable(),
  contact: JsonValueSchema.nullable(),
  created_at: TimestampSchema.nullable(),
});

export const PersonRowSchema = z.object({
  id: UuidSchema,
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  phone: z.string().nullable(),
  preferred_contact: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: TimestampSchema.nullable(),
});

export const ConsentRecordRowSchema = z.object({
  id: UuidSchema,
  person_id: UuidSchema.nullable(),
  scope: z.string(),
  granted: z.boolean(),
  method: z.string(),
  granted_at: TimestampSchema.nullable(),
});

export const CaseRowSchema = z.object({
  id: UuidSchema,
  person_id: UuidSchema.nullable(),
  status: CaseStatusSchema,
  priority: UrgencyLevelSchema,
  opened_at: TimestampSchema.nullable(),
  closed_at: TimestampSchema.nullable(),
});

export const NeedRowSchema = z.object({
  id: UuidSchema,
  case_id: UuidSchema.nullable(),
  category: NeedCategorySchema,
  description: z.string().nullable(),
  urgency: UrgencyLevelSchema,
  status: z.string(),
  created_at: TimestampSchema.nullable(),
});

export const ReferralRowSchema = z.object({
  id: UuidSchema,
  case_id: UuidSchema.nullable(),
  need_id: UuidSchema.nullable(),
  provider_id: UuidSchema.nullable(),
  status: ReferralStatusSchema,
  notes: z.string().nullable(),
  created_at: TimestampSchema.nullable(),
});

export const FollowUpRowSchema = z.object({
  id: UuidSchema,
  case_id: UuidSchema.nullable(),
  description: z.string(),
  due_at: TimestampSchema.nullable(),
  assigned_to: z.string().nullable(),
  status: z.string(),
  created_at: TimestampSchema.nullable(),
});

export const PromptVersionRowSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  version: z.string(),
  system_prompt: z.string(),
  params: JsonValueSchema.nullable(),
  created_at: TimestampSchema.nullable(),
});

export const CallSessionRowSchema = z.object({
  id: UuidSchema,
  case_id: UuidSchema.nullable(),
  person_id: UuidSchema.nullable(),
  channel: ChannelTypeSchema,
  prompt_version_id: UuidSchema.nullable(),
  twilio_call_sid: z.string().nullable(),
  disposition: z.string().nullable(),
  started_at: TimestampSchema.nullable(),
  ended_at: TimestampSchema.nullable(),
});

export const TranscriptTurnSchema = z.object({
  index: z.number().int().nonnegative(),
  speaker: z.enum(["caller", "agent", "operator", "tool", "system"]),
  text: z.string(),
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().optional(),
});

export const TranscriptRowSchema = z.object({
  id: UuidSchema,
  call_session_id: UuidSchema.nullable(),
  turns: z.array(TranscriptTurnSchema),
  redacted: z.boolean(),
  ttl_expires_at: TimestampSchema.nullable(),
});

export const EnrichmentResultRowSchema = z.object({
  id: UuidSchema,
  call_session_id: UuidSchema.nullable(),
  summary: z.string().nullable(),
  urgency_overall: UrgencyLevelSchema.nullable(),
  completion_status: z.string().nullable(),
  entities: JsonValueSchema.nullable(),
  topics: JsonValueSchema.nullable(),
  blockers: JsonValueSchema.nullable(),
  requires_human_followup: z.boolean().nullable(),
  model: z.string().nullable(),
  created_at: TimestampSchema.nullable(),
});

export const CallMetricsRowSchema = z.object({
  id: UuidSchema,
  call_session_id: UuidSchema.nullable(),
  prompt_version_id: UuidSchema.nullable(),
  interruption_count: z.number().int().nullable(),
  mean_turn_latency_ms: z.number().int().nullable(),
  entity_capture_rate: z.coerce.number().nullable(),
  completion: z.boolean().nullable(),
  failure_mode: z.string().nullable(),
  created_at: TimestampSchema.nullable(),
});

export const AuditLogRowSchema = z.object({
  id: UuidSchema,
  actor: z.string(),
  action: z.string(),
  entity: z.string(),
  entity_id: UuidSchema.nullable(),
  meta: JsonValueSchema.nullable(),
  at: TimestampSchema.nullable(),
});

export const CaseListRowSchema = z.object({
  id: UuidSchema,
  person_id: UuidSchema.nullable(),
  status: CaseStatusSchema,
  priority: UrgencyLevelSchema,
  opened_at: TimestampSchema.nullable(),
  closed_at: TimestampSchema.nullable(),
  person_summary: z.string(),
  latest_needs_count: z.number().int().nonnegative(),
});

export const CaseDetailSchema = z.object({
  case: CaseRowSchema,
  person: PersonRowSchema.nullable(),
  needs: z.array(NeedRowSchema),
  referrals: z.array(ReferralRowSchema),
  followUps: z.array(FollowUpRowSchema),
  transcripts: z.array(TranscriptRowSchema),
  enrichments: z.array(EnrichmentResultRowSchema),
});

export const FleetMetricsRowSchema = z.object({
  prompt_version_id: UuidSchema,
  prompt_name: z.string(),
  prompt_version: z.string(),
  total_calls: z.number().int().nonnegative(),
  completion_rate: z.coerce.number(),
  mean_turn_latency_ms: z.coerce.number().nullable(),
  entity_capture_rate: z.coerce.number().nullable(),
  failure_modes: z.record(z.coerce.number().int().nonnegative()),
});

export type ProviderRow = z.infer<typeof ProviderRowSchema>;
export type PersonRow = z.infer<typeof PersonRowSchema>;
export type ConsentRecordRow = z.infer<typeof ConsentRecordRowSchema>;
export type CaseRow = z.infer<typeof CaseRowSchema>;
export type NeedRow = z.infer<typeof NeedRowSchema>;
export type ReferralRow = z.infer<typeof ReferralRowSchema>;
export type FollowUpRow = z.infer<typeof FollowUpRowSchema>;
export type PromptVersionRow = z.infer<typeof PromptVersionRowSchema>;
export type CallSessionRow = z.infer<typeof CallSessionRowSchema>;
export type TranscriptTurn = z.infer<typeof TranscriptTurnSchema>;
export type TranscriptRow = z.infer<typeof TranscriptRowSchema>;
export type EnrichmentResultRow = z.infer<typeof EnrichmentResultRowSchema>;
export type CallMetricsRow = z.infer<typeof CallMetricsRowSchema>;
export type AuditLogRow = z.infer<typeof AuditLogRowSchema>;
export type CaseListRow = z.infer<typeof CaseListRowSchema>;
export type CaseDetail = z.infer<typeof CaseDetailSchema>;
export type FleetMetricsRow = z.infer<typeof FleetMetricsRowSchema>;
