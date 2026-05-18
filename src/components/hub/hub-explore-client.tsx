"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { QUIZ_SUBJECTS } from "@/lib/quiz-subjects";
import { SchoolLevel } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HubQuizCard, type HubQuizCardItem } from "./hub-quiz-card";

const SCHOOL_LEVELS = Object.values(SchoolLevel);
const SUBJECTS = QUIZ_SUBJECTS;

type SortOption = "relevant" | "recent" | "popular";

type Props = {
  items: HubQuizCardItem[];
  total: number;
  page: number;
  perPage: number;
  initialFilters: Record<string, unknown>;
  basePath: string;
};

export function HubExploreClient({
  items,
  total,
  page,
  perPage,
  initialFilters,
  basePath,
}: Props) {
  const t = useTranslations("hub");
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const [q, setQ] = useState(String(initialFilters.q ?? ""));
  const [schoolLevel, setSchoolLevel] = useState(String(initialFilters.schoolLevel ?? ""));
  const [subject, setSubject] = useState(String(initialFilters.subject ?? ""));
  const [language, setLanguage] = useState(String(initialFilters.language ?? ""));
  const [ageMin, setAgeMin] = useState(String(initialFilters.ageMin ?? ""));
  const [ageMax, setAgeMax] = useState(String(initialFilters.ageMax ?? ""));
  const [sort, setSort] = useState<SortOption>(
    (initialFilters.sort as SortOption) ?? "relevant",
  );

  function buildUrl(overrides: Record<string, string | number> = {}) {
    const params = new URLSearchParams();
    const vals: Record<string, string | number> = {
      q, schoolLevel, subject, language, ageMin, ageMax, sort, ...overrides,
    };
    for (const [k, v] of Object.entries(vals)) {
      if (v !== "" && v !== undefined) params.set(k, String(v));
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function applyFilters() {
    startTransition(() => { router.push(buildUrl({ page: 1 })); });
  }

  function goToPage(p: number) {
    startTransition(() => { router.push(buildUrl({ page: p })); });
  }

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="min-h-dvh bg-gradient-to-br from-indigo-50 via-white to-violet-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-2">
            {t("exploreTitle")}
          </h1>
          <p className="text-slate-600">{t("exploreSubtitle")}</p>
        </header>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Sidebar filters */}
          <aside className="w-full md:w-64 shrink-0 space-y-4">
            <div className="rounded-lg border bg-white p-4 shadow-sm space-y-3">
              {/* Search */}
              <div>
                <Input
                  data-testid="search-input"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("search")}
                  onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                />
              </div>

              {/* School level */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t("filters.schoolLevel")}
                </label>
                <select
                  data-testid="filter-school-level"
                  className="w-full rounded border px-2 py-1 text-sm"
                  value={schoolLevel}
                  onChange={(e) => setSchoolLevel(e.target.value)}
                >
                  <option value="">{t("filters.all")}</option>
                  {SCHOOL_LEVELS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t("filters.subject")}
                </label>
                <select
                  data-testid="filter-subject"
                  className="w-full rounded border px-2 py-1 text-sm"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                >
                  <option value="">{t("filters.all")}</option>
                  {SUBJECTS.map((s) => (
                    <option key={s.slug} value={s.slug}>{s.label_en}</option>
                  ))}
                </select>
              </div>

              {/* Language */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {t("filters.language")}
                </label>
                <select
                  data-testid="filter-language"
                  className="w-full rounded border px-2 py-1 text-sm"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="">{t("filters.all")}</option>
                  {["it", "en", "fr", "es", "de"].map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              {/* Age range */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {t("filters.ageMin")}
                  </label>
                  <Input
                    type="number"
                    min={3}
                    max={99}
                    value={ageMin}
                    onChange={(e) => setAgeMin(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {t("filters.ageMax")}
                  </label>
                  <Input
                    type="number"
                    min={3}
                    max={99}
                    value={ageMax}
                    onChange={(e) => setAgeMax(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>

              <Button onClick={applyFilters} className="w-full" size="sm">
                {t("search")}
              </Button>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 space-y-4">
            {/* Sort bar */}
            <div className="flex items-center gap-2 justify-end flex-wrap">
              {(["relevant", "recent", "popular"] as SortOption[]).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSort(s);
                    startTransition(() => { router.push(buildUrl({ sort: s, page: 1 })); });
                  }}
                  className={`px-3 py-1 rounded text-sm border transition-colors ${
                    sort === s
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-slate-700 border-slate-200 hover:border-indigo-400"
                  }`}
                  data-testid={`sort-${s}`}
                >
                  {t(`sort.${s}`)}
                </button>
              ))}
            </div>

            {/* Results */}
            {items.length === 0 ? (
              <div className="text-center py-16 text-slate-500">{t("noResults")}</div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="quiz-grid">
                {items.map((item) => (
                  <HubQuizCard key={item.id} item={item} />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                >
                  ←
                </Button>
                <span className="flex items-center px-3 text-sm text-slate-600">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => goToPage(page + 1)}
                >
                  →
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
