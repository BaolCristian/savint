import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";
import { sendEmail } from "@/lib/email/send";
import { accountBannedTemplate } from "@/lib/email/templates/account-banned";

const Body = z.object({ reason: z.string().min(1).max(500) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const target = await prisma.hubAccount.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.$transaction([
    prisma.hubAccount.update({ where: { id }, data: { bannedAt: new Date() } }),
    prisma.hubQuiz.updateMany({
      where: { hubAccountId: id },
      data: { suspended: true, suspendedReason: `Author banned: ${body.data.reason}` },
    }),
  ]);

  await sendEmail({
    to: target.email,
    subject: accountBannedTemplate.subject("it"),
    text: accountBannedTemplate.body(
      { reason: body.data.reason, appealEmail: "support@savint.it" },
      "it",
    ),
  });

  return NextResponse.json({ ok: true });
}
