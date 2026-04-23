import type { QuestionType } from "@prisma/client";
import type {
  QuestionOptions,
  MultipleChoiceOptions,
  OrderingOptions,
  MatchingOptions,
  SpotErrorOptions,
  NumericEstimationOptions,
  ImageHotspotOptions,
  CodeCompletionOptions,
} from "@/types";

/** Client-side equivalent of the server sanitizer — hides correct answers
 *  and shuffles shufflable content so self-practice can reuse AnswerInput. */
export function sanitizeOptionsClient(
  type: QuestionType,
  options: QuestionOptions,
): QuestionOptions {
  switch (type) {
    case "MULTIPLE_CHOICE": {
      const mc = options as MultipleChoiceOptions;
      const correctCount = mc.choices.filter((c) => c.isCorrect).length;
      return {
        choices: mc.choices.map((c) => ({ text: c.text, isCorrect: false })),
        correctCount,
      } as any;
    }
    case "TRUE_FALSE":
      return { correct: false } as any;
    case "OPEN_ANSWER":
      return { acceptedAnswers: [] } as any;
    case "ORDERING": {
      const ord = options as OrderingOptions;
      const shuffled = [...ord.items].sort(() => Math.random() - 0.5);
      return { items: shuffled, correctOrder: [] } as any;
    }
    case "MATCHING": {
      const mat = options as MatchingOptions;
      const lefts = mat.pairs.map((p) => p.left);
      const rights = mat.pairs.map((p) => p.right).sort(() => Math.random() - 0.5);
      return { pairs: lefts.map((l, i) => ({ left: l, right: rights[i] })) } as MatchingOptions;
    }
    case "SPOT_ERROR": {
      const se = options as SpotErrorOptions;
      return { lines: se.lines, errorIndices: [], explanation: undefined } as any;
    }
    case "NUMERIC_ESTIMATION": {
      const ne = options as NumericEstimationOptions;
      return { correctValue: 0, tolerance: 0, maxRange: 0, unit: ne.unit } as any;
    }
    case "IMAGE_HOTSPOT": {
      const ih = options as ImageHotspotOptions;
      return { imageUrl: ih.imageUrl, hotspot: { x: 0, y: 0, radius: 0 }, tolerance: 0 } as any;
    }
    case "CODE_COMPLETION": {
      const cc = options as CodeCompletionOptions;
      if (cc.mode === "choice" && cc.choices) {
        const shuffled = [...cc.choices].sort(() => Math.random() - 0.5);
        return {
          codeLines: cc.codeLines,
          blankLineIndex: cc.blankLineIndex,
          correctAnswer: "",
          mode: cc.mode,
          choices: shuffled,
        } as any;
      }
      return {
        codeLines: cc.codeLines,
        blankLineIndex: cc.blankLineIndex,
        correctAnswer: "",
        mode: cc.mode,
      } as any;
    }
    default:
      return options;
  }
}
