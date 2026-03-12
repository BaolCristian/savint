"use client";

import { useTranslations } from "next-intl";

interface Props {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function ConfidenceToggle({ enabled, onChange }: Props) {
  const t = useTranslations("confidence");
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div className="relative">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`w-11 h-6 rounded-full transition-colors ${
            enabled ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600"
          }`}
        />
        <div
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </div>
      <span className="text-base text-slate-600 dark:text-slate-400 font-medium">
        {t("label")}
      </span>
      <span className="relative group">
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-300 dark:bg-slate-600 text-[10px] font-bold text-slate-600 dark:text-slate-300 cursor-help">
          ?
        </span>
        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg bg-slate-800 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-50">
          {t("tooltip")}
        </span>
      </span>
    </label>
  );
}
