import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { searchHubQuizzesRemote } from "@/lib/hub/hub-client";
import type { SearchResultItem } from "@/lib/hub/search";

export default async function HubBrowsePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const t = await getTranslations("dashboard");
  const th = await getTranslations("hub");

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

  let items: SearchResultItem[] = [];
  let total = 0;
  let fetchError: string | null = null;

  try {
    const result = await searchHubQuizzesRemote({ sort: "recent", perPage: 20 });
    items = result.items;
    total = result.total;
  } catch {
    fetchError = "Hub not reachable. Please try again later.";
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">
          {t("browseRepository")}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">{th("exploreSubtitle")}</p>
      </div>

      {fetchError && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-700 dark:text-red-300">
          {fetchError}
        </div>
      )}

      {!fetchError && items.length === 0 && (
        <p className="text-slate-500">{th("noResults")}</p>
      )}

      {!fetchError && items.length > 0 && (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {total} quiz{total !== 1 ? "zes" : ""} available
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/dashboard/hub/${item.id}`}
                className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:shadow-md transition-shadow"
              >
                <h2 className="font-semibold text-slate-900 dark:text-white truncate mb-1">
                  {item.title}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  {th("by", { author: item.author })}
                </p>
                {item.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mb-3">
                    {item.description}
                  </p>
                )}
                <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                  <span>{item.questionCount} questions</span>
                  <span>{item.downloadsCount} clones</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
