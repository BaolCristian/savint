"use client";

import { useTranslations } from "next-intl";
import { withBasePath } from "@/lib/base-path";
import type {
  QuestionOptions,
  MultipleChoiceOptions,
  TrueFalseOptions,
  OpenAnswerOptions,
  OrderingOptions,
  MatchingOptions,
  SpotErrorOptions,
  NumericEstimationOptions,
  ImageHotspotOptions,
  CodeCompletionOptions,
} from "@/types";
import type { QuestionType } from "@prisma/client";

export function CorrectAnswerView({
  type,
  options,
}: {
  type: QuestionType;
  options: QuestionOptions;
}) {
  const tc = useTranslations("common");

  switch (type) {
    case "MULTIPLE_CHOICE": {
      const mc = options as MultipleChoiceOptions;
      const correct = mc.choices.filter((c) => c.isCorrect).map((c) => c.text);
      return (
        <ul className="list-disc list-inside space-y-0.5">
          {correct.map((txt, i) => <li key={i} className="font-semibold">{txt}</li>)}
        </ul>
      );
    }
    case "TRUE_FALSE": {
      const tf = options as TrueFalseOptions;
      return <span className="font-semibold">{tf.correct ? tc("true") : tc("false")}</span>;
    }
    case "OPEN_ANSWER": {
      const oa = options as OpenAnswerOptions;
      return (
        <div className="flex flex-wrap gap-1">
          {oa.acceptedAnswers.map((a, i) => (
            <span key={i} className="bg-white/70 px-2 py-0.5 rounded font-mono text-xs">
              {a}
            </span>
          ))}
        </div>
      );
    }
    case "ORDERING": {
      const ord = options as OrderingOptions;
      const orderedTexts = ord.correctOrder.map((i) => ord.items[i]);
      return (
        <ol className="list-decimal list-inside space-y-0.5">
          {orderedTexts.map((txt, i) => <li key={i} className="font-semibold">{txt}</li>)}
        </ol>
      );
    }
    case "MATCHING": {
      const mat = options as MatchingOptions;
      return (
        <ul className="space-y-0.5">
          {mat.pairs.map((p, i) => (
            <li key={i} className="font-semibold">{p.left} → {p.right}</li>
          ))}
        </ul>
      );
    }
    case "SPOT_ERROR": {
      const se = options as SpotErrorOptions;
      const errs = se.errorIndices.map((i) => ({ idx: i + 1, line: se.lines[i] }));
      return (
        <div>
          <ul className="list-disc list-inside font-mono text-xs">
            {errs.map((e) => <li key={e.idx} className="font-semibold">{e.idx}: {e.line}</li>)}
          </ul>
          {se.explanation && (
            <p className="mt-1.5 text-xs opacity-80">{se.explanation}</p>
          )}
        </div>
      );
    }
    case "NUMERIC_ESTIMATION": {
      const ne = options as NumericEstimationOptions;
      return (
        <span className="font-semibold">
          {ne.correctValue}{ne.unit ? ` ${ne.unit}` : ""}
          {ne.tolerance > 0 && <span className="opacity-70"> (±{ne.tolerance})</span>}
        </span>
      );
    }
    case "IMAGE_HOTSPOT": {
      const ih = options as ImageHotspotOptions;
      return (
        <div className="relative inline-block">
          <img
            src={ih.imageUrl.startsWith("/") ? withBasePath(ih.imageUrl) : ih.imageUrl}
            alt=""
            className="max-h-40 rounded-lg"
          />
          <div
            className="absolute w-5 h-5 -ml-2.5 -mt-2.5 bg-emerald-500 rounded-full border-2 border-white pointer-events-none"
            style={{ left: `${ih.hotspot.x * 100}%`, top: `${ih.hotspot.y * 100}%` }}
          />
        </div>
      );
    }
    case "CODE_COMPLETION": {
      const cc = options as CodeCompletionOptions;
      return <code className="bg-white/70 px-1.5 py-0.5 rounded font-semibold">{cc.correctAnswer}</code>;
    }
    default:
      return null;
  }
}
