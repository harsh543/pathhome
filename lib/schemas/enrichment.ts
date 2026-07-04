import { z } from "zod";
import { NeedCategorySchema, UrgencyLevelSchema } from "./db";

export const CompletionStatusSchema = z.enum(["complete", "partial", "dropped"]);

export const ExtractedNeedSchema = z.object({
  category: NeedCategorySchema,
  description: z.string().min(1),
  urgency: UrgencyLevelSchema,
  evidence_turn: z.number().int().nonnegative().nullable(),
});

export const EnrichmentExtractionSchema = z.object({
  summary: z.string(),
  person: z.object({
    first_name: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  needs: z.array(ExtractedNeedSchema),
  entities: z.object({
    neighborhoods: z.array(z.string()),
    appointment_dates: z.array(z.string()),
    provider_mentions: z.array(z.string()),
    caseworker: z.string().nullable(),
  }),
  topics: z.array(z.string()),
  urgency_overall: UrgencyLevelSchema,
  completion_status: CompletionStatusSchema,
  blockers: z.array(z.string()),
  requires_human_followup: z.boolean(),
});

export type CompletionStatus = z.infer<typeof CompletionStatusSchema>;
export type ExtractedNeed = z.infer<typeof ExtractedNeedSchema>;
export type EnrichmentExtraction = z.infer<typeof EnrichmentExtractionSchema>;
