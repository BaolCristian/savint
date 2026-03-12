"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Ban, Archive, Eye, Trash2 } from "lucide-react";
import { withBasePath } from "@/lib/base-path";

interface ReportItem {
  id: string;
  reason: string;
  description: string | null;
  status: string;
  createdAt: string;
  quiz: { id: string; title: string; author: { name: string | null; email: string } } | null;
  reporter: { name: string | null; email: string };
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "In attesa", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  REVIEWED: { label: "Revisionata", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  RESOLVED: { label: "Risolta", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  DISMISSED: { label: "Archiviata", color: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
};

const REASON_LABELS: Record<string, string> = {
  COPYRIGHT: "Violazione copyright",
  PERSONAL_DATA: "Dati personali",
  OFFENSIVE: "Contenuto offensivo",
  OTHER: "Altro",
};

export function ReportsClient() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("PENDING");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter
        ? withBasePath(`/api/admin/reports?status=${filter}`)
        : withBasePath("/api/admin/reports");
      const res = await fetch(url);
      const data = await res.json();
      setReports(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleAction = async (reportId: string, action: {
    status: string;
    suspendQuiz?: boolean;
    deleteQuiz?: boolean;
  }) => {
    if (action.deleteQuiz && !confirm("Sei sicuro di voler eliminare definitivamente questo quiz?")) return;

    setActionLoading(reportId);
    try {
      await fetch(withBasePath(`/api/admin/reports/${reportId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      fetchReports();
    } catch {
      alert("Errore nell'aggiornamento");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["PENDING", "REVIEWED", "RESOLVED", "DISMISSED", ""].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
              filter === s
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
            }`}
          >
            {s ? STATUS_LABELS[s]?.label || s : "Tutte"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-slate-400" />
        </div>
      ) : reports.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          Nessuna segnalazione.
        </p>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div
              key={report.id}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-white">
                    {report.quiz?.title ?? "Quiz eliminato"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    di {report.quiz?.author?.name ?? "?"} ({report.quiz?.author?.email ?? "?"}) &middot;{" "}
                    Segnalato da {report.reporter?.name ?? "?"} ({report.reporter?.email})
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_LABELS[report.status]?.color ?? ""}`}>
                  {STATUS_LABELS[report.status]?.label ?? report.status}
                </span>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <span className="text-slate-600 dark:text-slate-400">
                  Motivo: <strong>{REASON_LABELS[report.reason] ?? report.reason}</strong>
                </span>
                <span className="text-slate-400">
                  {new Date(report.createdAt).toLocaleDateString("it-IT", {
                    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                  })}
                </span>
              </div>

              {report.description && (
                <p className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                  {report.description}
                </p>
              )}

              {(report.status === "PENDING" || report.status === "REVIEWED") && (
                <div className="flex gap-2 flex-wrap pt-1">
                  {report.status === "PENDING" && (
                    <button
                      onClick={() => handleAction(report.id, { status: "REVIEWED" })}
                      disabled={actionLoading === report.id}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950 transition-colors"
                    >
                      <Eye className="size-3.5" /> Segna come revisionata
                    </button>
                  )}
                  <button
                    onClick={() => handleAction(report.id, { status: "RESOLVED", suspendQuiz: true })}
                    disabled={actionLoading === report.id}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950 transition-colors"
                  >
                    <Ban className="size-3.5" /> Sospendi quiz
                  </button>
                  <button
                    onClick={() => handleAction(report.id, { status: "DISMISSED" })}
                    disabled={actionLoading === report.id}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Archive className="size-3.5" /> Archivia
                  </button>
                  <button
                    onClick={() => handleAction(report.id, { status: "RESOLVED", deleteQuiz: true })}
                    disabled={actionLoading === report.id}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 transition-colors"
                  >
                    <Trash2 className="size-3.5" /> Elimina quiz
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
