// POST /api/tools/log-need
// Called by the voice agent to record a caller need inside an active case.
// Input validated by AddNeedInputSchema (Zod). Parameterized SQL only — input
// treated as data, never interpolated.
import { NextResponse } from "next/server";
import { addNeed } from "@/lib/db/queries";
import { NeedRowSchema } from "@/lib/schemas/db";
import { handleToolError } from "@/lib/api/handle-tool-error";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const need = await addNeed(raw);
    console.log(
      JSON.stringify({
        level: "info",
        event: "tool_log_need",
        needId: need.id,
        caseId: need.case_id,
        category: need.category,
        urgency: need.urgency,
      }),
    );
    return NextResponse.json(NeedRowSchema.parse(need));
  } catch (err) {
    return handleToolError(err, "tool_log_need_error");
  }
}
