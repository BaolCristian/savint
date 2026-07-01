import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { HubQuizDetailActions } from "./hub-quiz-detail-actions";
import type { QuestionPreview } from "@/lib/hub/qlz-preview";

export type HubQuizDetailData = {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  license: "CC_BY" | "CC_BY_SA";
  schoolLevel: string | null;
  subject: string | null;
  language: string | null;
  ageMin: number | null;
  ageMax: number | null;
  questionCount: number;
  downloadsCount: number;
  playsCount: number;
  publishedAt: string;
  updatedAt: string;
  version: number;
  suspended: boolean;
  author: string;
  authorId: string;
  authorAffiliation: string | null;
};

type Props = {
  quiz: HubQuizDetailData;
  questions: QuestionPreview[];
};

const QUESTION_TYPE_LABELS: Record<string, string> = {
  MULTIPLE_CHOICE: "Scelta multipla",
  TRUE_FALSE: "Vero / Falso",
  OPEN_ANSWER: "Risposta aperta",
  ORDERING: "Ordinamento",
  MATCHING: "Abbinamento",
  SPOT_ERROR: "Trova l'errore",
  NUMERIC_ESTIMATION: "Stima numerica",
  IMAGE_HOTSPOT: "Punto sull'immagine",
  CODE_COMPLETION: "Completa il codice",
};

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-4 text-center">
      <div className="text-2xl font-black tabular-nums text-indigo-600">{value}</div>
      <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
    </div>
  );
}

export function HubQuizDetail({ quiz, questions }: Props) {
  const t = useTranslations("hub");

  return (
    <main className="min-h-dvh bg-gradient-to-b from-indigo-50/60 via-white to-white">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {quiz.suspended && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            This quiz has been suspended for review.
          </div>
        )}

        {/* Hero */}
        <header className="rounded-3xl border border-indigo-100 bg-white p-6 shadow-sm shadow-indigo-100/50 sm:p-8">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {quiz.subject && (
              <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                {quiz.subject}
              </span>
            )}
            {quiz.schoolLevel && (
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                {quiz.schoolLevel}
              </span>
            )}
            {quiz.language && (
              <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium uppercase text-slate-500">
                {quiz.language}
              </span>
            )}
            {(quiz.ageMin || quiz.ageMax) && (
              <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500">
                {quiz.ageMin ?? "?"}–{quiz.ageMax ?? "?"} anni
              </span>
            )}
          </div>

          <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            {quiz.title}
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            {t("by", { author: quiz.author })}
            {quiz.authorAffiliation && ` · ${quiz.authorAffiliation}`}
            {" · "}
            {t("version", { n: quiz.version })}
            {" · "}
            {new Date(quiz.publishedAt).toLocaleDateString()}
          </p>

          {quiz.description && (
            <p className="mt-4 leading-relaxed text-slate-600">{quiz.description}</p>
          )}

          {quiz.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {quiz.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Signature: the quiz at a glance */}
          <div className="mt-6 grid grid-cols-3 gap-3">
            <StatTile value={quiz.questionCount} label="Domande" />
            <StatTile value={quiz.playsCount} label="Giocate" />
            <StatTile value={quiz.downloadsCount} label="Scaricato" />
          </div>

          <div className="mt-6">
            <HubQuizDetailActions quizId={quiz.id} />
          </div>
        </header>

        <p className="mt-3 px-2 text-xs text-slate-400">
          {t("license", { license: quiz.license })}
        </p>

        {/* Question previews — no correct answers */}
        {questions.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-4 px-1 text-lg font-bold text-slate-800">
              Domande <span className="font-medium text-slate-400">({questions.length})</span>
            </h2>
            <ol className="space-y-2.5">
              {questions.map((q) => (
                <li
                  key={q.order}
                  className="flex gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-100/50 transition hover:border-indigo-200"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-600">
                    {q.order + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-700">{q.text}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
                        {QUESTION_TYPE_LABELS[q.type] ?? q.type}
                      </span>
                      <span>· {q.timeLimit}s · {q.points} pt</span>
                      {q.hasMedia && <span>· 🖼</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}
