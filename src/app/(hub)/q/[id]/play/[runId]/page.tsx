import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db/client";
import { PracticeView } from "@/components/practice/practice-view";
import { loadManifest, manifestToPracticeQuiz } from "@/lib/hub/manifest-practice";

export const dynamic = "force-dynamic";

export default async function PracticePlayPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const t = await getTranslations("practice");

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

  const hubQuiz = run.hubQuiz;
  if (!hubQuiz || hubQuiz.suspended || hubQuiz.unpublishedAt) {
    notFound();
  }

  // The .qlz payload contains the full quiz (answers included): parse it
  // server-side and render the same PracticeView used by installations.
  let quiz;
  try {
    const manifest = await loadManifest(hubQuiz.payloadBlob);
    quiz = manifestToPracticeQuiz(manifest, {
      id: hubQuiz.id,
      title: hubQuiz.title,
      description: hubQuiz.description,
      authorName: hubQuiz.hubAccount.name ?? "Anonymous",
    });
  } catch {
    notFound();
  }

  return (
    <PracticeView
      quiz={quiz}
      backHref={`/q/${id}`}
      backLabel={t("backToQuiz")}
      completeUrl={`/api/hub/practice/${runId}/complete`}
    />
  );
}
