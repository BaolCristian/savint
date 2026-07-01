"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface Props {
  id: string;
}

export default function AffiliationActions({ id }: Props) {
  const t = useTranslations("affiliation");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setError(null);
    const res = await fetch(`/api/hub/affiliation/${id}/approve`, { method: "POST" });
    if (!res.ok) {
      setError(t("approveError"));
      return;
    }
    router.refresh();
  }

  async function handleReject() {
    setError(null);
    const reason = window.prompt(t("rejectReasonPrompt")) ?? undefined;
    const res = await fetch(`/api/hub/affiliation/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      setError(t("rejectError"));
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        onClick={handleApprove}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
      >
        {t("approve")}
      </button>
      <button
        onClick={handleReject}
        className="rounded-lg border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors"
      >
        {t("reject")}
      </button>
    </div>
  );
}
