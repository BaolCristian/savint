import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db/client";
import { ExploreClient } from "@/components/practice/explore-client";
import { getSavintMode } from "@/lib/config/savint-mode";
import { searchHubQuizzes } from "@/lib/hub/search";
import { HubExploreClient } from "@/components/hub/hub-explore-client";

export const dynamic = "force-dynamic";

export default async function ExplorePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const mode = getSavintMode();

  if (mode === "hub") {
    const sp = searchParams ? await searchParams : {};
    const get = (k: string) => {
      const v = sp[k];
      return Array.isArray(v) ? v[0] : v;
    };
    const result = await searchHubQuizzes({
      q: get("q"),
      schoolLevel: get("schoolLevel") as Parameters<typeof searchHubQuizzes>[0]["schoolLevel"],
      subject: get("subject"),
      language: get("language"),
      ageMin: get("ageMin") ? Number(get("ageMin")) : undefined,
      ageMax: get("ageMax") ? Number(get("ageMax")) : undefined,
      sort: (get("sort") ?? "relevant") as "recent" | "popular" | "relevant",
      page: get("page") ? Number(get("page")) : 1,
      perPage: 20,
    });
    const initialFilters: Record<string, unknown> = {
      q: get("q") ?? "",
      schoolLevel: get("schoolLevel") ?? "",
      subject: get("subject") ?? "",
      language: get("language") ?? "",
      ageMin: get("ageMin") ?? "",
      ageMax: get("ageMax") ?? "",
      sort: get("sort") ?? "relevant",
    };
    return (
      <HubExploreClient
        items={result.items}
        total={result.total}
        page={result.page}
        perPage={result.perPage}
        initialFilters={initialFilters}
        basePath="/explore"
      />
    );
  }

  // installation mode — original behaviour
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
