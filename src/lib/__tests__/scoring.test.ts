import { describe, it, expect } from "vitest";
import {
  checkAnswer,
  calculateScore,
  calculatePartialScore,
  applyConfidence,
} from "../scoring";

// ── checkAnswer: existing types (smoke) ─────────────────────────────

describe("checkAnswer – existing types", () => {
  it("MULTIPLE_CHOICE correct", () => {
    const opts = { choices: [{ isCorrect: true }, { isCorrect: false }, { isCorrect: true }] };
    expect(checkAnswer("MULTIPLE_CHOICE", opts, { selected: [0, 2] })).toBe(true);
  });

  it("TRUE_FALSE correct", () => {
    expect(checkAnswer("TRUE_FALSE", { correct: true }, { selected: true })).toBe(true);
  });
});

// ── checkAnswer: SPOT_ERROR ─────────────────────────────────────────

describe("checkAnswer – SPOT_ERROR", () => {
  const opts = { errorIndices: [1, 3, 5] };

  it("all errors found → true", () => {
    expect(checkAnswer("SPOT_ERROR", opts, { selected: [1, 3, 5] })).toBe(true);
  });

  it("order doesn't matter", () => {
    expect(checkAnswer("SPOT_ERROR", opts, { selected: [5, 1, 3] })).toBe(true);
  });

  it("missing one → false", () => {
    expect(checkAnswer("SPOT_ERROR", opts, { selected: [1, 3] })).toBe(false);
  });

  it("extra wrong selection → false", () => {
    expect(checkAnswer("SPOT_ERROR", opts, { selected: [1, 3, 5, 7] })).toBe(false);
  });

  it("completely wrong → false", () => {
    expect(checkAnswer("SPOT_ERROR", opts, { selected: [0, 2, 4] })).toBe(false);
  });
});

// ── checkAnswer: NUMERIC_ESTIMATION ─────────────────────────────────

describe("checkAnswer – NUMERIC_ESTIMATION", () => {
  const opts = { correctValue: 100, tolerance: 5, maxRange: 50 };

  it("exact value → true", () => {
    expect(checkAnswer("NUMERIC_ESTIMATION", opts, { value: 100 })).toBe(true);
  });

  it("within tolerance → true", () => {
    expect(checkAnswer("NUMERIC_ESTIMATION", opts, { value: 104 })).toBe(true);
    expect(checkAnswer("NUMERIC_ESTIMATION", opts, { value: 95 })).toBe(true);
  });

  it("at tolerance boundary → true", () => {
    expect(checkAnswer("NUMERIC_ESTIMATION", opts, { value: 105 })).toBe(true);
  });

  it("beyond tolerance → false", () => {
    expect(checkAnswer("NUMERIC_ESTIMATION", opts, { value: 106 })).toBe(false);
  });

  it("far away → false", () => {
    expect(checkAnswer("NUMERIC_ESTIMATION", opts, { value: 200 })).toBe(false);
  });
});

// ── checkAnswer: IMAGE_HOTSPOT ──────────────────────────────────────

describe("checkAnswer – IMAGE_HOTSPOT", () => {
  const opts = { hotspot: { x: 50, y: 50, radius: 10 }, tolerance: 20 };

  it("click inside radius → true", () => {
    expect(checkAnswer("IMAGE_HOTSPOT", opts, { x: 55, y: 50 })).toBe(true);
  });

  it("click on center → true", () => {
    expect(checkAnswer("IMAGE_HOTSPOT", opts, { x: 50, y: 50 })).toBe(true);
  });

  it("click at radius boundary → true", () => {
    expect(checkAnswer("IMAGE_HOTSPOT", opts, { x: 60, y: 50 })).toBe(true);
  });

  it("click outside radius → false", () => {
    expect(checkAnswer("IMAGE_HOTSPOT", opts, { x: 70, y: 50 })).toBe(false);
  });

  it("click far away → false", () => {
    expect(checkAnswer("IMAGE_HOTSPOT", opts, { x: 200, y: 200 })).toBe(false);
  });
});

// ── checkAnswer: CODE_COMPLETION ────────────────────────────────────

