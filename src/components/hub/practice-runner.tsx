"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AnswerInput } from "@/components/live/player-view";
import { CorrectAnswerView } from "@/components/practice/correct-answer-view";
import type {
  AnswerValue,
  QuestionOptions,
  MultipleChoiceOptions,
  OrderingOptions,
  SpotErrorOptions,
  NumericEstimationOptions,
  ImageHotspotOptions,
  CodeCompletionOptions,
} from "@/types";
import type { QuestionType } from "@prisma/client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface QuestionData {
  order: number;
  total: number;
  question: {
    type: string;
    text: string;
    timeLimit: number;
    points: number;
    options: unknown;
  };
}

interface AnswerResult {
  isCorrect: boolean;
  correctOptions: unknown;
  isLast: boolean;
}

interface AnswerRecord {
  order: number;
  isCorrect: boolean;
  correctOptions: unknown;
}

interface PracticeRunnerProps {
  quizId: string;
  runId: string;
  title: string;
  authorName: string;
  questionCount: number;
}

type Phase = "intro" | "loading" | "question" | "feedback" | "results";

/* ------------------------------------------------------------------ */
/*  Helper: reconstruct a full QuestionOptions from                    */
/*  the stripped question options (no correct-answer keys) plus        */
/*  the correctOptions payload returned by the answer API.            */
/*  The result is compatible with CorrectAnswerView.                   */
/* ------------------------------------------------------------------ */

function buildFeedbackOptions(
  type: string,
  strippedOptions: unknown,
  correctOptions: unknown,
): QuestionOptions {
  const stripped = (strippedOptions ?? {}) as Record<string, unknown>;
  const correct = (correctOptions ?? {}) as Record<string, unknown>;

  switch (type) {
    case "TRUE_FALSE":
      // correctOptions: { correct: boolean }
      return correct as unknown as QuestionOptions;

    case "MULTIPLE_CHOICE": {
      // stripped: { choices: { text: string }[] }   (isCorrect stripped out)
      // correct:  { correctIndices: number[] }
      const choices = (stripped.choices ?? []) as { text: string }[];
      const correctIndices = (correct.correctIndices ?? []) as number[];
      return {
        choices: choices.map((c, i) => ({
          text: c.text,
          isCorrect: correctIndices.includes(i),
        })),
      } as MultipleChoiceOptions;
    }

    case "OPEN_ANSWER":
      // correctOptions: { acceptedAnswers: string[] }
      return correct as unknown as QuestionOptions;

    case "ORDERING":
      // stripped: { items: string[] }   (correctOrder stripped)
      // correct:  { correctOrder: number[] }
      return {
        items: (stripped.items ?? []) as string[],
        correctOrder: (correct.correctOrder ?? []) as number[],
      } as OrderingOptions;

    case "MATCHING":
      // correctOptions: { pairs: { left: string; right: string }[] }
      return correct as unknown as QuestionOptions;

    case "SPOT_ERROR":
      // stripped: { lines: string[]; explanation?: string }
      // correct:  { errorIndices: number[] }
      return {
        lines: (stripped.lines ?? []) as string[],
        errorIndices: (correct.errorIndices ?? []) as number[],
        explanation: stripped.explanation as string | undefined,
      } as SpotErrorOptions;

    case "NUMERIC_ESTIMATION":
      // stripped: { maxRange?: number; unit?: string }
      // correct:  { correctValue: number; tolerance: number }
      return {
        correctValue: correct.correctValue as number,
        tolerance: correct.tolerance as number,
        maxRange: (stripped.maxRange ?? 0) as number,
        unit: stripped.unit as string | undefined,
      } as NumericEstimationOptions;

    case "IMAGE_HOTSPOT":
      // stripped: { imageUrl: string; tolerance?: number }
      // correct:  { hotspot: { x: number; y: number; radius: number } }
      return {
        imageUrl: (stripped.imageUrl ?? "") as string,
        hotspot: (correct.hotspot ?? { x: 0, y: 0, radius: 0 }) as { x: number; y: number; radius: number },
        tolerance: (stripped.tolerance ?? 0) as number,
      } as ImageHotspotOptions;

    case "CODE_COMPLETION":
      // stripped: { codeLines, blankLineIndex, mode, choices? }
      // correct:  { correctAnswer: string }
      return {
        ...stripped,
        correctAnswer: correct.correctAnswer as string,
      } as CodeCompletionOptions;

    default:
      return stripped as unknown as QuestionOptions;
  }
}

