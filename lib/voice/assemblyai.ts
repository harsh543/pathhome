// AssemblyAI Streaming Transcription adapter — server-side only.
// Docs: https://www.assemblyai.com/docs/speech-to-text/streaming
//
// All API surface below is marked TODO(verify-docs) where the exact field name,
// endpoint path, or protocol detail could not be confirmed without a live account.
// Swap this adapter if the real SDK diverges.

import { z } from "zod";

const ASSEMBLYAI_API_BASE = "https://api.assemblyai.com";

// TODO(verify-docs): confirm token endpoint is /v2/realtime/token (not /v3/...)
const TOKEN_PATH = "/v2/realtime/token";

// TODO(verify-docs): confirm WebSocket base URL and that token goes in query string
const WS_BASE = "wss://api.assemblyai.com/v2/realtime/ws";

// ── Token mint ────────────────────────────────────────────────────────────────

export const RealtimeTokenResponseSchema = z.object({
  // TODO(verify-docs): confirm response field is "token" (not "session_token")
  token: z.string().min(1),
});
export type RealtimeTokenResponse = z.infer<typeof RealtimeTokenResponseSchema>;

export interface MintTokenOptions {
  /** Lifetime in seconds; defaults to 300 (5 min). */
  expiresIn?: number;
}

export async function mintRealtimeToken(
  opts: MintTokenOptions = {},
): Promise<RealtimeTokenResponse> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY is not set");

  const res = await fetch(`${ASSEMBLYAI_API_BASE}${TOKEN_PATH}`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    // TODO(verify-docs): confirm body field is "expires_in" (integer, seconds)
    body: JSON.stringify({ expires_in: opts.expiresIn ?? 300 }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    throw new Error(`AssemblyAI token mint failed ${res.status}: ${body}`);
  }

  const json: unknown = await res.json();
  return RealtimeTokenResponseSchema.parse(json);
}

// ── Session config ────────────────────────────────────────────────────────────

// Reentry/housing vocabulary that boosts ASR accuracy.
// TODO(verify-docs): confirm the WS connect message field is "word_boost" (string[])
export const INTAKE_KEYTERMS: string[] = [
  "probation",
  "parole",
  "reentry",
  "caseworker",
  "shelter",
  "intake",
  "housing",
  "transportation",
  "employment",
  "benefits",
  "voucher",
];

export interface AssemblyAISessionConfig {
  token: string;
  /** Fully-qualified WSS URL; token embedded as query param. */
  wsUrl: string;
  keyterms: string[];
}

export function buildSessionConfig(
  token: string,
  sampleRate = 16000,
): AssemblyAISessionConfig {
  // TODO(verify-docs): confirm sample_rate is a query param vs sent in first WS message
  const wsUrl = `${WS_BASE}?sample_rate=${sampleRate}&token=${encodeURIComponent(token)}`;
  return { token, wsUrl, keyterms: INTAKE_KEYTERMS };
}

// ── Inbound WebSocket message types ──────────────────────────────────────────
// TODO(verify-docs): confirm these message_type enum values exactly

export const SessionBeginsSchema = z.object({
  message_type: z.literal("SessionBegins"),
  session_id: z.string().optional(),
  expires_at: z.string().optional(),
});

export const PartialTranscriptSchema = z.object({
  message_type: z.literal("PartialTranscript"),
  text: z.string(),
  audio_start: z.number().int().optional(),
  audio_end: z.number().int().optional(),
});

export const FinalTranscriptSchema = z.object({
  message_type: z.literal("FinalTranscript"),
  text: z.string(),
  audio_start: z.number().int().optional(),
  audio_end: z.number().int().optional(),
  punctuated: z.boolean().optional(),
});

export const SessionTerminatedSchema = z.object({
  message_type: z.literal("SessionTerminated"),
});

export const InboundMessageSchema = z.discriminatedUnion("message_type", [
  SessionBeginsSchema,
  PartialTranscriptSchema,
  FinalTranscriptSchema,
  SessionTerminatedSchema,
]);

export type InboundMessage = z.infer<typeof InboundMessageSchema>;

// ── Outbound message ──────────────────────────────────────────────────────────

// TODO(verify-docs): confirm terminate_session is the correct field to close session
export const TERMINATE_SESSION_MSG = JSON.stringify({ terminate_session: true });
