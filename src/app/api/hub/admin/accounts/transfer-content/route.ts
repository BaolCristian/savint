import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";
import { getSystemHubAccount } from "@/lib/hub/system-account";

/**
 * Reassign all of a teacher's published quizzes to the neutral SAVINT account,
 * so content survives when the teacher/school leaves. The displayed author
 * becomes "SAVINT" because it derives from HubAccount.name.
 */
export async function POST(req: NextRequest) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const email = String((body as { email?: unknown })?.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "invalid_email" }, { status: 400 });

  const savint = await getSystemHubAccount();
  if (!savint) return NextResponse.json({ error: "system_account_missing" }, { status: 409 });

  const teacher = await prisma.hubAccount.findUnique({ where: { email } });
  if (!teacher) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (teacher.id === savint.id) {
    return NextResponse.json({ error: "cannot_transfer_self" }, { status: 400 });
  }

  const { count } = await prisma.hubQuiz.updateMany({
    where: { hubAccountId: teacher.id },
    data: { hubAccountId: savint.id },
  });
  return NextResponse.json({ ok: true, moved: count });
}
