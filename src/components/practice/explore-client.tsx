"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Search, Play, ArrowLeft } from "lucide-react";

interface QuizItem {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  authorName: string;
  questionCount: number;
}

export function ExploreClient({ quizzes }: { quizzes: QuizItem[] }) {
  const t = useTranslations("practice");
  const [search, setSearch] = useState("");

  const filtered = quizzes.filter((q) => {
    const term = search.toLowerCase().trim();
    if (!term) return true;
    return (
      q.title.toLowerCase().includes(term) ||
      (q.description?.toLowerCase().includes(term) ?? false) ||
      q.tags.some((tag) => tag.toLowerCase().includes(term))
    );
  });

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium px-3 py-2 rounded-lg hover:bg-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("home")}
        </Link>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-4 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-lg">
            {quizzes.length === 0 ? t("noPublicQuizzes") : t("noSearchResults")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((q) => (
            <div
              key={q.id}
              className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all p-5 flex flex-col"
            >
              <h2 className="font-bold text-lg text-slate-900 mb-1 leading-snug">{q.title}</h2>
              {q.description && (
                <p className="text-sm text-slate-600 mb-3 line-clamp-2">{q.description}</p>
              )}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {q.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="inline-block bg-indigo-50 text-indigo-700 text-xs font-medium px-2 py-0.5 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
                <div className="text-xs text-slate-500">
                  <p className="font-medium">{q.authorName}</p>
                  <p>{t("questionCount", { count: q.questionCount })}</p>
                </div>
                <Link
                  href={`/practice/${q.id}`}
                  className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-4 py-2 rounded-xl transition-colors shadow-sm"
                >
                  <Play className="w-4 h-4" />
                  {t("practiceAction")}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
