"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { withBasePath } from "@/lib/base-path";
import { CURRENT_TERMS_VERSION } from "@/lib/config/legal";

export function TermsAcceptanceModal({ onAccepted }: { onAccepted: () => void }) {
  const t = useTranslations("legal");
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(withBasePath("/api/consent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "TERMS_ACCEPTANCE",
          version: CURRENT_TERMS_VERSION,
        }),
      });
      if (!res.ok) throw new Error(t("termsSaveError"));
      onAccepted();
    } catch {
      setError(t("termsSaveErrorRetry"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {t("termsTitle")}
          </h2>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <p>
            {t("termsIntro").split(t("termsOfUse"))[0]}
            <Link href="/terms" className="text-indigo-600 dark:text-indigo-400 underline" target="_blank">
              {t("termsOfUse")}
            </Link>
            {" e l'"}
            <Link href="/privacy" className="text-indigo-600 dark:text-indigo-400 underline" target="_blank">
              {t("privacyPolicy")}
            </Link>.
          </p>
          <p>{t("termsP1")}</p>
          <p>{t("termsP2")}</p>
          <p>{t("termsP3")}</p>
        </div>

        <div className="px-6 py-5 border-t border-slate-200 dark:border-slate-700 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              {t("termsCheckbox")}
            </span>
          </label>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <button
            onClick={handleAccept}
            disabled={!checked || loading}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {t("accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
