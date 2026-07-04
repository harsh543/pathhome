// POST /api/enrich/[sessionId]
// Triggers the durable enrichCall workflow for a completed call session.
// Called by the VoiceClient after a call ends (optionally with raw turns).
// Returns immediately with a runId — enrichment happens asynchronously.

import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { z } from "zod";
import { UuidSchema } from "@/lib/schemas/db";
import { serializeError } from "@/lib/db/errors";
import { enrichCall, type WorkflowTurn } from "@/lib/workflows/enrich-call";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  turns: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        speaker: z.string().min(1),
        text: z.string(),
      }),
    )
    .optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  const { sessionId } = await params;

  if (!UuidSchema.safeParse(sessionId).success) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  let body: z.infer<typeof BodySchema> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    body = BodySchema.parse(raw);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof z.ZodError ? err.flatten() : "Invalid JSON" },
      { status: 400 },
    );
  }

  try {
    const run = await start(enrichCall, [
      sessionId,
      body.turns as WorkflowTurn[] | undefined,
    ]);

    console.log(
      JSON.stringify({
        level: "info",
        event: "enrich_workflow_started",
        sessionId,
        runId: run.runId,
      }),
    );

    return NextResponse.json({ runId: run.runId, sessionId });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "enrich_workflow_start_error",
        sessionId,
        error: serializeError(err),
      }),
    );
    return NextResponse.json({ error: "Failed to start enrichment workflow" }, { status: 500 });
  }
}
