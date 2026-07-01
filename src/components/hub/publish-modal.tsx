"use client";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { withBasePath } from "@/lib/base-path";
import { QUIZ_SUBJECTS } from "@/lib/quiz-subjects";

type SchoolLevel = "PRIMARIA" | "SECONDARIA_I" | "SECONDARIA_II" | "UNIVERSITA" | "ALTRO";

const SCHOOL_LEVELS = [
  { value: "PRIMARIA", it: "Scuola primaria", en: "Primary school" },
  { value: "SECONDARIA_I", it: "Secondaria di I grado", en: "Lower secondary" },
  { value: "SECONDARIA_II", it: "Secondaria di II grado", en: "Upper secondary" },
  { value: "UNIVERSITA", it: "Università", en: "University" },
  { value: "ALTRO", it: "Altro", en: "Other" },
] as const;

const LANGUAGES = [
  { value: "it", it: "Italiano", en: "Italian" },
  { value: "en", it: "Inglese", en: "English" },
  { value: "fr", it: "Francese", en: "French" },
  { value: "es", it: "Spagnolo", en: "Spanish" },
  { value: "de", it: "Tedesco", en: "German" },
  { value: "la", it: "Latino", en: "Latin" },
] as const;

export type PublishQuiz = {
  id: string;
  title: string;
  description: string | null;
  schoolLevel: SchoolLevel | null;
  subject: string | null;
  language: string | null;
  ageMin: number | null;
  ageMax: number | null;
  license: "CC_BY" | "CC_BY_SA";
  tags: string[];
  hubPublishedId: string | null;
};

type Props = {
  open: boolean;
  quiz: PublishQuiz;
  link: { hubAccountEmail: string } | null;
  onClose: () => void;
  onSuccess?: (result: { hubQuizId: string; version: number; url: string }) => void;
};

export function PublishModal({ open, quiz, link, onClose, onSuccess }: Props) {
  const t = useTranslations("hub.publish");
  const locale = useLocale();

  const [schoolLevel, setSchoolLevel] = useState(quiz.schoolLevel ?? "");
  const [subject, setSubject] = useState(quiz.subject ?? "");
  const [language, setLanguage] = useState(quiz.language ?? "");
  const [ageMin, setAgeMin] = useState(quiz.ageMin ?? "");
  const [ageMax, setAgeMax] = useState(quiz.ageMax ?? "");
  const [estimatedDuration, setEstimatedDuration] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);

  if (!open) return null;

  const isUpdate = Boolean(quiz.hubPublishedId);
  const title = isUpdate ? t("titleUpdate") : t("title");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {};
      if (schoolLevel) body.schoolLevel = schoolLevel;
      if (subject) body.subject = subject;
      if (language) body.language = language;
      if (ageMin !== "") body.ageMin = Number(ageMin);
      if (ageMax !== "") body.ageMax = Number(ageMax);
      if (estimatedDuration !== "") body.estimatedDurationSec = Number(estimatedDuration);

      const res = await fetch(withBasePath(`/api/hub/quiz/${quiz.id}/publish`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.error === "reauth_required") {
          setError(t("errorReauth"));
        } else if (data?.error === "quota_exceeded") {
          setError(t("errorQuota"));
        } else {
          setError(t("errorGeneric", { error: data?.error ?? String(res.status) }));
        }
        return;
      }

      const result = await res.json();
      setSuccessUrl(result.url);
      onSuccess?.(result);
    } catch (err) {
      setError(t("errorGeneric", { error: err instanceof Error ? err.message : "unknown" }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-slate-900 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{title}</h2>

        {!link ? (
          /* ── Not linked: show connect CTA ── */
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">{t("connectAccountIntro")}</p>
            <a
              href={withBasePath("/account/hub-link")}
              className="inline-block rounded bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
            >
              {t("connectAccountCta")}
            </a>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        ) : successUrl ? (
          /* ── Success state ── */
          <div className="space-y-4">
            <p className="text-sm text-emerald-700">
              {isUpdate ? t("successUpdate") : t("success")}
            </p>
            <a
              href={successUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline text-emerald-700"
            >
              {successUrl}
            </a>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        ) : (
          /* ── Publish/Update form ── */
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("schoolLevel")} <span className="text-red-500">*</span>
              </label>
              <select
                value={schoolLevel}
                onChange={(e) => setSchoolLevel(e.target.value)}
                required
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                <option value="">—</option>
                {SCHOOL_LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>{locale === "en" ? l.en : l.it}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("subject")} <span className="text-red-500">*</span>
              </label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                <option value="">—</option>
                {QUIZ_SUBJECTS.map((s) => (
                  <option key={s.slug} value={s.slug}>{locale === "en" ? s.label_en : s.label_it}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("language")} <span className="text-red-500">*</span>
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                required
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              >
                <option value="">—</option>
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{locale === "en" ? l.en : l.it}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("ageMin")} <span className="text-slate-400 font-normal">({locale === "en" ? "optional" : "facoltativo"})</span>
                </label>
                <input
                  type="number"
                  value={ageMin}
                  onChange={(e) => setAgeMin(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t("ageMax")} <span className="text-slate-400 font-normal">({locale === "en" ? "optional" : "facoltativo"})</span>
                </label>
                <input
                  type="number"
                  value={ageMax}
                  onChange={(e) => setAgeMax(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t("estimatedDuration")} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min={10}
                placeholder="600"
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(e.target.value)}
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
            </div>

            <label className="flex items-start gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                aria-label={t("consentReconfirm")}
                className="mt-0.5"
              />
              {t("consentReconfirm")}
            </label>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex justify-between items-center pt-2">
              {isUpdate && quiz.hubPublishedId && (
                <button
                  type="button"
                  className="text-sm text-red-500 hover:underline"
                  onClick={async () => {
                    if (!confirm(t("unpublish"))) return;
                    await fetch(withBasePath(`/api/hub/quiz/${quiz.id}/publish`), { method: "DELETE" });
                    onClose();
                  }}
                >
                  {t("unpublish")}
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={!consent || submitting}
                  className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                >
                  {submitting ? t("submitting") : isUpdate ? t("submitUpdate") : t("submit")}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
