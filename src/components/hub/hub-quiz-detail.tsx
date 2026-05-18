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

export function HubQuizDetail({ quiz, questions }: Props) {
  const t = useTranslations("hub");

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {quiz.suspended && (
        <div className="mb-4 rounded bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          This quiz has been suspended for review.
        </div>
      )}

      <header className="mb-6">
        <div className="flex flex-wrap items-start gap-2 mb-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 flex-1">
            {quiz.title}
          </h1>
          {quiz.language && (
            <Badge variant="outline" className="uppercase">{quiz.language}</Badge>
          )}
        </div>

        <p className="text-sm text-slate-500">
          {t("by", { author: quiz.author })}
          {quiz.authorAffiliation && ` · ${quiz.authorAffiliation}`}
          {" · "}
          {t("version", { n: quiz.version })}
          {" · "}
          {new Date(quiz.publishedAt).toLocaleDateString()}
        </p>

        {quiz.description && (
          <p className="mt-3 text-slate-700">{quiz.description}</p>
        )}

        {quiz.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {quiz.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
            ))}
          </div>
        )}
      </header>

      {/* Metadata grid */}
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm mb-6 p-4 rounded-lg bg-slate-50 border">
        {quiz.schoolLevel && (
          <>
            <dt className="text-slate-500 font-medium">Level</dt>
            <dd className="text-slate-800 col-span-2 sm:col-span-1">{quiz.schoolLevel}</dd>
          </>
        )}
        {quiz.subject && (
          <>
            <dt className="text-slate-500 font-medium">Subject</dt>
            <dd className="text-slate-800 col-span-2 sm:col-span-1">{quiz.subject}</dd>
          </>
        )}
        {(quiz.ageMin || quiz.ageMax) && (
          <>
            <dt className="text-slate-500 font-medium">Age</dt>
            <dd className="text-slate-800 col-span-2 sm:col-span-1">
              {quiz.ageMin ?? "?"} – {quiz.ageMax ?? "?"}
            </dd>
          </>
        )}
        <dt className="text-slate-500 font-medium">Questions</dt>
        <dd className="text-slate-800 col-span-2 sm:col-span-1">{quiz.questionCount}</dd>
        <dt className="text-slate-500 font-medium">{t("license", { license: "" }).split(":")[0]}</dt>
        <dd className="text-slate-800 col-span-2 sm:col-span-1">{quiz.license}</dd>
        <dt className="text-slate-500 font-medium">Downloads</dt>
        <dd className="text-slate-800 col-span-2 sm:col-span-1">
          {t("downloads", { count: quiz.downloadsCount })}
        </dd>
        <dt className="text-slate-500 font-medium">Plays</dt>
        <dd className="text-slate-800 col-span-2 sm:col-span-1">
          {t("plays", { count: quiz.playsCount })}
        </dd>
      </dl>

      <HubQuizDetailActions quizId={quiz.id} />

      {/* Question previews — no correct answers */}
      {questions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">
            Questions ({questions.length})
          </h2>
          <ol className="space-y-2">
            {questions.map((q) => (
              <li
                key={q.order}
                className="flex gap-3 rounded border bg-white p-3 text-sm"
              >
                <span className="shrink-0 w-6 text-center font-mono text-slate-400">
                  {q.order + 1}
                </span>
                <div className="flex-1">
                  <span className="font-medium text-slate-700">{q.text}</span>
                  <div className="mt-1 flex gap-2 text-xs text-slate-400">
                    <span>{q.type}</span>
                    <span>· {q.timeLimit}s</span>
                    <span>· {q.points}pt</span>
                    {q.hasMedia && <span>· 🖼</span>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
