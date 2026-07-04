"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmDelete } from "./confirm-delete";

export default function AffiliationActions({ id, schoolName }: { id: string; schoolName?: string }) {
  const t = useTranslations("affiliation");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setError(null);
    const res = await fetch(`/api/hub/affiliation/${id}/approve`, { method: "POST" });
    if (!res.ok) { setError(t("approveError")); return; }
    router.refresh();
  }
  async function handleReject() {
    setError(null);
    const reason = window.prompt(t("rejectReasonPrompt")) ?? undefined;
    const res = await fetch(`/api/hub/affiliation/${id}/reject`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    });
    if (!res.ok) { setError(t("rejectError")); return; }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button onClick={handleApprove} className="rounded-lg bg-brand-green px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 transition">
        {t("approve")}
      </button>
      <button onClick={handleReject} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
        {t("reject")}
      </button>
      <ConfirmDelete deleteUrl={`/api/hub/admin/affiliations/${id}`} label={schoolName} />
    </div>
  );
}
