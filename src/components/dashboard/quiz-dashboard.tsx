"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { PlayQuizButton } from "@/components/quiz/play-button";
import { ImportQuizButton } from "@/components/quiz/import-button";
import { ExcelImportButton } from "@/components/quiz/excel-import-button";
import { ExcelTemplateButton } from "@/components/quiz/excel-template-button";
import {
  Search,
  Plus,
  SlidersHorizontal,
  Pencil,
  BarChart3,
  Download,
  Copy,
  Trash2,
  MoreHorizontal,
  X,
  Play,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { withBasePath } from "@/lib/base-path";
import { PublishDeclarationModal } from "@/components/legal/publish-declaration-modal";
import { LICENSE_SHORT_LABELS, LICENSE_URLS } from "@/lib/config/legal";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface QuizItem {
  id: string;
  title: string;
  tags: string[];
  authorId: string;
  license: string;
  _count: { questions: number; sessions: number };
  author: { name: string | null };
  updatedAt: string;
  createdAt: string;
  suspended?: boolean;
}

type SortKey = "newest" | "oldest" | "most_played" | "alphabetical";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Piu recenti" },
  { value: "oldest", label: "Meno recenti" },
  { value: "most_played", label: "Piu giocati" },
  { value: "alphabetical", label: "A → Z" },
];

/* ------------------------------------------------------------------ */
/*  Dashboard                                                          */
/* ------------------------------------------------------------------ */

