import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

/** Public endpoint: returns a quiz with full question options (solutions included)
 *  so it can be played in solo self-practice mode. Only quizzes marked
 *  isPublic=true and not suspended are accessible. No auth required. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { order: "asc" } },
      author: { select: { name: true } },
    },
  });

  if (!quiz || !quiz.isPublic || quiz.suspended) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    authorName: quiz.author.name ?? "Anonimo",
    questions: quiz.questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      mediaUrl: q.mediaUrl,
      timeLimit: q.timeLimit,
      points: q.points,
      options: q.options,
      order: q.order,
    })),
  });
}
