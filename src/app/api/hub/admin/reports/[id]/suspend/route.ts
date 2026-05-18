import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";
import { sendEmail } from "@/lib/email/send";
import { quizSuspendedTemplate } from "@/lib/email/templates/quiz-suspended";

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

  const report = await prisma.hubReport.findUnique({
    where: { id },
    include: { hubQuiz: { include: { hubAccount: true } } },
  });
  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (report.status !== "PENDING") {
    return NextResponse.json({ ok: true, alreadyResolved: true });
  }

  await prisma.$transaction([
    prisma.hubQuiz.update({
      where: { id: report.hubQuizId },
      data: { suspended: true, suspendedReason: body.data.reason },
    }),
    prisma.hubReport.update({
      where: { id },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedBy: guard.account.id },
    }),
  ]);

  const author = report.hubQuiz.hubAccount;
  const locale = "it"; // future: store per-account locale
  try {
    await sendEmail({
      to: author.email,
      subject: quizSuspendedTemplate.subject(locale),
      text: quizSuspendedTemplate.body(
        {
          quizTitle: report.hubQuiz.title,
          reason: body.data.reason,
          appealEmail: "support@savint.it",
        },
        locale,
      ),
    });
  } catch (err) {
    console.error("[hub.admin.suspend] email send failed", err);
  }

  return NextResponse.json({ ok: true });
}
