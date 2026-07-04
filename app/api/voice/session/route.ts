// POST /api/voice/session
// Mints a short-lived AssemblyAI realtime token (API key never leaves the server),
// creates a call_sessions row, and returns session metadata to the browser client.
// When ASSEMBLYAI_API_KEY is absent the route returns mode:"mock" so local dev
// can run the scripted-turn demo without credentials.

import { NextResponse } from "next/server";
import { z } from "zod";
import { pool, withTransaction } from "@/lib/db/client";
import { serializeError } from "@/lib/db/errors";
import { CallSessionRowSchema, UuidSchema } from "@/lib/schemas/db";
import { BrowserCallSessionInputSchema } from "@/lib/schemas/tools";
import {
  buildSessionConfig,
  INTAKE_KEYTERMS,
  mintRealtimeToken,
} from "@/lib/voice/assemblyai";

export const dynamic = "force-dynamic";

const LiveResponseSchema = z.object({
  mode: z.literal("live"),
  sessionId: UuidSchema,
  wsUrl: z.string(),
  keyterms: z.array(z.string()),
  systemPrompt: z.string(),
  expiresAt: z.string().datetime(),
});

const MockResponseSchema = z.object({
  mode: z.literal("mock"),
  sessionId: UuidSchema,
  keyterms: z.array(z.string()),
  systemPrompt: z.string(),
});

export type VoiceSessionResponse =
  | z.infer<typeof LiveResponseSchema>
  | z.infer<typeof MockResponseSchema>;

export async function POST(req: Request): Promise<NextResponse> {
  // Parse + validate request body
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BrowserCallSessionInputSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }
  const input = parsed.data;

  try {
    // Resolve the active prompt version (latest by created_at)
    const pvResult = await pool.query<{ id: string; system_prompt: string }>(
      `select id, system_prompt from prompt_versions order by created_at desc limit 1`,
    );
    const pv = pvResult.rows[0];
    if (!pv) {
      return NextResponse.json({ error: "No prompt version configured" }, { status: 503 });
    }

    const promptVersionId = input.promptVersionId ?? pv.id;
    const mockMode = !process.env.ASSEMBLYAI_API_KEY;

    // Create call_sessions row + audit in one transaction
    const session = await withTransaction(async (client) => {
      const row = await client.query(
        `insert into call_sessions (case_id, person_id, channel, prompt_version_id)
         values ($1, $2, $3, $4)
         returning *`,
        [input.caseId ?? null, input.personId ?? null, input.channel, promptVersionId],
      );
      const created = CallSessionRowSchema.parse(row.rows[0]);

      await client.query(
        `insert into audit_log (actor, action, entity, entity_id, meta)
         values ($1, $2, $3, $4, $5::jsonb)`,
        [
          "voice-session-api",
          "create_call_session",
          "call_sessions",
          created.id,
          JSON.stringify({ channel: input.channel, mockMode }),
        ],
      );

      return created;
    });

    if (mockMode) {
      const body = MockResponseSchema.parse({
        mode: "mock",
        sessionId: session.id,
        keyterms: INTAKE_KEYTERMS,
        systemPrompt: pv.system_prompt,
      });
      console.log(
        JSON.stringify({
          level: "info",
          event: "voice_session_created",
          mode: "mock",
          sessionId: session.id,
        }),
      );
      return NextResponse.json(body);
    }

    // Live mode: mint a short-lived token so the API key stays server-side
    const TOKEN_TTL_SEC = 300;
    const tokenResp = await mintRealtimeToken({ expiresIn: TOKEN_TTL_SEC });
    const config = buildSessionConfig(tokenResp.token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SEC * 1000).toISOString();

    const body = LiveResponseSchema.parse({
      mode: "live",
      sessionId: session.id,
      wsUrl: config.wsUrl,
      keyterms: config.keyterms,
      systemPrompt: pv.system_prompt,
      expiresAt,
    });

    console.log(
      JSON.stringify({
        level: "info",
        event: "voice_session_created",
        mode: "live",
        sessionId: session.id,
        expiresAt,
      }),
    );

    return NextResponse.json(body);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "voice_session_error",
        error: serializeError(error),
      }),
    );
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
