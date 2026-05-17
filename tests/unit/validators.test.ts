import { describe, it, expect } from "vitest";
import { quizSchema, questionSchema } from "@/lib/validators/quiz";
import { joinSessionSchema } from "@/lib/validators/session";

describe("questionSchema", () => {
  it("validates a multiple choice question", () => {
    const result = questionSchema.safeParse({
      type: "MULTIPLE_CHOICE",
      text: "Capitale della Francia?",
      timeLimit: 20,
      points: 1000,
      order: 0,
      options: {
        choices: [
          { text: "Londra", isCorrect: false },
          { text: "Parigi", isCorrect: true },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("validates a true/false question", () => {
    const result = questionSchema.safeParse({
      type: "TRUE_FALSE",
      text: "Il sole e una stella",
      timeLimit: 15,
      points: 1000,
      order: 0,
      options: { correct: true },
    });
    expect(result.success).toBe(true);
  });

  it("validates an open answer question", () => {
    const result = questionSchema.safeParse({
      type: "OPEN_ANSWER",
      text: "Capitale Italia?",
      timeLimit: 30,
      points: 1000,
      order: 0,
      options: { acceptedAnswers: ["Roma", "rome"] },
    });
    expect(result.success).toBe(true);
  });

  it("validates an ordering question", () => {
    const result = questionSchema.safeParse({
      type: "ORDERING",
      text: "Ordina i pianeti",
      timeLimit: 30,
      points: 1000,
      order: 0,
      options: { items: ["Marte", "Venere", "Terra"], correctOrder: [1, 2, 0] },
    });
    expect(result.success).toBe(true);
  });

  it("validates a matching question", () => {
    const result = questionSchema.safeParse({
      type: "MATCHING",
      text: "Abbina paesi e capitali",
      timeLimit: 30,
      points: 1000,
      order: 0,
      options: { pairs: [{ left: "Italia", right: "Roma" }, { left: "Francia", right: "Parigi" }] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a question with empty text", () => {
    const result = questionSchema.safeParse({
      type: "TRUE_FALSE",
      text: "",
      timeLimit: 20,
      points: 1000,
      order: 0,
      options: { correct: true },
    });
    expect(result.success).toBe(false);
  });

  it("rejects timeLimit below 5", () => {
    const result = questionSchema.safeParse({
      type: "TRUE_FALSE",
      text: "Test",
      timeLimit: 2,
      points: 1000,
      order: 0,
      options: { correct: true },
    });
    expect(result.success).toBe(false);
  });
});

describe("quizSchema", () => {
  it("validates a complete quiz", () => {
    const result = quizSchema.safeParse({
      title: "Test Quiz",
      questions: [
        {
          type: "TRUE_FALSE",
          text: "Il sole e una stella",
          timeLimit: 15,
          points: 1000,
          order: 0,
          options: { correct: true },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a quiz without questions", () => {
    const result = quizSchema.safeParse({
      title: "Empty Quiz",
      questions: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a quiz without title", () => {
    const result = quizSchema.safeParse({
      title: "",
      questions: [{ type: "TRUE_FALSE", text: "Q", timeLimit: 10, points: 1000, order: 0, options: { correct: true } }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a quiz with all optional metadata fields", () => {
    const result = quizSchema.safeParse({
      title: "Quiz with metadata",
      schoolLevel: "SECONDARIA_II",
      subject: "matematica",
      language: "it",
      ageMin: 14,
      ageMax: 18,
      questions: [{
        type: "TRUE_FALSE", text: "1+1=2", timeLimit: 10, points: 1000, order: 0,
        options: { correct: true },
      }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a quiz with no metadata (all fields optional)", () => {
    const result = quizSchema.safeParse({
      title: "No metadata",
      questions: [{
        type: "TRUE_FALSE", text: "x", timeLimit: 10, points: 1000, order: 0,
        options: { correct: true },
      }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown subject slug", () => {
    const result = quizSchema.safeParse({
      title: "Bad subject",
      subject: "underwater-basket-weaving",
      questions: [{
        type: "TRUE_FALSE", text: "x", timeLimit: 10, points: 1000, order: 0,
        options: { correct: true },
      }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid language code (not ISO 639-1)", () => {
    const result = quizSchema.safeParse({
      title: "Bad lang",
      language: "italian",
      questions: [{
        type: "TRUE_FALSE", text: "x", timeLimit: 10, points: 1000, order: 0,
        options: { correct: true },
      }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid SchoolLevel", () => {
    const result = quizSchema.safeParse({
      title: "Bad level",
      schoolLevel: "ELEMENTARY",
      questions: [{
        type: "TRUE_FALSE", text: "x", timeLimit: 10, points: 1000, order: 0,
        options: { correct: true },
      }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects ageMin > ageMax", () => {
    const result = quizSchema.safeParse({
      title: "Bad age range",
      ageMin: 18,
      ageMax: 10,
      questions: [{
        type: "TRUE_FALSE", text: "x", timeLimit: 10, points: 1000, order: 0,
        options: { correct: true },
      }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects ageMin below 3 or above 99", () => {
    const tooLow = quizSchema.safeParse({
      title: "x", ageMin: 1,
      questions: [{ type: "TRUE_FALSE", text: "x", timeLimit: 10, points: 1000, order: 0, options: { correct: true } }],
    });
    const tooHigh = quizSchema.safeParse({
      title: "x", ageMax: 120,
      questions: [{ type: "TRUE_FALSE", text: "x", timeLimit: 10, points: 1000, order: 0, options: { correct: true } }],
    });
    expect(tooLow.success).toBe(false);
    expect(tooHigh.success).toBe(false);
  });
});

describe("joinSessionSchema", () => {
  it("validates a valid join request", () => {
    const result = joinSessionSchema.safeParse({
      pin: "482731",
      playerName: "Marco",
    });
    expect(result.success).toBe(true);
  });

  it("validates with optional email", () => {
    const result = joinSessionSchema.safeParse({
      pin: "123456",
      playerName: "Giulia",
      playerEmail: "giulia@scuola.it",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid PIN (too short)", () => {
    const result = joinSessionSchema.safeParse({
      pin: "123",
      playerName: "Marco",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric PIN", () => {
    const result = joinSessionSchema.safeParse({
      pin: "abcdef",
      playerName: "Marco",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty player name", () => {
    const result = joinSessionSchema.safeParse({
      pin: "123456",
      playerName: "",
    });
    expect(result.success).toBe(false);
  });
});
