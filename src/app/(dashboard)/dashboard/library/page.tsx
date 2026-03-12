import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { LibraryClient } from "@/components/library/library-client";

export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const quizzes = await prisma.quiz.findMany({
    where: {
      isPublic: true,
      suspended: false,
      authorId: { not: session.user.id },
    },
    include: {
      author: { select: { name: true } },
      _count: { select: { questions: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const data = quizzes.map((q) => ({
    id: q.id,
    title: q.title,
    description: q.description,
    tags: q.tags,
    license: q.license,
    authorName: q.author.name ?? "Anonimo",
    questionCount: q._count.questions,
    createdAt: q.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Libreria Quiz</h1>
        <p className="text-muted-foreground">
          Esplora i quiz condivisi da altri docenti. Puoi giocarli direttamente o duplicarli nel tuo account.
        </p>
      </div>
      <LibraryClient quizzes={data} />
    </div>
  );
}