export function QuizDashboard({
  quizzes,
  userId,
}: {
  quizzes: QuizItem[];
  userId: string;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // All unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    quizzes.forEach((q) => q.tags.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [quizzes]);

  // Filter + sort
  const filtered = useMemo(() => {
    let list = quizzes;

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (quiz) =>
          quiz.title.toLowerCase().includes(q) ||
          quiz.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    // Tag filter
    if (tagFilter) {
      list = list.filter((quiz) => quiz.tags.includes(tagFilter));
    }

    // Sort
    switch (sort) {
      case "newest":
        list = [...list].sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        break;
      case "oldest":
        list = [...list].sort(
          (a, b) =>
            new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
        );
        break;
      case "most_played":
        list = [...list].sort(
          (a, b) => b._count.sessions - a._count.sessions,
        );
        break;
      case "alphabetical":
        list = [...list].sort((a, b) =>
          a.title.localeCompare(b.title, "it"),
        );
        break;
    }

    return list;
  }, [quizzes, search, sort, tagFilter]);

  const myQuizzes = filtered.filter((q) => q.authorId === userId);
  const sharedQuizzes = filtered.filter((q) => q.authorId !== userId);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">
            I miei Quiz
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Gestisci, modifica e avvia i tuoi quiz
            <span className="ml-2 text-slate-400 dark:text-slate-500">
              · {quizzes.length} quiz in libreria
            </span>
          </p>
        </div>
        <div className="flex gap-3">
          <ExcelTemplateButton />
          <ExcelImportButton />
          <ImportQuizButton />
          <Link href="/dashboard/quiz/new">
            <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-full transition-all shadow-md shadow-indigo-200 dark:shadow-none hover:shadow-lg active:scale-[0.97]">
              <Plus className="size-4" />
              Nuovo Quiz
            </button>
          </Link>
        </div>
      </div>

      {/* ── CC 4.0 notice ── */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        <svg className="size-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.41 15.06c-2.37 0-3.95-1.73-3.95-4.07s1.62-4.05 3.95-4.05c1.22 0 2.12.47 2.77 1.2l-1.13 1.06c-.37-.42-.84-.67-1.64-.67-1.34 0-2.31 1.1-2.31 2.46 0 1.38.97 2.48 2.31 2.48.81 0 1.32-.33 1.63-.66V13.5h-1.75V12h3.2v3.07c-.63.73-1.62 1.99-3.08 1.99zm6.24 0c-2.37 0-3.95-1.73-3.95-4.07s1.62-4.05 3.95-4.05c1.22 0 2.12.47 2.77 1.2l-1.13 1.06c-.37-.42-.84-.67-1.64-.67-1.34 0-2.31 1.1-2.31 2.46 0 1.38.97 2.48 2.31 2.48.81 0 1.32-.33 1.63-.66V13.5h-1.75V12h3.2v3.07c-.63.73-1.62 1.99-3.08 1.99z"/></svg>
        <p>
          Tutti i quiz resi pubblici sono rilasciati sotto licenza{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline hover:text-amber-900 dark:hover:text-amber-200"
          >
            Creative Commons 4.0 International
          </a>
          . Pubblicando un quiz accetti che altri docenti possano riutilizzarlo secondo i termini della licenza scelta.
        </p>
      </div>

      {/* ── Search + Filters ── */}
      {quizzes.length > 0 && (
        <div className="space-y-3">
          <div className="flex gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cerca tra i tuoi quiz..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-11 pl-10 pr-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 text-sm font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            {/* Filter toggle */}
            {allTags.length > 0 && (
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`h-11 flex items-center gap-2 px-4 border rounded-xl text-sm font-medium transition-all ${
                  showFilters || tagFilter
                    ? "bg-indigo-50 dark:bg-indigo-950 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300"
                    : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                }`}
              >
                <SlidersHorizontal className="size-4" />
                <span className="hidden sm:inline">Filtri</span>
              </button>
            )}
          </div>

          {/* Tag filter chips */}
          {showFilters && allTags.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setTagFilter(null)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
                  !tagFilter
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                }`}
              >
                Tutti
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() =>
                    setTagFilter(tagFilter === tag ? null : tag)
                  }
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
                    tagFilter === tag
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Empty states ── */}
      {quizzes.length === 0 ? (
        <EmptyLibrary />
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center">
          <Search className="size-10 text-slate-300 mx-auto mb-3" />
          <p className="text-lg font-semibold text-slate-600 dark:text-slate-400">
            Nessun quiz trovato
          </p>
          <p className="text-sm text-slate-400 mt-1">
            Prova a cambiare i termini di ricerca o i filtri
          </p>
        </div>
      ) : (
        <>
          {/* ── My quizzes ── */}
          {myQuizzes.length > 0 && (
            <QuizSection
              title="Creati da me"
              count={myQuizzes.length}
              badgeColor="bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300"
            >
              {myQuizzes.map((quiz) => (
                <QuizCard key={quiz.id} quiz={quiz} isOwner />
              ))}
            </QuizSection>
          )}

          {/* ── Shared quizzes ── */}
          {sharedQuizzes.length > 0 && (
            <QuizSection
              title="Condivisi con me"
              count={sharedQuizzes.length}
              badgeColor="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
            >
              {sharedQuizzes.map((quiz) => (
                <QuizCard key={quiz.id} quiz={quiz} isOwner={false} />
              ))}
            </QuizSection>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section wrapper                                                    */
/* ------------------------------------------------------------------ */

function QuizSection({
  title,
  count,
  badgeColor,
  children,
}: {
  title: string;
  count: number;
  badgeColor: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200">
          {title}
        </h2>
        <span
          className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${badgeColor}`}
        >
          {count}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {children}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty state                                                        */
/* ------------------------------------------------------------------ */

function EmptyLibrary() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-16 text-center">
      <span className="text-7xl block mb-4">📚</span>
      <h2 className="text-2xl font-bold text-slate-700 dark:text-slate-300 mb-2">
        La libreria è vuota
      </h2>
      <p className="text-slate-500 mb-8 max-w-md mx-auto">
        Crea il tuo primo quiz interattivo o importa un file .qlz da un collega
      </p>
      <div className="flex justify-center gap-3">
        <ExcelTemplateButton />
        <ExcelImportButton />
        <ImportQuizButton />
        <Link href="/dashboard/quiz/new">
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2.5 rounded-full transition-colors shadow-md shadow-indigo-200">
            Crea Quiz
          </button>
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quiz Card                                                          */
/* ------------------------------------------------------------------ */

function QuizCard({
  quiz,
  isOwner,
}: {
  quiz: QuizItem;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingDuplicate, setPendingDuplicate] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Eliminare "${quiz.title}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(withBasePath(`/api/quiz/${quiz.id}`), { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      alert("Errore nell'eliminazione");
      setDeleting(false);
    }
  };

  const handleDuplicate = () => {
    setMenuOpen(false);
    setPendingDuplicate(true);
  };

  const confirmDuplicate = async (license: "CC_BY" | "CC_BY_SA") => {
    setPendingDuplicate(false);
    try {
      const res = await fetch(withBasePath(`/api/quiz/${quiz.id}`));
      if (!res.ok) throw new Error();
      const data = await res.json();
      const payload = {
        title: `${data.title} (copia)`,
        description: data.description,
        isPublic: false,
        tags: data.tags,
        consentAccepted: true,
        license,
        questions: data.questions.map((q: any) => ({
          type: q.type,
          text: q.text,
          timeLimit: q.timeLimit,
          points: q.points,
          confidenceEnabled: q.confidenceEnabled,
          mediaUrl: q.mediaUrl,
          order: q.order,
          options: q.options,
        })),
      };
      const createRes = await fetch(withBasePath("/api/quiz"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!createRes.ok) throw new Error();
      router.refresh();
    } catch {
      alert("Errore nella duplicazione");
    }
  };

  return (
    <div
      className={`relative overflow-visible bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 transition-all hover:shadow-lg hover:-translate-y-0.5 group ${
        deleting ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      {/* Content */}
      <div className="p-5 pb-3 space-y-3">
        {/* Title */}
        <Link href={`/dashboard/quiz/${quiz.id}/edit`}>
          <h3 className="text-base font-bold text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2 leading-snug min-h-[2.5rem]">
            {quiz.title || "Quiz senza titolo"}
          </h3>
        </Link>
        {quiz.suspended && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 px-2 py-0.5 rounded-md">
            Sospeso
          </span>
        )}

        {/* Author (shared) */}
        {!isOwner && quiz.author.name && (
          <p className="text-xs text-slate-400">di {quiz.author.name}</p>
        )}

        {/* Metadata */}
        <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="font-medium">{quiz._count.questions}</span> domande
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span className="font-medium">{quiz._count.sessions}</span>x giocato
          </span>
        </div>

        {/* Tags */}
        {quiz.tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {quiz.tags.map((tag) => (
              <span
                key={tag}
                className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* License badge */}
        <a
          href={LICENSE_URLS[quiz.license] ?? LICENSE_URLS.CC_BY}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          title={LICENSE_SHORT_LABELS[quiz.license] ?? "CC BY 4.0"}
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.41 15.06c-2.37 0-3.95-1.73-3.95-4.07s1.62-4.05 3.95-4.05c1.22 0 2.12.47 2.77 1.2l-1.13 1.06c-.37-.42-.84-.67-1.64-.67-1.34 0-2.31 1.1-2.31 2.46 0 1.38.97 2.48 2.31 2.48.81 0 1.32-.33 1.63-.66V13.5h-1.75V12h3.2v3.07c-.63.73-1.62 1.99-3.08 1.99zm6.24 0c-2.37 0-3.95-1.73-3.95-4.07s1.62-4.05 3.95-4.05c1.22 0 2.12.47 2.77 1.2l-1.13 1.06c-.37-.42-.84-.67-1.64-.67-1.34 0-2.31 1.1-2.31 2.46 0 1.38.97 2.48 2.31 2.48.81 0 1.32-.33 1.63-.66V13.5h-1.75V12h3.2v3.07c-.63.73-1.62 1.99-3.08 1.99z"/></svg>
          {LICENSE_SHORT_LABELS[quiz.license] ?? "CC BY 4.0"}
        </a>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 px-4 py-3 border-t border-slate-100 dark:border-slate-800 overflow-visible">
        {/* Play — primary */}
        {quiz.suspended ? (
          <span className="flex items-center gap-1.5 text-sm font-medium text-slate-400 p-2" title="Quiz sospeso">
            <Play className="size-4" /> Sospeso
          </span>
        ) : (
          <PlayQuizButton quizId={quiz.id} />
        )}

        {/* Edit */}
        <Link
          href={`/dashboard/quiz/${quiz.id}/edit`}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Modifica"
        >
          <Pencil className="size-4" />
        </Link>

        {/* Stats */}
        {quiz._count.sessions > 0 && (
          <Link
            href={`/dashboard/quiz/${quiz.id}/stats`}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-amber-700 dark:hover:text-amber-400 p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950 transition-colors"
            title="Statistiche"
          >
            <BarChart3 className="size-4" />
          </Link>
        )}

        {/* More menu */}
        <div className="relative ml-auto shrink-0">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <MoreHorizontal className="size-4" />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 bottom-full mb-1 z-20 w-44 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 overflow-hidden">
                <button
                  onClick={handleDuplicate}
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Copy className="size-4" />
                  Duplica
                </button>
                <a
                  href={`/api/quiz/${quiz.id}/export`}
                  download
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Download className="size-4" />
                  Esporta .qlz
                </a>
                {isOwner && (
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                  >
                    <Trash2 className="size-4" />
                    Elimina
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {pendingDuplicate && (
        <PublishDeclarationModal
          onConfirm={confirmDuplicate}
          onCancel={() => setPendingDuplicate(false)}
        />
      )}
    </div>
  );
}
