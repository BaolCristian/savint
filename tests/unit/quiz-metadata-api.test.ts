import { describe, it, expect } from "vitest";
import { quizSchema } from "@/lib/validators/quiz";

describe("Quiz API payload boundary", () => {
  it("strips no fields when full metadata is sent", () => {
    const input = {
      title: "Demo",
      schoolLevel: "PRIMARIA" as const,
      subject: "matematica",
      language: "it",
      ageMin: 6,
      ageMax: 10,
      tags: ["aritmetica"],
      consentAccepted: true,
      license: "CC_BY" as const,
      questions: [{
        type: "TRUE_FALSE" as const, text: "2+2=4",
        timeLimit: 10, points: 1000, order: 0,
        options: { correct: true },
      }],
    };
    const parsed = quizSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.schoolLevel).toBe("PRIMARIA");
    expect(parsed.data.subject).toBe("matematica");
    expect(parsed.data.language).toBe("it");
    expect(parsed.data.ageMin).toBe(6);
    expect(parsed.data.ageMax).toBe(10);
  });

  it("accepts explicit null to clear a metadata field", () => {
    const parsed = quizSchema.safeParse({
      title: "Demo",
      schoolLevel: null,
      subject: null,
      language: null,
      ageMin: null,
      ageMax: null,
      questions: [{
        type: "TRUE_FALSE" as const, text: "x",
        timeLimit: 10, points: 1000, order: 0,
        options: { correct: true },
      }],
    });
    expect(parsed.success).toBe(true);
  });
});
