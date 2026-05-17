"use client";

import { useTranslations } from "next-intl";
import { QUIZ_SUBJECTS } from "@/lib/quiz-subjects";
import { GraduationCap, BookOpen, Languages, Baby } from "lucide-react";

export type SchoolLevel =
  | "PRIMARIA"
  | "SECONDARIA_I"
  | "SECONDARIA_II"
  | "UNIVERSITA"
  | "ALTRO";

export interface QuizMetadataValues {
  schoolLevel: SchoolLevel | null;
  subject: string | null;
  language: string | null;
  ageMin: number | null;
  ageMax: number | null;
}

export type QuizMetadataPatch = Partial<QuizMetadataValues>;

interface Props extends QuizMetadataValues {
  onChange: (patch: QuizMetadataPatch) => void;
}

const SCHOOL_LEVELS: SchoolLevel[] = [
  "PRIMARIA",
  "SECONDARIA_I",
  "SECONDARIA_II",
  "UNIVERSITA",
  "ALTRO",
];

const LANGUAGES: { code: string; labelKey: string }[] = [
  { code: "it", labelKey: "langIt" },
  { code: "en", labelKey: "langEn" },
  { code: "fr", labelKey: "langFr" },
  { code: "es", labelKey: "langEs" },
  { code: "de", labelKey: "langDe" },
  { code: "la", labelKey: "langLa" },
];

export function QuizMetadataSection({
  schoolLevel,
  subject,
  language,
  ageMin,
  ageMax,
  onChange,
}: Props) {
  const t = useTranslations("metadata");
  const tLocale = useTranslations();
  const locale = tLocale("locale") === "en" ? "en" : "it";

  const parseAge = (raw: string): number | null => {
    if (raw.trim() === "") return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* School level */}
      <div>
        <label
          htmlFor="quiz-school-level"
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1.5"
        >
          <GraduationCap className="size-3.5" />
          {t("schoolLevelLabel")}
        </label>
        <select
          id="quiz-school-level"
          value={schoolLevel ?? ""}
          onChange={(e) =>
            onChange({
              schoolLevel: e.target.value
                ? (e.target.value as SchoolLevel)
                : null,
            })
          }
          className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <option value="">{t("notSpecified")}</option>
          {SCHOOL_LEVELS.map((lvl) => (
            <option key={lvl} value={lvl}>
              {t(`level_${lvl}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Subject */}
      <div>
        <label
          htmlFor="quiz-subject"
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1.5"
        >
          <BookOpen className="size-3.5" />
          {t("subjectLabel")}
        </label>
        <select
          id="quiz-subject"
          value={subject ?? ""}
          onChange={(e) =>
            onChange({ subject: e.target.value || null })
          }
          className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <option value="">{t("notSpecified")}</option>
          {QUIZ_SUBJECTS.map((s) => (
            <option key={s.slug} value={s.slug}>
              {locale === "en" ? s.label_en : s.label_it}
            </option>
          ))}
        </select>
      </div>

      {/* Language */}
      <div>
        <label
          htmlFor="quiz-language"
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1.5"
        >
          <Languages className="size-3.5" />
          {t("languageLabel")}
        </label>
        <select
          id="quiz-language"
          value={language ?? ""}
          onChange={(e) =>
            onChange({ language: e.target.value || null })
          }
          className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <option value="">{t("notSpecified")}</option>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {t(l.labelKey)}
            </option>
          ))}
        </select>
      </div>

      {/* Age range */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label
            htmlFor="quiz-age-min"
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1.5"
          >
            <Baby className="size-3.5" />
            {t("ageMinLabel")}
          </label>
          <input
            id="quiz-age-min"
            type="number"
            min={3}
            max={99}
            value={ageMin ?? ""}
            onChange={(e) =>
              onChange({ ageMin: parseAge(e.target.value) })
            }
            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <div>
          <label
            htmlFor="quiz-age-max"
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1.5"
          >
            <Baby className="size-3.5" />
            {t("ageMaxLabel")}
          </label>
          <input
            id="quiz-age-max"
            type="number"
            min={3}
            max={99}
            value={ageMax ?? ""}
            onChange={(e) =>
              onChange({ ageMax: parseAge(e.target.value) })
            }
            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      </div>
    </div>
  );
}
