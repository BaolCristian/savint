"use client";

import { useState, useEffect, useCallback } from "react";
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
        hotspot: correct.hotspot as { x: number; y: number; radius: number },
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
      <div className="text-center py-10">
        <p className="text-red-600 font-medium">{error}</p>
        <button
          onClick={() => setError(null)}
          className="mt-4 px-4 py-2 bg-slate-200 rounded hover:bg-slate-300"
        >
          Retry
        </button>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center space-y-4">
        <h1
          data-testid="practice-title"
          className="text-2xl font-bold text-slate-900"
        >
          {title}
        </h1>
        <p className="text-slate-500 text-sm">
          {tp("author", { name: authorName })}
        </p>
        <p className="text-slate-600 text-sm">
          {tp("questionCount", { count: questionCount })}
        </p>
        <p className="text-slate-500 text-sm italic">{tp("introNote")}</p>
        <button
          data-testid="start-button"
          onClick={handleStart}
          className="mt-4 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors"
        >
          {tp("start")}
        </button>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (phase === "question" && questionData) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
        <div className="flex justify-between text-xs text-slate-400 font-medium uppercase tracking-wide">
          <span>
            {questionData.order + 1} / {questionData.total}
          </span>
          <span>{questionData.question.points} pts</span>
        </div>
        <h2 className="text-xl font-semibold text-slate-800">
          {questionData.question.text}
        </h2>
        <AnswerInput
          type={questionData.question.type as QuestionType}
          options={questionData.question.options as QuestionOptions}
          onSubmit={handleAnswer}
        />
      </div>
    );
  }

  if (phase === "feedback" && questionData && lastResult) {
    const feedbackOptions = buildFeedbackOptions(
      questionData.question.type,
      questionData.question.options,
      lastResult.correctOptions,
    );
    return (
      <div className="max-w-2xl mx-auto py-8 px-4 space-y-4 text-center">
        <div
          className={`text-5xl font-bold ${lastResult.isCorrect ? "text-emerald-500" : "text-rose-500"}`}
        >
          {lastResult.isCorrect ? "✓" : "✗"}
        </div>
        <p className="text-lg text-slate-700">
          {tp("yourAnswer")}
        </p>
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-left">
          <p className="text-xs uppercase text-slate-500 font-semibold mb-2">
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
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-colors"
        >
          {lastResult.isLast ? tp("seeResults") : tp("next")}
        </button>
      </div>
    );
  }

  if (phase === "results") {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">
          {tp("finalResult")}
        </h2>
        <div className="text-4xl font-bold text-indigo-600">{successRate}%</div>
        <p className="text-slate-600">
          {tp("correctQuestions")} {correctCount}/{answers.length}
        </p>
        <a
          href="/explore"
          className="inline-block mt-4 px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl transition-colors"
        >
          {tp("backToExplore")}
        </a>
      </div>
    );
  }

  return null;
}
