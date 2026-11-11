interface ScoreInput {
  isCorrect: boolean;
  responseTimeMs: number;
  timeLimit: number;
  maxPoints: number;
}

export function calculateScore({ isCorrect, responseTimeMs, timeLimit, maxPoints }: ScoreInput): number {
  if (!isCorrect) return 0;
  const timeLimitMs = timeLimit * 1000;
  const timeRatio = Math.min(responseTimeMs / timeLimitMs, 1);
  const multiplier = 1.0 - timeRatio * 0.5;
  return Math.round(maxPoints * multiplier);
}

/** Distinct integer indices from a client-sent selection (anything else dropped) */
function uniqueIndices(selected: unknown): number[] {
  if (!Array.isArray(selected)) return [];
  return [...new Set(selected.filter((i): i is number => Number.isInteger(i)))];
}

export function checkAnswer(type: string, options: any, value: any): boolean {
  switch (type) {
    case "MULTIPLE_CHOICE": {
      const correctSet = new Set(
        options.choices
          .map((c: any, i: number) => (c.isCorrect ? i : -1))
          .filter((i: number) => i >= 0)
      );
      const selected = uniqueIndices(value.selected);
      // Correct if at least one correct selected and no wrong ones
      const hasWrong = selected.some((i: number) => !correctSet.has(i));
      const hasCorrect = selected.some((i: number) => correctSet.has(i));
      return hasCorrect && !hasWrong;
    }
    case "TRUE_FALSE":
      return value.selected === options.correct;
    case "OPEN_ANSWER":
      return options.acceptedAnswers.some(
        (a: string) => a.toLowerCase().trim() === value.text.toLowerCase().trim()
      );
    case "ORDERING": {
      // Compare by text: the player sends orderedTexts (texts in the order they chose)
      // The server knows the correct order from options.correctOrder + options.items
      const correctTexts = (options.correctOrder as number[]).map(
        (i: number) => options.items[i]
      );
      const playerTexts: string[] = value.orderedTexts ?? [];
      return JSON.stringify(playerTexts) === JSON.stringify(correctTexts);
    }
    case "MATCHING": {
      // Compare by text: the player sends matchedPairs with actual left/right texts
      const correctPairs = (options.pairs as { left: string; right: string }[])
        .map((p) => `${p.left}::${p.right}`)
        .sort();
      const playerPairs = ((value.matchedPairs ?? []) as { left: string; right: string }[])
        .map((p) => `${p.left}::${p.right}`)
        .sort();
      return JSON.stringify(playerPairs) === JSON.stringify(correctPairs);
    }
    case "SPOT_ERROR": {
      const errorSet = new Set(options.errorIndices as number[]);
      const selectedSet = new Set(value.selected as number[]);
      if (errorSet.size !== selectedSet.size) return false;
      for (const idx of errorSet) {
        if (!selectedSet.has(idx)) return false;
      }
      return true;
    }
    case "NUMERIC_ESTIMATION": {
      if (!Number.isFinite(value.value)) return false;
      const scarto = Math.abs(value.value - options.correctValue);
      return scarto <= options.tolerance;
    }
    case "IMAGE_HOTSPOT": {
      const { hotspot } = options;
      const dx = value.x - hotspot.x;
      const dy = value.y - hotspot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist <= hotspot.radius;
    }
    case "CODE_COMPLETION": {
      if (options.mode === "choice") {
        // The player sees the choices shuffled: the chosen text is what
        // identifies the answer, an index only fits the original order.
        if (typeof value.text === "string") return value.text === options.correctAnswer;
        const correctIdx = options.choices?.indexOf(options.correctAnswer) ?? -1;
        return value.selected === correctIdx;
      }
      const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
      return normalize(value.text) === normalize(options.correctAnswer);
    }
    default:
      return false;
  }
}

/** For types with partial scoring, returns raw points (before time bonus). */
export function calculatePartialScore(type: string, options: any, value: any, maxPoints: number): number {
  switch (type) {
    case "MULTIPLE_CHOICE": {
      const choices = options.choices as { isCorrect: boolean }[];
      const correctIndices = new Set(
        choices.map((c, i) => (c.isCorrect ? i : -1)).filter((i) => i >= 0)
      );
      const totalCorrect = correctIndices.size;
      const totalWrong = choices.length - totalCorrect;
      // Each index counts once: repeating a correct choice must not multiply points
      const selected = uniqueIndices(value.selected);
      // Each correct answer gives points proportional to total correct
      // Each wrong answer penalizes proportional to total wrong options
      // This way: all correct + all wrong = maxPoints - maxPoints = 0
      const pointsPerCorrect = maxPoints / totalCorrect;
      const penaltyPerWrong = totalWrong > 0 ? maxPoints / totalWrong : maxPoints;
      let score = 0;
      for (const s of selected) {
        if (correctIndices.has(s)) {
          score += pointsPerCorrect;
        } else {
          score -= penaltyPerWrong;
        }
      }
      return Math.max(0, Math.round(score));
    }
    case "SPOT_ERROR": {
      const errorIndices = new Set(options.errorIndices as number[]);
      const selected = new Set(value.selected as number[]);
      const totalErrors = errorIndices.size;
      const perItem = maxPoints / totalErrors;
      let score = 0;
      for (const s of selected) {
        if (errorIndices.has(s)) {
          score += perItem;
        } else {
          score -= perItem;
        }
      }
      return Math.max(0, Math.round(score));
    }
    case "NUMERIC_ESTIMATION": {
      const { correctValue, tolerance, maxRange } = options;
      if (!Number.isFinite(value.value)) return 0;
      const scarto = Math.abs(value.value - correctValue);
      if (scarto <= tolerance) return maxPoints;
      if (scarto >= maxRange) return 0;
      return Math.round(maxPoints * (1 - (scarto - tolerance) / (maxRange - tolerance)));
    }
    case "IMAGE_HOTSPOT": {
      const { hotspot, tolerance: tol } = options;
      const dx = value.x - hotspot.x;
      const dy = value.y - hotspot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= hotspot.radius) return maxPoints;
      if (dist >= hotspot.radius + tol) return 0;
      return Math.round(maxPoints * (1 - (dist - hotspot.radius) / tol));
    }
    default:
      return 0;
  }
}

/** Points lost by a wrong answer given as "very sure" */
export const CONFIDENCE_PENALTY = 200;

/**
 * Points of an answer once the player has said how sure they are.
 * A wrong answer given as "very sure" costs CONFIDENCE_PENALTY, so the
 * result can be negative: the caller decides how far the total may drop.
 */
export function applyConfidence(score: number, isCorrect: boolean, confidenceLevel: number): number {
  if (isCorrect) {
    const multipliers: Record<number, number> = { 1: 0.8, 2: 1.0, 3: 1.2 };
    return Math.round(score * (multipliers[confidenceLevel] ?? 1.0));
  } else {
    if (confidenceLevel === 3) return score - CONFIDENCE_PENALTY;
    return score;
  }
}
