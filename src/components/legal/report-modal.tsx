"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Flag } from "lucide-react";
import { withBasePath } from "@/lib/base-path";

const REASON_KEYS = [
  { value: "COPYRIGHT", key: "reasonCopyright" },
  { value: "PERSONAL_DATA", key: "reasonPersonalData" },
  { value: "OFFENSIVE", key: "reasonOffensive" },
  { value: "OTHER", key: "reasonOther" },
] as const;

interface Props {
  quizId: string;
  onClose: () => void;
}

export function ReportModal({ quizId, onClose }: Props) {
  const t = useTranslations("legal");
  const tc = useTranslations("common");
  const [reason, setReason] = useState<string>("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"success" | "already" | "error" | null>(null);

  const handleSubmit = async () => {
    if (!reason) return;
    setLoading(true);
    try {
      const res = await fetch(withBasePath("/api/report"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, reason, description: description || undefined }),
      });
      if (res.status === 409) {
        setResult("already");
      } else if (!res.ok) {
        setResult("error");
      } else {
        setResult("success");
      }
    } catch {
      setResult("error");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {result === "success" && t("reportSuccess")}
            {result === "already" && t("reportAlready")}
            {result === "error" && t("reportError")}
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            {tc("close")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-200 dark:border-slate-700">
          <Flag className="size-5 text-red-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {t("reportTitle")}
          </h2>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t("reportDescription")}
          </p>

          <div className="space-y-2">
            {REASON_KEYS.map((r) => (
              <label
                key={r.value}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  reason === r.value
                    ? "border-indigo-300 bg-indigo-50 dark:bg-indigo-950 dark:border-indigo-700"
                    : "border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t(r.key)}
                </span>
              </label>
            ))}
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("reportDetailsPlaceholder")}
            rows={3}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
          />
        </div>

        <div className="px-6 py-5 border-t border-slate-200 dark:border-slate-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            {tc("cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason || loading}
            className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            {t("reportSubmit")}
          </button>
        </div>
      </div>
    </div>
  );
}
