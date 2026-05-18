"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

/* ------------------------------------------------------------------ */
/*  Minimal AnswerInput for TRUE_FALSE (inline, no external dep needed) */
/* ------------------------------------------------------------------ */

function AnswerInput({
  type,
  onSubmit,
}: {
  type: string;
  options: unknown;
  onSubmit: (v: { selected: boolean }) => void;
}) {
  if (type === "TRUE_FALSE") {
    return (
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => onSubmit({ selected: true })}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
        >
          True
        </button>
        <button
          onClick={() => onSubmit({ selected: false })}
          className="bg-rose-500 hover:bg-rose-600 text-white px-6 py-3 rounded-xl font-semibold transition-colors"
        >
          False
        </button>
      </div>
    );
  }
  return (
    <p className="text-slate-500 italic text-sm">
      Question type {type} not supported in practice mode yet
    </p>
  );
}

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
    async (value: unknown) => {
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
          type={questionData.question.type}
          options={questionData.question.options}
          onSubmit={handleAnswer}
        />
      </div>
    );
  }

  if (phase === "feedback" && questionData && lastResult) {
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
