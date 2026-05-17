import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { quizSchema } from "@/lib/validators/quiz";
import { CURRENT_DECLARATION_VERSION } from "@/lib/config/legal";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { order: "asc" } },
      author: { select: { name: true, email: true } },
    },
  });

  if (!quiz) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(quiz);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const quiz = await prisma.quiz.findUnique({ where: { id } });
  if (!quiz || quiz.authorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = quizSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { questions, consentAccepted, license, ...quizData } = parsed.data;

  if (!consentAccepted)
    return NextResponse.json({ error: "Consent is required" }, { status: 400 });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.answer.deleteMany({
        where: { question: { quizId: id } },
      });
      await tx.question.deleteMany({ where: { quizId: id } });

      const result = await tx.quiz.update({
        where: { id },
        data: {
          title: quizData.title,
          description: quizData.description ?? null,
          isPublic: quizData.isPublic,
          tags: quizData.tags,
          license: license ?? "CC_BY",
          schoolLevel: quizData.schoolLevel ?? null,
          subject: quizData.subject ?? null,
          language: quizData.language ?? null,
          ageMin: quizData.ageMin ?? null,
          ageMax: quizData.ageMax ?? null,
          questions: {
            create: questions.map((q, i) => {
              const { order: _order, ...rest } = q;
              return { ...rest, order: i };
            }),
          },
        },
        include: { questions: true },
      });

      await tx.consent.create({
        data: {
          userId: session.user!.id!,
          type: "QUIZ_PUBLISH_DECLARATION",
          version: CURRENT_DECLARATION_VERSION,
          metadata: { quizId: id },
        },
      });

      return result;
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("PUT /api/quiz error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Database error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const quiz = await prisma.quiz.findUnique({ where: { id } });
  if (!quiz || quiz.authorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.answer.deleteMany({
    where: { session: { quizId: id } },
  });
  await prisma.session.deleteMany({ where: { quizId: id } });
  await prisma.quiz.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
