// Shared tool-route error handler. All tool endpoints use this to produce
// consistent JSON error shapes and structured log lines.
import { NextResponse } from "next/server";
import { z } from "zod";
import { serializeError } from "@/lib/db/errors";
import { isConsentRequiredError } from "@/lib/db/queries";

export function handleToolError(err: unknown, event: string): NextResponse {
  if (err instanceof z.ZodError) {
    return NextResponse.json({ error: err.flatten() }, { status: 422 });
  }
  if (isConsentRequiredError(err)) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.status },
    );
  }
  console.error(
    JSON.stringify({ level: "error", event, error: serializeError(err) }),
  );
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
