import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { quizSchema } from "@/lib/validators/quiz";

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

  const { questions, ...quizData } = parsed.data;

  try {
    // Delete answers first to avoid FK constraint violation
    await prisma.answer.deleteMany({
      where: { question: { quizId: id } },
    });
    await prisma.question.deleteMany({ where: { quizId: id } });

    const updated = await prisma.quiz.update({
      where: { id },
      data: {
        ...quizData,
        questions: {
          create: questions.map((q, i) => {
            const { order: _order, ...rest } = q;
            return { ...rest, order: i };
          }),
        },
      },
      include: { questions: true },
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

  // Delete sessions and their answers first (no cascade on Session → Quiz)
  await prisma.answer.deleteMany({
    where: { session: { quizId: id } },
  });
  await prisma.session.deleteMany({ where: { quizId: id } });
  await prisma.quiz.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
