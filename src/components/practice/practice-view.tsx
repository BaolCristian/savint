"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { withBasePath } from "@/lib/base-path";
import { checkAnswer, calculateScore, calculatePartialScore } from "@/lib/scoring";
import { sanitizeOptionsClient } from "@/lib/sanitize-options";
import { AnswerInput } from "@/components/live/player-view";
import { CorrectAnswerView } from "@/components/practice/correct-answer-view";
import type { AnswerValue, QuestionOptions } from "@/types";
import type { QuestionType } from "@prisma/client";

interface Question {
  id: string;
  type: QuestionType;
  text: string;
  mediaUrl: string | null;
  timeLimit: number;
  points: number;
  options: QuestionOptions;
  order: number;
}

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  authorName: string;
  questions: Question[];
}

type Phase = "intro" | "question" | "feedback" | "review";

interface PracticeAnswer {
  value: AnswerValue | null;
  responseTimeMs: number;
  isCorrect: boolean;
  score: number;
  /** Sanitized options snapshot (shuffled) so review shows what the user saw */
  displayedOptions: QuestionOptions;
}

const PARTIAL_TYPES: QuestionType[] = [
  "MULTIPLE_CHOICE",
  "SPOT_ERROR",
  "NUMERIC_ESTIMATION",
  "IMAGE_HOTSPOT",
];