describe("checkAnswer – CODE_COMPLETION", () => {
  describe("choice mode", () => {
    const opts = {
      mode: "choice",
      choices: ["let", "const", "var"],
      correctAnswer: "const",
    };

    it("correct choice index → true", () => {
      expect(checkAnswer("CODE_COMPLETION", opts, { selected: 1 })).toBe(true);
    });

    it("wrong choice index → false", () => {
      expect(checkAnswer("CODE_COMPLETION", opts, { selected: 0 })).toBe(false);
    });
  });

  describe("text mode", () => {
    const opts = { mode: "text", correctAnswer: "console.log" };

    it("exact match → true", () => {
      expect(checkAnswer("CODE_COMPLETION", opts, { text: "console.log" })).toBe(true);
    });

    it("case-insensitive → true", () => {
      expect(checkAnswer("CODE_COMPLETION", opts, { text: "Console.Log" })).toBe(true);
    });

    it("extra whitespace normalized → true", () => {
      expect(checkAnswer("CODE_COMPLETION", opts, { text: " console.log " })).toBe(true);
    });

    it("wrong text → false", () => {
      expect(checkAnswer("CODE_COMPLETION", opts, { text: "console.error" })).toBe(false);
    });
  });
});

// ── calculatePartialScore: SPOT_ERROR ───────────────────────────────

describe("calculatePartialScore – SPOT_ERROR", () => {
  const opts = { errorIndices: [1, 3, 5] };
  const max = 1000;

  it("all correct → full points", () => {
    expect(calculatePartialScore("SPOT_ERROR", opts, { selected: [1, 3, 5] }, max)).toBe(1000);
  });

  it("2 of 3 correct, no false positives → ~667", () => {
    const score = calculatePartialScore("SPOT_ERROR", opts, { selected: [1, 3] }, max);
    expect(score).toBe(667);
  });

  it("1 correct + 1 false positive → net ~0", () => {
    const score = calculatePartialScore("SPOT_ERROR", opts, { selected: [1, 2] }, max);
    expect(score).toBe(0);
  });

  it("all false positives → 0 (clamped)", () => {
    const score = calculatePartialScore("SPOT_ERROR", opts, { selected: [0, 2, 4] }, max);
    expect(score).toBe(0);
  });

  it("empty selection → 0", () => {
    expect(calculatePartialScore("SPOT_ERROR", opts, { selected: [] }, max)).toBe(0);
  });
});

// ── calculatePartialScore: NUMERIC_ESTIMATION ───────────────────────

describe("calculatePartialScore – NUMERIC_ESTIMATION", () => {
  const opts = { correctValue: 100, tolerance: 5, maxRange: 50 };
  const max = 1000;

  it("exact → full", () => {
    expect(calculatePartialScore("NUMERIC_ESTIMATION", opts, { value: 100 }, max)).toBe(1000);
  });

  it("within tolerance → full", () => {
    expect(calculatePartialScore("NUMERIC_ESTIMATION", opts, { value: 104 }, max)).toBe(1000);
  });

  it("halfway between tolerance and maxRange → ~500", () => {
    // scarto=27.5, tolerance=5, maxRange=50 → 1 - (22.5/45) = 0.5
    const score = calculatePartialScore("NUMERIC_ESTIMATION", opts, { value: 127.5 }, max);
    expect(score).toBe(500);
  });

  it("at maxRange → 0", () => {
    expect(calculatePartialScore("NUMERIC_ESTIMATION", opts, { value: 150 }, max)).toBe(0);
  });

  it("beyond maxRange → 0", () => {
    expect(calculatePartialScore("NUMERIC_ESTIMATION", opts, { value: 200 }, max)).toBe(0);
  });
});

// ── calculatePartialScore: IMAGE_HOTSPOT ────────────────────────────

describe("calculatePartialScore – IMAGE_HOTSPOT", () => {
  const opts = { hotspot: { x: 50, y: 50, radius: 10 }, tolerance: 20 };
  const max = 1000;

  it("click on center → full", () => {
    expect(calculatePartialScore("IMAGE_HOTSPOT", opts, { x: 50, y: 50 }, max)).toBe(1000);
  });

  it("click inside radius → full", () => {
    expect(calculatePartialScore("IMAGE_HOTSPOT", opts, { x: 55, y: 50 }, max)).toBe(1000);
  });

  it("click in tolerance zone → partial", () => {
    // dist = 20, radius = 10, tol = 20 → 1 - (10/20) = 0.5
    const score = calculatePartialScore("IMAGE_HOTSPOT", opts, { x: 70, y: 50 }, max);
    expect(score).toBe(500);
  });

  it("click at outer boundary → 0", () => {
    // dist = 30, radius=10, tol=20 → outside
    const score = calculatePartialScore("IMAGE_HOTSPOT", opts, { x: 80, y: 50 }, max);
    expect(score).toBe(0);
  });

  it("click far away → 0", () => {
    expect(calculatePartialScore("IMAGE_HOTSPOT", opts, { x: 200, y: 200 }, max)).toBe(0);
  });
});

