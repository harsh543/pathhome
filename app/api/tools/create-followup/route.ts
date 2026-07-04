// POST /api/tools/create-followup
// Schedules a human caseworker follow-up task for a case.
import { NextResponse } from "next/server";
import { createFollowUp } from "@/lib/db/queries";
import { FollowUpRowSchema } from "@/lib/schemas/db";
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
    const followUp = await createFollowUp(raw);
    console.log(
      JSON.stringify({
        level: "info",
        event: "tool_create_followup",
        followUpId: followUp.id,
        caseId: followUp.case_id,
        dueAt: followUp.due_at,
      }),
    );
    return NextResponse.json(FollowUpRowSchema.parse(followUp));
  } catch (err) {
    return handleToolError(err, "tool_create_followup_error");
  }
}
