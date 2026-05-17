import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { quizSchema } from "@/lib/validators/quiz";
import { CURRENT_DECLARATION_VERSION } from "@/lib/config/legal";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const quizzes = await prisma.quiz.findMany({
    where: {
      OR: [
        { authorId: session.user.id },
        { shares: { some: { sharedWithId: session.user.id } } },
      ],
    },
    include: { _count: { select: { questions: true, sessions: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(quizzes);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = quizSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { questions, consentAccepted, license, ...quizData } = parsed.data;

  if (!consentAccepted)
    return NextResponse.json({ error: "Consent is required" }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const quiz = await tx.quiz.create({
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
          authorId: session.user!.id!,
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
          metadata: { quizId: quiz.id },
        },
      });

      return quiz;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("POST /api/quiz error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Database error" },
      { status: 500 },
    );
  }
}
