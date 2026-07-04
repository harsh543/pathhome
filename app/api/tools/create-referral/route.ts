// POST /api/tools/create-referral
// Consent-gated: fails closed (409) if the case has no granted referral-scope
// consent record. The blocked attempt is audited regardless of the rollback.
import { NextResponse } from "next/server";
import { createReferral } from "@/lib/db/queries";
import { ReferralRowSchema } from "@/lib/schemas/db";
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
    const referral = await createReferral(raw);
    console.log(
      JSON.stringify({
        level: "info",
        event: "tool_create_referral",
        referralId: referral.id,
        caseId: referral.case_id,
        providerId: referral.provider_id,
        status: referral.status,
      }),
    );
    return NextResponse.json(ReferralRowSchema.parse(referral));
  } catch (err) {
    return handleToolError(err, "tool_create_referral_error");
  }
}
