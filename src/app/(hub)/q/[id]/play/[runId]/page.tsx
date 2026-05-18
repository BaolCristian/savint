import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { PracticeRunner } from "@/components/hub/practice-runner";

export const dynamic = "force-dynamic";

export default async function PracticePlayPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;

  const run = await prisma.practiceRun.findUnique({
    where: { id: runId },
    include: {
      hubQuiz: {
        include: {
          hubAccount: { select: { id: true, name: true } },
        },
      },
    },
  });

  // 404 if run is missing, expired, or belongs to a different quiz
  if (!run || run.hubQuizId !== id) {
    notFound();
  }

  if (run.expiresAt < new Date()) {
    notFound();
  }

  const quiz = run.hubQuiz;
  if (!quiz || quiz.suspended || quiz.unpublishedAt) {
    notFound();
  }

  const authorName = quiz.hubAccount.name ?? "Anonymous";

  return (
    <PracticeRunner
      quizId={id}
      runId={runId}
      title={quiz.title}
      authorName={authorName}
      questionCount={quiz.questionCount}
    />
  );
}
