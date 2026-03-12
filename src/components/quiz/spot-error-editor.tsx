"use client";

import { useTranslations } from "next-intl";
import { Trash2, Plus } from "lucide-react";

interface Props {
  options: { lines: string[]; errorIndices: number[]; explanation?: string };
  onChange: (opts: Props["options"]) => void;
}

export function SpotErrorEditor({ options, onChange }: Props) {
  const t = useTranslations("spotErrorEditor");
  const { lines, errorIndices, explanation } = options;

  const toggleError = (i: number) => {
    const next = errorIndices.includes(i)
      ? errorIndices.filter((idx) => idx !== i)
      : [...errorIndices, i].sort((a, b) => a - b);
    onChange({ ...options, errorIndices: next });
  };

  const updateLine = (i: number, value: string) => {
    onChange({ ...options, lines: lines.map((l, idx) => (idx === i ? value : l)) });
  };

  const addLine = () => {
    onChange({ ...options, lines: [...lines, ""] });
  };

  const removeLine = (i: number) => {
    const nextLines = lines.filter((_, idx) => idx !== i);
    const nextErrors = errorIndices
      .filter((idx) => idx !== i)
      .map((idx) => (idx > i ? idx - 1 : idx));
    onChange({ ...options, lines: nextLines, errorIndices: nextErrors });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {lines.map((line, i) => {
          const isError = errorIndices.includes(i);
          return (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleError(i)}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all ${
                  isError
                    ? "bg-red-500 text-white"
                    : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-red-200 dark:hover:bg-red-900"
                }`}
              >
                {i + 1}
              </button>
              <input
                value={line}
                onChange={(e) => updateLine(i, e.target.value)}
                placeholder={t("linePlaceholder", { n: i + 1 })}
                className={`flex-1 font-mono rounded-xl border px-4 py-3 text-lg lg:text-xl placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                  isError
                    ? "bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200"
                    : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200"
                }`}
              />
              {lines.length > 2 && (
                <button
                  onClick={() => removeLine(i)}
                  className="text-slate-400 hover:text-red-500 p-1 transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {errorIndices.length === 0 && (
        <p className="text-amber-600 dark:text-amber-400 text-sm font-medium">
          {t("warning")}
        </p>
      )}

      <button
        onClick={addLine}
        className="flex items-center gap-2 text-lg font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 px-3 py-2 rounded-lg transition-colors"
      >
        <Plus className="size-5" /> {t("addLine")}
      </button>

      <div className="pt-2">
        <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">
          {t("explanation")}
        </label>
        <input
          value={explanation ?? ""}
          onChange={(e) => onChange({ ...options, explanation: e.target.value || undefined })}
          placeholder={t("explanationPlaceholder")}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>
    </div>
  );
}
