import { prisma } from "@/lib/db/client";

export default async function HubQuizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const quiz = await prisma.hubQuiz.findUnique({ where: { id } });
  if (!quiz) {
    return <main className="mx-auto max-w-2xl p-6"><p>Not found</p></main>;
  }
  const author = await prisma.hubAccount.findUnique({
    where: { id: quiz.hubAccountId },
    select: { name: true },
  });
  return (
    <main className="mx-auto max-w-2xl p-6">
      {quiz.unpublishedAt && (
        <p className="mb-4 rounded bg-amber-100 p-3 text-sm">
          This quiz has been withdrawn by the author.
        </p>
      )}
      {quiz.suspended && (
        <p className="mb-4 rounded bg-red-100 p-3 text-sm">
          This quiz has been suspended for review.
        </p>
      )}
      <h1 className="text-2xl font-semibold">{quiz.title}</h1>
      <p className="mt-1 text-sm text-gray-600">
        by {author?.name ?? "Unknown"} · v{quiz.version} ·{" "}
        {quiz.publishedAt.toISOString().slice(0, 10)}
      </p>
      {quiz.description && <p className="mt-4 text-sm">{quiz.description}</p>}
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <dt>Level</dt><dd>{quiz.schoolLevel}</dd>
        <dt>Subject</dt><dd>{quiz.subject}</dd>
        <dt>Language</dt><dd>{quiz.language}</dd>
      </dl>
    </main>
  );
}
