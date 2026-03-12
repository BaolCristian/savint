import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { CURRENT_DECLARATION_VERSION } from "@/lib/config/legal";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { quizId, consentAccepted, license } = await req.json();
  if (!quizId)
    return NextResponse.json({ error: "quizId required" }, { status: 400 });

  if (!consentAccepted)
    return NextResponse.json({ error: "Consent is required" }, { status: 400 });

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  if (!quiz)
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

  if (quiz.authorId !== session.user.id && !quiz.isPublic) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.quiz.create({
      data: {
        title: `${quiz.title} (copia)`,
        description: quiz.description,
        authorId: session.user!.id!,
        isPublic: false,
        tags: quiz.tags,
        license: license ?? "CC_BY",
        questions: {
          create: quiz.questions.map((q) => ({
            type: q.type,
            text: q.text,
            timeLimit: q.timeLimit,
            points: q.points,
            confidenceEnabled: q.confidenceEnabled,
            mediaUrl: q.mediaUrl,
            order: q.order,
            options: q.options as any,
          })),
        },
      },
      include: { questions: true },
    });

    await tx.consent.create({
      data: {
        userId: session.user!.id!,
        type: "QUIZ_PUBLISH_DECLARATION",
        version: CURRENT_DECLARATION_VERSION,
        metadata: { quizId: created.id },
      },
    });

    return created;
  });

  return NextResponse.json(copy, { status: 201 });
}
