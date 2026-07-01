import { NextRequest, NextResponse } from "next/server";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";
import { approve } from "@/lib/hub/affiliation";
import { sendAffiliationCodeEmail } from "@/lib/email/affiliation-emails";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const r = await approve(id, guard.account.id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  await sendAffiliationCodeEmail({ to: r.contactEmail, schoolName: r.schoolName, setupCode: r.setupCode });
  return NextResponse.json({ ok: true });
}
