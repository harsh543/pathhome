import { z } from "zod";
import {
  CaseStatusSchema,
  ChannelTypeSchema,
  JsonObjectSchema,
  JsonValueSchema,
  NeedCategorySchema,
  ReferralStatusSchema,
  TranscriptTurnSchema,
  UrgencyLevelSchema,
  UuidSchema,
} from "./db";
import { CompletionStatusSchema } from "./enrichment";

const ActorSchema = z.string().min(1).max(120);

export const AuditMetaSchema = JsonObjectSchema.optional();

export const CreateCaseInputSchema = z.object({
  actor: ActorSchema,
  personId: UuidSchema.nullable().optional(),
  status: CaseStatusSchema.optional(),
  priority: UrgencyLevelSchema.optional(),
  auditMeta: AuditMetaSchema,
});

export const AddNeedInputSchema = z.object({
  actor: ActorSchema,
  caseId: UuidSchema,
  category: NeedCategorySchema,
  description: z.string().min(1).nullable().optional(),
  urgency: UrgencyLevelSchema.optional(),
  status: z.string().min(1).optional(),
  auditMeta: AuditMetaSchema,
});

export const CreateReferralInputSchema = z.object({
  actor: ActorSchema,
  caseId: UuidSchema,
  needId: UuidSchema.nullable().optional(),
  providerId: UuidSchema.nullable().optional(),
  status: ReferralStatusSchema.optional(),
  notes: z.string().nullable().optional(),
  auditMeta: AuditMetaSchema,
});

export const CreateFollowUpInputSchema = z.object({
  actor: ActorSchema,
  caseId: UuidSchema,
  description: z.string().min(1),
  dueAt: z.coerce.date().nullable().optional(),
  assignedTo: z.string().nullable().optional(),
  status: z.string().min(1).optional(),
  auditMeta: AuditMetaSchema,
});

export const SaveTranscriptInputSchema = z.object({
  actor: ActorSchema,
  callSessionId: UuidSchema,
  turns: z.array(TranscriptTurnSchema),
  redacted: z.boolean().default(true),
  ttlExpiresAt: z.coerce.date().nullable().optional(),
  auditMeta: AuditMetaSchema,
});

export const SaveEnrichmentInputSchema = z.object({
  actor: ActorSchema,
  callSessionId: UuidSchema,
  summary: z.string().nullable().optional(),
  urgencyOverall: UrgencyLevelSchema.nullable().optional(),
  completionStatus: CompletionStatusSchema.nullable().optional(),
  entities: JsonValueSchema.nullable().optional(),
  topics: JsonValueSchema.nullable().optional(),
  blockers: JsonValueSchema.nullable().optional(),
  requiresHumanFollowup: z.boolean().nullable().optional(),
  model: z.string().nullable().optional(),
  auditMeta: AuditMetaSchema,
});

export const SaveMetricsInputSchema = z.object({
  actor: ActorSchema,
  callSessionId: UuidSchema,
  promptVersionId: UuidSchema.nullable().optional(),
  interruptionCount: z.number().int().nonnegative().nullable().optional(),
  meanTurnLatencyMs: z.number().int().nonnegative().nullable().optional(),
  entityCaptureRate: z.number().min(0).max(1).nullable().optional(),
  completion: z.boolean().nullable().optional(),
  failureMode: z.enum(["address_capture", "interruption_loop", "over_collection", "none"]).nullable().optional(),
  auditMeta: AuditMetaSchema,
});

export const CreatePersonInputSchema = z.object({
  actor: ActorSchema,
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  preferredContact: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  auditMeta: AuditMetaSchema,
});

export const RecordConsentInputSchema = z.object({
  actor: ActorSchema,
  personId: UuidSchema,
  scope: z.string().min(1),
  granted: z.boolean(),
  method: z.enum(["verbal", "written"]),
  auditMeta: AuditMetaSchema,
});

export const GetCaseDetailInputSchema = z.object({
  caseId: UuidSchema,
});

export const BrowserCallSessionInputSchema = z.object({
  caseId: UuidSchema.nullable().optional(),
  personId: UuidSchema.nullable().optional(),
  channel: ChannelTypeSchema.default("browser"),
  promptVersionId: UuidSchema.nullable().optional(),
});

export type CreateCaseInput = z.infer<typeof CreateCaseInputSchema>;
export type AddNeedInput = z.infer<typeof AddNeedInputSchema>;
export type CreateReferralInput = z.infer<typeof CreateReferralInputSchema>;
export type CreateFollowUpInput = z.infer<typeof CreateFollowUpInputSchema>;
export type SaveTranscriptInput = z.infer<typeof SaveTranscriptInputSchema>;
export type SaveEnrichmentInput = z.infer<typeof SaveEnrichmentInputSchema>;
export type SaveMetricsInput = z.infer<typeof SaveMetricsInputSchema>;
export type CreatePersonInput = z.infer<typeof CreatePersonInputSchema>;
export type RecordConsentInput = z.infer<typeof RecordConsentInputSchema>;
export type GetCaseDetailInput = z.infer<typeof GetCaseDetailInputSchema>;
export type BrowserCallSessionInput = z.infer<typeof BrowserCallSessionInputSchema>;
