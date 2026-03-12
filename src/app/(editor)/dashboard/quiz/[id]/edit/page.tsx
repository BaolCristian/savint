import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { QuizEditor } from "@/components/quiz/quiz-editor";
import type { QuestionInput } from "@/lib/validators/quiz";

export default async function EditQuizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const { id } = await params;

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { order: "asc" } },
    },
  });

  if (!quiz || quiz.authorId !== session.user.id) notFound();

  const initialData = {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description ?? undefined,
    isPublic: quiz.isPublic,
    tags: quiz.tags,
    questions: quiz.questions.map((q) => ({
      type: q.type,
      text: q.text,
      mediaUrl: q.mediaUrl ?? undefined,
      timeLimit: q.timeLimit,
      points: q.points,
      order: q.order,
      confidenceEnabled: q.confidenceEnabled,
      options: q.options as QuestionInput["options"],
    })),
  };

  const hasConsent = !!(await prisma.consent.findFirst({
    where: { userId: session.user.id, type: "QUIZ_PUBLISH_DECLARATION" },
  }));

  return <QuizEditor initialData={initialData} hasConsent={hasConsent} />;
}
