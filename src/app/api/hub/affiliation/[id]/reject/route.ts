import { NextRequest, NextResponse } from "next/server";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";
import { reject } from "@/lib/hub/affiliation";
import { sendAffiliationRejectEmail } from "@/lib/email/affiliation-emails";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const r = await reject(id, guard.account.id, body.reason);
  if (!r.ok) return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  await sendAffiliationRejectEmail({ to: r.contactEmail, schoolName: r.schoolName, reason: body.reason });
  return NextResponse.json({ ok: true });
}