/* ------------------------------------------------------------------ */
/*  Shared frame                                                      */
/* ------------------------------------------------------------------ */

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-indigo-50 via-white to-violet-50 p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-indigo-100 bg-white p-6 shadow-xl shadow-indigo-100/40 sm:p-10">
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PracticeRunner({
  quizId: _quizId,
  runId,
  title,
  authorName,
  questionCount,
}: PracticeRunnerProps) {
  const tp = useTranslations("practice");
  const tl = useTranslations("live");

  const [phase, setPhase] = useState<Phase>("intro");
  const [currentOrder, setCurrentOrder] = useState(0);
  const [questionData, setQuestionData] = useState<QuestionData | null>(null);
  const [lastResult, setLastResult] = useState<AnswerResult | null>(null);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchQuestion = useCallback(
    async (order: number) => {
      setPhase("loading");
      setError(null);
      try {
        const res = await fetch(
          `/api/hub/practice/${runId}/question/${order}`,
        );
        if (!res.ok) {
          setError(`Failed to load question (${res.status})`);
          return;
        }
        const data = (await res.json()) as QuestionData;
        setQuestionData(data);
        setPhase("question");
      } catch (err) {
        setError(String(err));
      }
    },
    [runId],
  );

  const handleStart = () => {
    fetchQuestion(0);
  };

  const handleAnswer = useCallback(
    async (value: AnswerValue) => {
      if (!questionData) return;
      setPhase("loading");
      try {
        const res = await fetch(`/api/hub/practice/${runId}/answer`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ order: questionData.order, value }),
        });
        if (!res.ok) {
          setError(`Failed to submit answer (${res.status})`);
          return;
        }
        const result = (await res.json()) as AnswerResult;
        setLastResult(result);
        setAnswers((prev) => [
          ...prev,
          {
            order: questionData.order,
            isCorrect: result.isCorrect,
            correctOptions: result.correctOptions,
          },
        ]);
        setPhase("feedback");
      } catch (err) {
        setError(String(err));
      }
    },
    [runId, questionData],
  );

  const handleNext = () => {
    if (lastResult?.isLast) {
      setPhase("results");
    } else {
      const nextOrder = currentOrder + 1;
      setCurrentOrder(nextOrder);
      fetchQuestion(nextOrder);
    }
  };

  // Prefetch next question in background when in feedback phase
  useEffect(() => {
    if (phase === "feedback" && lastResult && !lastResult.isLast) {
      // Optimistic prefetch – errors are silently ignored
      void fetch(`/api/hub/practice/${runId}/question/${currentOrder + 1}`);
    }
  }, [phase, lastResult, runId, currentOrder]);

  const correctCount = answers.filter((a) => a.isCorrect).length;
  const successRate =
    answers.length > 0
      ? Math.round((correctCount / answers.length) * 100)
      : 0;

  /* ---- Render ---- */

  if (error) {
    return (
      <Frame>
        <div className="text-center">
          <p className="font-medium text-rose-600">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-4 rounded-xl bg-slate-100 px-4 py-2 font-medium text-slate-700 hover:bg-slate-200"
          >
            Riprova
          </button>
        </div>
      </Frame>
    );
  }

  if (phase === "intro") {
    return (
      <Frame>
        <div className="text-center">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-2xl font-black text-white shadow-lg shadow-indigo-200">
            Q
          </div>
          <h1 data-testid="practice-title" className="text-2xl font-black text-slate-900">
            {title}
          </h1>
          <p className="mt-2 text-sm text-slate-500">{tp("author", { name: authorName })}</p>
          <p className="mt-1 text-sm font-medium text-indigo-600">
            {tp("questionCount", { count: questionCount })}
          </p>
          <p className="mt-3 text-sm italic text-slate-400">{tp("introNote")}</p>
          <button
            data-testid="start-button"
            onClick={handleStart}
            className="mt-6 rounded-xl bg-indigo-600 px-8 py-3 font-semibold text-white shadow-lg shadow-indigo-200 transition-colors hover:bg-indigo-700"
          >
            {tp("start")}
          </button>
        </div>
      </Frame>
    );
  }

  if (phase === "loading") {
    return (
      <Frame>
        <div className="flex items-center justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-400 border-t-transparent" />
        </div>
      </Frame>
    );
  }

  if (phase === "question" && questionData) {
    return (
      <Frame>
        <div className="space-y-6">
          <div>
            <div className="mb-2 flex justify-between text-xs font-semibold text-slate-400">
              <span>
                Domanda {questionData.order + 1} di {questionData.total}
              </span>
              <span>{questionData.question.points} pt</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                style={{
                  width: `${((questionData.order + 1) / questionData.total) * 100}%`,
                }}
              />
            </div>
          </div>
          <h2 className="text-xl font-bold leading-snug text-slate-800">
            {questionData.question.text}
          </h2>
          <AnswerInput
            type={questionData.question.type as QuestionType}
            options={questionData.question.options as QuestionOptions}
            onSubmit={handleAnswer}
          />
        </div>
      </Frame>
    );
  }

  if (phase === "feedback" && questionData && lastResult) {
    const feedbackOptions = buildFeedbackOptions(
      questionData.question.type,
      questionData.question.options,
      lastResult.correctOptions,
    );
    return (
      <Frame>
        <div className="space-y-5 text-center">
          <div
            className={`mx-auto grid h-20 w-20 place-items-center rounded-full text-4xl font-black ${
              lastResult.isCorrect
                ? "bg-emerald-100 text-emerald-600"
                : "bg-rose-100 text-rose-600"
            }`}
          >
            {lastResult.isCorrect ? "✓" : "✗"}
          </div>
          <p className="text-lg font-semibold text-slate-700">{tp("yourAnswer")}</p>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
              {tl("correctAnswer")}
            </p>
            <CorrectAnswerView
              type={questionData.question.type as QuestionType}
              options={feedbackOptions}
            />
          </div>
          <button
            data-testid="next-button"
            onClick={handleNext}
            className="rounded-xl bg-indigo-600 px-6 py-2.5 font-semibold text-white shadow-lg shadow-indigo-200 transition-colors hover:bg-indigo-700"
          >
            {lastResult.isLast ? tp("seeResults") : tp("next")}
          </button>
        </div>
      </Frame>
    );
  }

  if (phase === "results") {
    return (
      <Frame>
        <div className="space-y-5 text-center">
          <h2 className="text-2xl font-black text-slate-900">{tp("finalResult")}</h2>
          <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-200">
            <span className="text-4xl font-black tabular-nums">{successRate}%</span>
          </div>
          <p className="text-slate-600">
            {tp("correctQuestions")}{" "}
            <span className="font-bold text-slate-900">
              {correctCount}/{answers.length}
            </span>
          </p>
          <a
            href="/explore"
            className="inline-block rounded-xl bg-slate-100 px-6 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-200"
          >
            {tp("backToExplore")}
          </a>
        </div>
      </Frame>
    );
  }

  return null;
}
