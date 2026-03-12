"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Play, Copy, Flag } from "lucide-react";
import { withBasePath } from "@/lib/base-path";
import { PublishDeclarationModal } from "@/components/legal/publish-declaration-modal";
import { ReportModal } from "@/components/legal/report-modal";
import { LICENSE_SHORT_LABELS, LICENSE_URLS } from "@/lib/config/legal";

interface QuizItem {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  license: string;
  authorName: string;
  questionCount: number;
  createdAt: string;
}

export function LibraryClient({ quizzes }: { quizzes: QuizItem[] }) {
  const router = useRouter();
  const t = useTranslations("library");
  const tc = useTranslations("common");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [pendingDuplicate, setPendingDuplicate] = useState<string | null>(null);
  const [reportingQuiz, setReportingQuiz] = useState<string | null>(null);

  const filtered = quizzes.filter((q) => {
    const term = search.toLowerCase();
    return (
      q.title.toLowerCase().includes(term) ||
      (q.description?.toLowerCase().includes(term) ?? false)
    );
  });

  const handlePlay = async (quizId: string) => {
    setLoading(quizId);
    try {
      const res = await fetch(withBasePath("/api/session"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId }),
      });
      if (!res.ok) throw new Error();
      const session = await res.json();
      const win = window.open(withBasePath(`/live/host/${session.id}`), "_blank");
      if (!win) {
        router.push(`/live/host/${session.id}`);
      }
    } catch {
      alert(t("playError"));
    } finally {
      setLoading(null);
    }
  };

  const handleDuplicate = (quizId: string) => {
    setPendingDuplicate(quizId);
  };

  const confirmDuplicate = async (license: "CC_BY" | "CC_BY_SA") => {
    const quizId = pendingDuplicate;
    setPendingDuplicate(null);
    if (!quizId) return;

    setLoading(quizId);
    try {
      const res = await fetch(withBasePath("/api/quiz/duplicate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, consentAccepted: true, license }),
      });
      if (!res.ok) throw new Error();
      router.push("/dashboard/quiz");
      router.refresh();
    } catch {
      alert(t("duplicateError"));
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 pl-10 pr-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          {search ? t("noQuizFound") : t("noPublicQuizzes")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((quiz) => (
            <Card key={quiz.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-base leading-tight line-clamp-2">
                  {quiz.title}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {t("byAuthor", { author: quiz.authorName, date: new Date(quiz.createdAt).toLocaleDateString("it-IT", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }) })}
                </p>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-3">
                {quiz.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {quiz.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-1">
                  {quiz.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  <Badge variant="secondary" className="text-xs">
                    {tc("questions", { count: quiz.questionCount })}
                  </Badge>
                </div>
                <a
                  href={LICENSE_URLS[quiz.license] ?? LICENSE_URLS.CC_BY}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.41 15.06c-2.37 0-3.95-1.73-3.95-4.07s1.62-4.05 3.95-4.05c1.22 0 2.12.47 2.77 1.2l-1.13 1.06c-.37-.42-.84-.67-1.64-.67-1.34 0-2.31 1.1-2.31 2.46 0 1.38.97 2.48 2.31 2.48.81 0 1.32-.33 1.63-.66V13.5h-1.75V12h3.2v3.07c-.63.73-1.62 1.99-3.08 1.99zm6.24 0c-2.37 0-3.95-1.73-3.95-4.07s1.62-4.05 3.95-4.05c1.22 0 2.12.47 2.77 1.2l-1.13 1.06c-.37-.42-.84-.67-1.64-.67-1.34 0-2.31 1.1-2.31 2.46 0 1.38.97 2.48 2.31 2.48.81 0 1.32-.33 1.63-.66V13.5h-1.75V12h3.2v3.07c-.63.73-1.62 1.99-3.08 1.99z"/></svg>
                  {LICENSE_SHORT_LABELS[quiz.license] ?? "CC BY 4.0"}
                </a>
                <div className="flex gap-2 mt-auto pt-2">
                  <button
                    onClick={() => handlePlay(quiz.id)}
                    disabled={loading === quiz.id}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5" />
                    {t("play")}
                  </button>
                  <button
                    onClick={() => handleDuplicate(quiz.id)}
                    disabled={loading === quiz.id}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {t("duplicate")}
                  </button>
                  <button
                    onClick={() => setReportingQuiz(quiz.id)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 hover:border-red-300 dark:hover:text-red-400 transition-colors"
                    title={t("reportContent")}
                  >
                    <Flag className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {pendingDuplicate && (
        <PublishDeclarationModal
          onConfirm={confirmDuplicate}
          onCancel={() => setPendingDuplicate(null)}
        />
      )}
      {reportingQuiz && (
        <ReportModal
          quizId={reportingQuiz}
          onClose={() => setReportingQuiz(null)}
        />
      )}
    </>
  );
}
