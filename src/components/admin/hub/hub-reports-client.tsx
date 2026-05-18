"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export interface ReportItem {
  id: string;
  reason: string;
  description: string | null;
  status: string;
  createdAt: string;
  reporter: { id: string; name: string | null; email: string } | null;
  hubQuiz: {
    id: string;
    title: string;
    hubAccount: { id: string; name: string | null; email: string };
  };
  otherReportsCount: number;
}

export function HubReportsClient({
  initialReports,
}: {
  initialReports: ReportItem[];
}) {
  const t = useTranslations("hub.admin");
  const [reports, setReports] = useState(initialReports);
  const [busy, setBusy] = useState<string | null>(null);

  async function dismiss(id: string) {
    setBusy(id);
    await fetch(`/api/hub/admin/reports/${id}/dismiss`, { method: "POST" });
    setReports((rs) => rs.filter((r) => r.id !== id));
    setBusy(null);
  }

  async function suspend(id: string) {
    const reason = prompt(t("suspendReasonPrompt"));
    if (!reason) return;
    setBusy(id);
    await fetch(`/api/hub/admin/reports/${id}/suspend`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setReports((rs) => rs.filter((r) => r.id !== id));
    setBusy(null);
  }

  async function ban(accountId: string) {
    const reason = prompt(t("banReasonPrompt"));
    if (!reason) return;
    setBusy(accountId);
    await fetch(`/api/hub/admin/accounts/${accountId}/ban`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setReports((rs) => rs.filter((r) => r.hubQuiz.hubAccount.id !== accountId));
    setBusy(null);
  }

  if (reports.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center">{t("noReports")}</p>
    );
  }

  return (
    <ul className="space-y-3">
      {reports.map((r) => (
        <li key={r.id} className="rounded-xl border p-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{r.hubQuiz.title}</h2>
              <p className="text-xs text-slate-500">
                {t("reporterType")}:{" "}
                {r.reporter
                  ? `${t("account")} (${r.reporter.email})`
                  : t("anonymous")}
              </p>
              <p className="text-xs text-slate-500">
                {t("otherReports", { count: r.otherReportsCount })}
              </p>
            </div>
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-800">
              {r.reason}
            </span>
          </div>
          {r.description && (
            <p className="text-sm bg-slate-50 rounded p-2">{r.description}</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={`/q/${r.hubQuiz.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3 py-1.5 rounded border"
            >
              {t("viewQuiz")}
            </a>
            <button
              onClick={() => dismiss(r.id)}
              disabled={busy === r.id}
              className="text-xs px-3 py-1.5 rounded border"
            >
              {t("dismiss")}
            </button>
            <button
              onClick={() => suspend(r.id)}
              disabled={busy === r.id}
              className="text-xs px-3 py-1.5 rounded border border-amber-300 text-amber-700"
            >
              {t("suspendQuiz")}
            </button>
            <button
              onClick={() => ban(r.hubQuiz.hubAccount.id)}
              disabled={busy === r.hubQuiz.hubAccount.id}
              className="text-xs px-3 py-1.5 rounded border border-red-300 text-red-700"
            >
              {t("banAuthor")}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
