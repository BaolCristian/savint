"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

interface Props {
  onConfirm: (license: "CC_BY" | "CC_BY_SA") => void;
  onCancel: () => void;
  loading?: boolean;
}

export function PublishDeclarationModal({ onConfirm, onCancel, loading }: Props) {
  const t = useTranslations("legal");
  const tc = useTranslations("common");
  const [checked, setChecked] = useState(false);
  const [license, setLicense] = useState<"CC_BY" | "CC_BY_SA">("CC_BY");

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {t("declareTitle")}
          </h2>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <p>{t("declareIntro")}</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>{t("declareP1")}</li>
            <li>{t("declareP2")}</li>
            <li>{t("declareP3")}</li>
            <li>{t("declareP4")}</li>
          </ul>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("declarePlatform")}
          </p>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <p className="font-semibold text-slate-800 dark:text-slate-200 mb-2">
              {t("licenseTitle")}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              {t("licenseExplanation")}
            </p>
            <select
              value={license}
              onChange={(e) => setLicense(e.target.value as "CC_BY" | "CC_BY_SA")}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value="CC_BY">{t("licenseCCBY")}</option>
              <option value="CC_BY_SA">{t("licenseCCBYSA")}</option>
            </select>
          </div>
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
              {t("declareCheckbox")}
            </span>
          </label>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              {tc("cancel")}
            </button>
            <button
              onClick={() => onConfirm(license)}
              disabled={!checked || loading}
              className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              {t("declareConfirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
