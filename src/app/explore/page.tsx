import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db/client";
import { ExploreClient } from "@/components/practice/explore-client";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const t = await getTranslations("practice");

  const quizzes = await prisma.quiz.findMany({
    where: {
      isPublic: true,
      suspended: false,
    },
    include: {
      author: { select: { name: true } },
      _count: { select: { questions: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const data = quizzes
    .filter((q) => q._count.questions > 0)
    .map((q) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      tags: q.tags,
      authorName: q.author.name ?? "Anonimo",
      questionCount: q._count.questions,
    }));

  return (
    <div className="min-h-dvh bg-gradient-to-br from-indigo-50 via-white to-violet-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <header className="mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-2">
            {t("exploreTitle")}
          </h1>
          <p className="text-slate-600">{t("exploreSubtitle")}</p>
        </header>
        <ExploreClient quizzes={data} />
      </div>
    </div>
  );
}
