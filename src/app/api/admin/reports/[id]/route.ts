import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["REVIEWED", "RESOLVED", "DISMISSED"]),
  suspendQuiz: z.boolean().optional(),
  deleteQuiz: z.boolean().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, status, session } = await assertAdmin();
  if (error) return NextResponse.json({ error }, { status: status! });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const report = await prisma.report.findUnique({
    where: { id },
    include: { quiz: true },
  });
  if (!report)
    return NextResponse.json({ error: "Report not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.report.update({
      where: { id },
      data: {
        status: parsed.data.status,
        resolvedAt: ["RESOLVED", "DISMISSED"].includes(parsed.data.status) ? new Date() : undefined,
        resolvedBy: ["RESOLVED", "DISMISSED"].includes(parsed.data.status) ? session!.user!.id : undefined,
      },
    });

    if (parsed.data.suspendQuiz && report.quiz) {
      await tx.quiz.update({
        where: { id: report.quiz.id },
        data: { suspended: true },
      });
    }

    if (parsed.data.deleteQuiz && report.quiz) {
      await tx.answer.deleteMany({ where: { session: { quizId: report.quiz.id } } });
      await tx.session.deleteMany({ where: { quizId: report.quiz.id } });
      await tx.quiz.delete({ where: { id: report.quiz.id } });
    }
  });

  return NextResponse.json({ ok: true });
}
