import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { withBasePath } from "@/lib/base-path";
import { searchHubQuizzes, type SearchResultItem } from "@/lib/hub/search";

export async function HubLanding() {
  const t = await getTranslations("hubHome");

  let featured: SearchResultItem[] = [];
  try {
    const res = await searchHubQuizzes({ sort: "popular", page: 1, perPage: 6 });
    featured = res.items;
  } catch {
    featured = [];
  }

  return (
    <main className="min-h-dvh bg-gradient-to-br from-indigo-50 via-white to-violet-50">
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 pb-10 text-center">
        <img
          src={withBasePath("/logo_savint.png")}
          alt="SAVINT"
          className="mx-auto mb-6 h-20 w-20 object-contain"
        />
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 mb-4">
          {t("heroTitle")}
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-8">
          {t("heroSubtitle")}
        </p>
        <form action={withBasePath("/explore")} className="flex max-w-xl mx-auto gap-2">
          <input
            type="search"
            name="q"
            aria-label={t("searchPlaceholder")}
            placeholder={t("searchPlaceholder")}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-slate-900"
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700"
          >
            {t("searchButton")}
          </button>
        </form>
        <div className="mt-6 flex justify-center gap-4 text-sm">
          <Link href={withBasePath("/explore")} className="text-indigo-700 underline">
            {t("browseAll")}
          </Link>
          <Link href={withBasePath("/hub-register")} className="text-indigo-700 underline">
            {t("signUp")}
          </Link>
        </div>
      </section>

      {/* Quiz in evidenza */}
      {featured.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">{t("featuredTitle")}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((q) => (
              <Link
                key={q.id}
                href={withBasePath(`/q/${q.id}`)}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition"
              >
                <h3 className="font-semibold text-slate-900 line-clamp-2">{q.title}</h3>
                {q.description && (
                  <p className="mt-1 text-sm text-slate-600 line-clamp-2">{q.description}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Porta SAVINT a scuola */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <div className="rounded-2xl bg-slate-900 text-white p-8 sm:p-10">
          <h2 className="text-2xl font-bold mb-2">{t("schoolTitle")}</h2>
          <p className="text-slate-300 mb-4 max-w-2xl">{t("schoolBody")}</p>
          <div className="flex gap-4">
            <Link
              href={withBasePath("/demo")}
              className="rounded-lg bg-white px-5 py-2.5 font-semibold text-slate-900 hover:bg-slate-100"
            >
              {t("tryItButton")}
            </Link>
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-slate-400">{t("footer")}</p>
      </section>
    </main>
  );
}
