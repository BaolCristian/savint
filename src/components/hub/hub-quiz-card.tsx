"use client";

// Client component: buttonVariants() vive in un modulo client e non è
// invocabile da un server component — con la direttiva la card è
// renderizzabile ovunque (explore, landing) con sole props serializzabili.
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { getSubjectVisual } from "@/lib/subject-visuals";
import { getSubjectLabel } from "@/lib/quiz-subjects";

export type HubQuizCardItem = {
  id: string;
  title: string;
  description: string | null;
  author: string;
  schoolLevel: string | null;
  subject: string | null;
  language: string | null;
  downloadsCount: number;
  playsCount: number;
};

const LEVEL_LABELS: Record<string, { it: string; en: string }> = {
  PRIMARIA: { it: "Primaria", en: "Primary" },
  SECONDARIA_I: { it: "Sec. I grado", en: "Lower sec." },
  SECONDARIA_II: { it: "Sec. II grado", en: "Upper sec." },
  UNIVERSITA: { it: "Università", en: "University" },
  ALTRO: { it: "Altro", en: "Other" },
};

export function HubQuizCard({ item }: { item: HubQuizCardItem }) {
  const t = useTranslations("hub");
  const locale = useLocale() === "en" ? "en" : "it";

  const visual = getSubjectVisual(item.subject);
  const Icon = visual.icon;
  const subjectLabel = item.subject
    ? getSubjectLabel(item.subject, locale) ?? item.subject
    : null;
  const levelLabel = item.schoolLevel
    ? LEVEL_LABELS[item.schoolLevel]?.[locale] ?? item.schoolLevel
    : null;

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/40 hover:shadow-md">
      {/* Subject accent */}
      <div className={`h-2 w-full ${visual.solid}`} />

      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* Subject icon + meta */}
        <div className="flex items-center gap-2">
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white shadow-sm ${visual.solid}`}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="flex flex-wrap gap-1.5">
            {subjectLabel && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${visual.pill}`}
              >
                {subjectLabel}
              </span>
            )}
            {levelLabel && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {levelLabel}
              </span>
            )}
            {item.language && (
              <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium uppercase text-slate-500">
                {item.language}
              </span>
            )}
          </div>
        </div>

        <Link
          href={`/q/${item.id}`}
          className="font-bold leading-snug text-slate-900 line-clamp-2 transition-colors hover:text-brand-blue"
        >
          {item.title}
        </Link>

        {item.description && (
          <p className="flex-1 text-sm text-slate-500 line-clamp-2">
            {item.description}
          </p>
        )}

        <p className="text-xs text-slate-400">{t("by", { author: item.author })}</p>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>{t("downloads", { count: item.downloadsCount })}</span>
            <span>{t("plays", { count: item.playsCount })}</span>
          </div>
          <Link href={`/q/${item.id}`} className={buttonVariants({ size: "sm" })}>
            {t("tryNow")}
          </Link>
        </div>
      </div>
    </div>
  );
}