export function PracticeView({ quiz }: { quiz: Quiz }) {
  const t = useTranslations("practice");
  const tc = useTranslations("common");
  const tl = useTranslations("live");

  const [phase, setPhase] = useState<Phase>("intro");
  const [idx, setIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [answers, setAnswers] = useState<PracticeAnswer[]>([]);
  const questionStart = useRef<number>(0);

  const totalQuestions = quiz.questions.length;
  const currentQuestion = quiz.questions[idx];

  /** Sanitized options for the current question (shuffled / solutions hidden).
   *  Memoised on idx so the shuffle is stable during the question. */
  const displayedOptions = useMemo<QuestionOptions | null>(() => {
    if (!currentQuestion) return null;
    return sanitizeOptionsClient(currentQuestion.type, currentQuestion.options);
  }, [currentQuestion]);

  const gradeAnswer = useCallback(
    (q: Question, value: AnswerValue | null, responseTimeMs: number): PracticeAnswer => {
      if (value === null) {
        return {
          value: null,
          responseTimeMs,
          isCorrect: false,
          score: 0,
          displayedOptions: displayedOptions!,
        };
      }
      const isCorrect = checkAnswer(q.type, q.options, value);
      let score = 0;
      if (PARTIAL_TYPES.includes(q.type)) {
        const raw = calculatePartialScore(q.type, q.options, value, q.points);
        const timeRatio = Math.min(responseTimeMs / (q.timeLimit * 1000), 1);
        score = Math.round(raw * (1 - timeRatio * 0.5));
      } else {
        score = calculateScore({
          isCorrect,
          responseTimeMs,
          timeLimit: q.timeLimit,
          maxPoints: q.points,
        });
      }
      return {
        value,
        responseTimeMs,
        isCorrect,
        score,
        displayedOptions: displayedOptions!,
      };
    },
    [displayedOptions],
  );

  /* ---------- timer ---------- */
  useEffect(() => {
    if (phase !== "question" || !currentQuestion) return;
    if (timeLeft <= 0) {
      // Time's up — no answer recorded
      setAnswers((prev) => [...prev, gradeAnswer(currentQuestion, null, currentQuestion.timeLimit * 1000)]);
      setPhase("feedback");
      return;
    }
    const id = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [phase, timeLeft, currentQuestion, gradeAnswer]);

  const handleStart = () => {
    setIdx(0);
    setAnswers([]);
    setPhase("question");
    setTimeLeft(quiz.questions[0]?.timeLimit ?? 20);
    questionStart.current = Date.now();
  };

  const handleSubmit = useCallback(
    (value: AnswerValue) => {
      if (!currentQuestion) return;
      const rt = Date.now() - questionStart.current;
      setAnswers((prev) => [...prev, gradeAnswer(currentQuestion, value, rt)]);
      setPhase("feedback");
    },
    [currentQuestion, gradeAnswer],
  );

  const handleNext = () => {
    const next = idx + 1;
    if (next >= totalQuestions) {
      setPhase("review");
      return;
    }
    setIdx(next);
    setTimeLeft(quiz.questions[next].timeLimit);
    setPhase("question");
    questionStart.current = Date.now();
  };

  const handleRestart = () => {
    setIdx(0);
    setAnswers([]);
    setPhase("intro");
  };

  const totalScore = answers.reduce((sum, a) => sum + a.score, 0);
  const correctCount = answers.filter((a) => a.isCorrect).length;
  const maxScore = quiz.questions.reduce((s, q) => s + q.points, 0);

  /* ---------- INTRO ---------- */
  if (phase === "intro") {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-indigo-50 via-white to-violet-50 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8 text-center">
          <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1 rounded-full mb-4 uppercase tracking-wide">
            {t("mode")}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-2">{quiz.title}</h1>
          {quiz.description && (
            <p className="text-slate-600 mb-3">{quiz.description}</p>
          )}
          <p className="text-sm text-slate-500 mb-5">{t("author", { name: quiz.authorName })}</p>

          <div className="grid grid-cols-2 gap-3 mb-6 text-left">
            <div className="bg-slate-50 rounded-xl px-3 py-2.5">
              <p className="text-[11px] uppercase font-semibold text-slate-500">{t("questions")}</p>
              <p className="text-lg font-bold text-slate-900">{totalQuestions}</p>
            </div>
            <div className="bg-slate-50 rounded-xl px-3 py-2.5">
              <p className="text-[11px] uppercase font-semibold text-slate-500">{t("maxPoints")}</p>
              <p className="text-lg font-bold text-slate-900">{maxScore.toLocaleString()}</p>
            </div>
          </div>

          <div className="text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
            {t("introNote")}
          </div>

          <button
            onClick={handleStart}
            disabled={totalQuestions === 0}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg py-3 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-[0.98] disabled:bg-slate-300"
          >
            {t("start")}
          </button>

          <Link
            href="/explore"
            className="inline-block mt-4 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            ← {t("backToExplore")}
          </Link>
        </div>
      </div>
    );
  }

  /* ---------- QUESTION ---------- */
  if (phase === "question" && currentQuestion && displayedOptions) {
    return (
      <div className="min-h-dvh bg-gray-950 p-3 sm:p-4 lg:p-6 text-white flex flex-col">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs sm:text-sm font-medium text-gray-400">
            {tl("questionCounter", { index: idx + 1, total: totalQuestions })}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-base sm:text-lg font-bold tabular-nums ${
              timeLeft <= 5 ? "bg-red-500" : "bg-gray-800"
            }`}
          >
            {timeLeft}s
          </span>
        </div>

        <div className="mb-3 h-2 rounded-full bg-gray-800 overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ease-linear ${
              timeLeft <= 5 ? "bg-red-500" : timeLeft <= 10 ? "bg-amber-500" : "bg-emerald-500"
            }`}
            style={{ width: `${(timeLeft / currentQuestion.timeLimit) * 100}%` }}
          />
        </div>

        <h2 className="mb-4 text-lg sm:text-xl lg:text-3xl font-bold text-center">
          {currentQuestion.text}
        </h2>

        {currentQuestion.mediaUrl && (
          <div className="flex justify-center mb-4">
            <img
              src={
                currentQuestion.mediaUrl.startsWith("/")
                  ? withBasePath(currentQuestion.mediaUrl)
                  : currentQuestion.mediaUrl
              }
              alt=""
              className="max-h-48 sm:max-h-64 rounded-xl"
            />
          </div>
        )}

        <div className="flex flex-1 flex-col">
          <AnswerInput
            key={idx}
            type={currentQuestion.type}
            options={displayedOptions}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    );
  }

  /* ---------- FEEDBACK ---------- */
  if (phase === "feedback" && currentQuestion) {
    const last = answers[answers.length - 1];
    const isCorrect = last.isCorrect;
    return (
      <div
        className={`min-h-dvh flex flex-col items-center justify-center p-6 text-center ${
          isCorrect
            ? "bg-gradient-to-b from-emerald-400 to-green-600"
            : "bg-gradient-to-b from-red-400 to-rose-600"
        }`}
      >
        <div className="text-7xl sm:text-8xl mb-4">{isCorrect ? "✓" : last.value === null ? "⏱" : "✗"}</div>
        <h2 className="text-3xl sm:text-4xl font-black text-white mb-2">
          {last.value === null ? tl("timeUp") : isCorrect ? tl("correct") : tl("wrong")}
        </h2>
        <p className="text-xl sm:text-2xl font-semibold text-white/90 mb-6">
          +{last.score} {tl("pointsLabel")}
        </p>

        <div className="bg-white/15 backdrop-blur rounded-2xl px-5 py-4 max-w-md w-full text-left mb-6">
          <p className="text-xs uppercase text-white/70 font-semibold mb-2">{tl("correctAnswer")}</p>
          <CorrectAnswerView type={currentQuestion.type} options={currentQuestion.options} />
        </div>

        <button
          onClick={handleNext}
          className="w-full max-w-xs bg-white text-slate-900 font-bold text-lg py-3 rounded-2xl shadow-lg active:scale-95 transition-all"
        >
          {idx + 1 >= totalQuestions ? t("seeResults") : t("next")}
        </button>
      </div>
    );
  }

  /* ---------- REVIEW ---------- */
  if (phase === "review") {
    const percent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    return (
      <div className="min-h-dvh bg-slate-50">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          {/* Summary */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-7 mb-5">
            <div className="text-center mb-5">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1">
                {t("finalResult")}
              </p>
              <h1 className="text-3xl sm:text-4xl font-black text-slate-900">{quiz.title}</h1>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-indigo-50 rounded-xl p-3">
                <p className="text-2xl font-black text-indigo-700">{totalScore.toLocaleString()}</p>
                <p className="text-xs text-indigo-600 font-semibold mt-1">{tl("totalScoreLabel")}</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3">
                <p className="text-2xl font-black text-emerald-700">
                  {correctCount}/{totalQuestions}
                </p>
                <p className="text-xs text-emerald-600 font-semibold mt-1">{t("correctQuestions")}</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3">
                <p className="text-2xl font-black text-amber-700">{percent}%</p>
                <p className="text-xs text-amber-600 font-semibold mt-1">{t("successRate")}</p>
              </div>
            </div>
          </div>

          {/* Per-question review */}
          <div className="space-y-3">
            {quiz.questions.map((q, i) => {
              const a = answers[i];
              if (!a) return null;
              const status = a.value === null ? "timeout" : a.isCorrect ? "correct" : "wrong";
              const accent =
                status === "correct"
                  ? "border-emerald-400 bg-emerald-50"
                  : status === "timeout"
                    ? "border-amber-400 bg-amber-50"
                    : "border-red-400 bg-red-50";
              const dot =
                status === "correct"
                  ? "bg-emerald-500"
                  : status === "timeout"
                    ? "bg-amber-500"
                    : "bg-red-500";
              return (
                <div key={q.id} className={`rounded-2xl border-2 ${accent} p-4 sm:p-5`}>
                  <div className="flex items-start gap-3 mb-3">
                    <span
                      className={`flex items-center justify-center ${dot} text-white rounded-full w-7 h-7 text-sm font-black shrink-0`}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 leading-snug break-words">
                        {q.text}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {(a.responseTimeMs / 1000).toFixed(1)}s · +{a.score} {tl("pointsLabel")}
                      </p>
                    </div>
                  </div>

                  {/* User answer */}
                  <div className="mb-2">
                    <p className="text-xs font-semibold uppercase text-slate-500 mb-1">
                      {t("yourAnswer")}
                    </p>
                    {a.value === null ? (
                      <p className="text-sm italic text-slate-500">{t("noAnswer")}</p>
                    ) : (
                      <div className="text-sm text-slate-800">
                        <UserAnswerView
                          type={q.type}
                          options={q.options}
                          displayedOptions={a.displayedOptions}
                          value={a.value}
                        />
                      </div>
                    )}
                  </div>

                  {/* Correct answer — only show if user got it wrong or didn't answer */}
                  {!a.isCorrect && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-500 mb-1">
                        {tl("correctAnswer")}
                      </p>
                      <div className="text-sm text-slate-800">
                        <CorrectAnswerView type={q.type} options={q.options} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <button
              onClick={handleRestart}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors"
            >
              {t("retry")}
            </button>
            <Link
              href="/explore"
              className="flex-1 text-center bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold py-3 rounded-xl transition-colors"
            >
              {t("backToExplore")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

/* ================================================================== */
/*  User answer renderer (shows what THEY chose, mapped to labels)     */
/* ================================================================== */

function UserAnswerView({
  type,
  options,
  displayedOptions,
  value,
}: {
  type: QuestionType;
  options: QuestionOptions;
  displayedOptions: QuestionOptions;
  value: AnswerValue;
}) {
  const tc = useTranslations("common");
  switch (type) {
    case "MULTIPLE_CHOICE": {
      const choices = (displayedOptions as any).choices as { text: string }[];
      const selected = (value as any).selected as number[];
      return (
        <ul className="list-disc list-inside space-y-0.5">
          {selected.map((i) => (
            <li key={i}>{choices[i]?.text ?? "—"}</li>
          ))}
        </ul>
      );
    }
    case "TRUE_FALSE":
      return <span>{(value as any).selected ? tc("true") : tc("false")}</span>;
    case "OPEN_ANSWER":
      return <span>"{(value as any).text}"</span>;
    case "ORDERING": {
      const texts = (value as any).orderedTexts as string[];
      return (
        <ol className="list-decimal list-inside space-y-0.5">
          {texts.map((t, i) => <li key={i}>{t}</li>)}
        </ol>
      );
    }
    case "MATCHING": {
      const pairs = (value as any).matchedPairs as { left: string; right: string }[];
      return (
        <ul className="space-y-0.5">
          {pairs.map((p, i) => (
            <li key={i}>{p.left} → {p.right}</li>
          ))}
        </ul>
      );
    }
    case "SPOT_ERROR": {
      const lines = (displayedOptions as any).lines as string[];
      const selected = (value as any).selected as number[];
      return (
        <ul className="list-disc list-inside space-y-0.5 font-mono text-xs">
          {selected.map((i) => <li key={i}>{i + 1}: {lines[i]}</li>)}
        </ul>
      );
    }
    case "NUMERIC_ESTIMATION": {
      const unit = (options as any).unit ?? "";
      return <span>{(value as any).value} {unit}</span>;
    }
    case "IMAGE_HOTSPOT": {
      const v = value as any;
      return <span>({Math.round(v.x * 100)}%, {Math.round(v.y * 100)}%)</span>;
    }
    case "CODE_COMPLETION": {
      const v = value as any;
      if ("text" in v) return <code className="bg-slate-100 px-1.5 py-0.5 rounded">{v.text}</code>;
      const choices = (displayedOptions as any).choices as string[];
      return <code className="bg-slate-100 px-1.5 py-0.5 rounded">{choices[v.selected] ?? "—"}</code>;
    }
    default:
      return null;
  }
}