// ── calculatePartialScore: unknown type ─────────────────────────────

describe("calculatePartialScore – unknown type", () => {
  it("returns 0 for unsupported type", () => {
    expect(calculatePartialScore("UNKNOWN", {}, {}, 1000)).toBe(0);
  });
});

// ── applyConfidence ─────────────────────────────────────────────────

describe("applyConfidence", () => {
  it("correct + high confidence (3) → 1.2x", () => {
    expect(applyConfidence(1000, true, 3)).toBe(1200);
  });

  it("correct + medium confidence (2) → 1.0x", () => {
    expect(applyConfidence(1000, true, 2)).toBe(1000);
  });

  it("correct + low confidence (1) → 0.8x", () => {
    expect(applyConfidence(1000, true, 1)).toBe(800);
  });

  it("correct + unknown level → 1.0x default", () => {
    expect(applyConfidence(1000, true, 99)).toBe(1000);
  });

  it("wrong + high confidence (3) → malus -200", () => {
    expect(applyConfidence(500, false, 3)).toBe(300);
  });

  it("wrong + high confidence, score too low → clamped to 0", () => {
    expect(applyConfidence(100, false, 3)).toBe(0);
  });

  it("wrong + medium confidence (2) → no change", () => {
    expect(applyConfidence(500, false, 2)).toBe(500);
  });

  it("wrong + low confidence (1) → no change", () => {
    expect(applyConfidence(500, false, 1)).toBe(500);
  });
});

// ── calculateScore (existing, smoke) ────────────────────────────────

describe("calculateScore", () => {
  it("correct answer with no time → full points", () => {
    expect(calculateScore({ isCorrect: true, responseTimeMs: 0, timeLimit: 30, maxPoints: 1000 })).toBe(1000);
  });

  it("correct answer at time limit → half points", () => {
    expect(calculateScore({ isCorrect: true, responseTimeMs: 30000, timeLimit: 30, maxPoints: 1000 })).toBe(500);
  });

  it("incorrect → 0", () => {
    expect(calculateScore({ isCorrect: false, responseTimeMs: 0, timeLimit: 30, maxPoints: 1000 })).toBe(0);
  });
});

// ── checkAnswer: MATCHING ───────────────────────────────────────────

describe("checkAnswer – MATCHING", () => {
  const opts = {
    pairs: [
      { left: "Italia", right: "Roma" },
      { left: "Francia", right: "Parigi" },
      { left: "Spagna", right: "Madrid" },
    ],
  };

  it("all pairs correct → true", () => {
    const value = {
      matchedPairs: [
        { left: "Italia", right: "Roma" },
        { left: "Francia", right: "Parigi" },
        { left: "Spagna", right: "Madrid" },
      ],
    };
    expect(checkAnswer("MATCHING", opts, value)).toBe(true);
  });

  it("correct pairs in different order → true", () => {
    const value = {
      matchedPairs: [
        { left: "Spagna", right: "Madrid" },
        { left: "Italia", right: "Roma" },
        { left: "Francia", right: "Parigi" },
      ],
    };
    expect(checkAnswer("MATCHING", opts, value)).toBe(true);
  });

  it("one pair wrong → false", () => {
    const value = {
      matchedPairs: [
        { left: "Italia", right: "Parigi" },
        { left: "Francia", right: "Roma" },
        { left: "Spagna", right: "Madrid" },
      ],
    };
    expect(checkAnswer("MATCHING", opts, value)).toBe(false);
  });

  it("missing a pair → false", () => {
    const value = {
      matchedPairs: [
        { left: "Italia", right: "Roma" },
        { left: "Francia", right: "Parigi" },
      ],
    };
    expect(checkAnswer("MATCHING", opts, value)).toBe(false);
  });

  it("empty matchedPairs → false", () => {
    expect(checkAnswer("MATCHING", opts, { matchedPairs: [] })).toBe(false);
  });

  it("undefined matchedPairs → false", () => {
    expect(checkAnswer("MATCHING", opts, {})).toBe(false);
  });
});
