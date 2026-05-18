import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { extractQuestionPreviews } from "@/lib/hub/qlz-preview";
import { HubQuizDetail } from "@/components/hub/hub-quiz-detail";
import { SuspendedBanner } from "@/components/hub/suspended-banner";

export const dynamic = "force-dynamic";

export default async function HubQuizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const quiz = await prisma.hubQuiz.findUnique({
    where: { id },
    include: {
      hubAccount: {
        select: { id: true, name: true, email: true, affiliation: true },
      },
    },
  });

  if (!quiz) {
    notFound();
  }

  if (quiz.suspended) {
    return (
      <main className="max-w-3xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">{quiz.title}</h1>
        <SuspendedBanner reason={quiz.suspendedReason} />
      </main>
    );
  }

  const questions = await extractQuestionPreviews(Buffer.from(quiz.payloadBlob));

  const data = {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    tags: quiz.tags,
    license: quiz.license as "CC_BY" | "CC_BY_SA",
    schoolLevel: quiz.schoolLevel ?? null,
    subject: quiz.subject,
    language: quiz.language,
    ageMin: quiz.ageMin,
    ageMax: quiz.ageMax,
    questionCount: quiz.questionCount,
    downloadsCount: quiz.downloadsCount,
    playsCount: quiz.playsCount,
    publishedAt: quiz.publishedAt.toISOString(),
    updatedAt: quiz.updatedAt.toISOString(),
    version: quiz.version,
    suspended: quiz.suspended,
    author: quiz.hubAccount.name ?? "Anonymous",
    authorId: quiz.hubAccount.id,
    authorAffiliation: quiz.hubAccount.affiliation,
  };

  return <HubQuizDetail quiz={data} questions={questions} />;
}
