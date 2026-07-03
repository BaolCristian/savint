"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmDelete } from "./confirm-delete";

export function InstallationActions({
  affiliationId, installationId, active,
}: { affiliationId: string; installationId: string; active: boolean }) {
  const t = useTranslations("adminAffiliations");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setError(null);
    const action = active ? "disable" : "enable";
    const res = await fetch(`/api/hub/admin/installations/${installationId}/${action}`, { method: "POST" });
    if (!res.ok) { setError(t("actionError")); return; }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        onClick={toggle}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
      >
        {active ? t("disable") : t("enable")}
      </button>
      <ConfirmDelete affiliationId={affiliationId} />
    </div>
  );
}
