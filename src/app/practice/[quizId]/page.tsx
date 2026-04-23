import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { PracticeView } from "@/components/practice/practice-view";
import type { QuestionOptions } from "@/types";

export default async function PracticePage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = await params;

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      questions: { orderBy: { order: "asc" } },
      author: { select: { name: true } },
    },
  });

  if (!quiz || !quiz.isPublic || quiz.suspended) notFound();

  const data = {
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
      options: q.options as unknown as QuestionOptions,
      order: q.order,
    })),
  };

  return <PracticeView quiz={data} />;
}
