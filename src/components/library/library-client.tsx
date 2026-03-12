"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Play, Copy } from "lucide-react";
import { withBasePath } from "@/lib/base-path";
import { PublishDeclarationModal } from "@/components/legal/publish-declaration-modal";

interface QuizItem {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  authorName: string;
  questionCount: number;
  createdAt: string;
}

export function LibraryClient({ quizzes }: { quizzes: QuizItem[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [pendingDuplicate, setPendingDuplicate] = useState<string | null>(null);

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
      alert("Errore nell'avvio della sessione");
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
      alert("Errore nella duplicazione");
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
          placeholder="Cerca per titolo o descrizione..."
          className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 pl-10 pr-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          {search ? "Nessun quiz trovato." : "Nessun quiz pubblico disponibile al momento."}
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
                  di {quiz.authorName} &middot;{" "}
                  {new Date(quiz.createdAt).toLocaleDateString("it-IT", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
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
                    {quiz.questionCount} domande
                  </Badge>
                </div>
                <div className="flex gap-2 mt-auto pt-2">
                  <button
                    onClick={() => handlePlay(quiz.id)}
                    disabled={loading === quiz.id}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Gioca
                  </button>
                  <button
                    onClick={() => handleDuplicate(quiz.id)}
                    disabled={loading === quiz.id}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Duplica
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
    </>
  );
}
