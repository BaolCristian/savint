import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { searchHubQuizzesRemote } from "@/lib/hub/hub-client";
import type { SearchResultItem } from "@/lib/hub/search";
import { Globe, Search } from "lucide-react";

export default async function HubBrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const t = await getTranslations("dashboard");
  const th = await getTranslations("hub");
  const tc = await getTranslations("common");

  const { q } = await searchParams;
  const query = q?.trim() || undefined;

  const hubUrl = process.env.SAVINT_HUB_URL;

  if (!hubUrl) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">
          {t("browseRepository")}
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          Hub not configured. Set SAVINT_HUB_URL to enable this feature.
        </p>
      </div>
    );
  }

  // The search runs on savint.it (remote hub), NOT on the local installation:
  // searchHubQuizzesRemote fetches ${SAVINT_HUB_URL}/api/hub/quizzes.
  let items: SearchResultItem[] = [];
  let fetchError: string | null = null;

  try {
    const result = await searchHubQuizzesRemote({
      q: query,
      sort: query ? "relevant" : "recent",
      perPage: 30,
    });
    items = result.items;
  } catch {
    fetchError = th("hubUnreachable");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          <Globe className="h-3.5 w-3.5" />
          savint.it
        </span>
        <h1 className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">
          {t("browseRepository")}
        </h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          {th("exploreSubtitle")}
        </p>
      </div>

      {/* Search — queries savint.it remotely (GET ?q=) */}
      <form method="get" className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="search"
          name="q"
          defaultValue={query ?? ""}
          placeholder={th("searchPlaceholder")}
          aria-label={th("searchPlaceholder")}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        />
      </form>

      {fetchError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {fetchError}
        </div>
      )}

      {!fetchError && items.length === 0 && (
        <p className="text-slate-500">{th("noResults")}</p>
      )}

      {!fetchError && items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/dashboard/hub/${item.id}`}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
            >
              <h2 className="font-bold leading-snug text-slate-900 line-clamp-2 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-indigo-400">
                {item.title}
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {th("by", { author: item.author })}
              </p>
              {item.description && (
                <p className="mt-2 flex-1 text-sm text-slate-600 line-clamp-2 dark:text-slate-400">
                  {item.description}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {tc("questions", { count: item.questionCount })}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {th("downloads", { count: item.downloadsCount })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
