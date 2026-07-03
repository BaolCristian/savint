import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { manifestToPracticeQuiz, loadManifest } from "@/lib/hub/manifest-practice";

const META = { id: "hq1", title: "Geo", description: null, authorName: "Prof" };

describe("manifestToPracticeQuiz", () => {
  it("maps manifest questions to PracticeView shape with synthetic ids and order", () => {
    const manifest = {
      quiz: {
        questions: [
          {
            type: "MULTIPLE_CHOICE",
            text: "Capitale della Francia?",
            timeLimit: 30,
            points: 500,
            options: { choices: [{ text: "Parigi", isCorrect: true }, { text: "Londra", isCorrect: false }] },
          },
          {
            type: "TRUE_FALSE",
            text: "Roma è in Italia",
            image: "assets/q1.png",
            options: { correct: true },
          },
        ],
      },
    };
    const quiz = manifestToPracticeQuiz(manifest, META);
    expect(quiz.id).toBe("hq1");
    expect(quiz.questions).toHaveLength(2);
    expect(quiz.questions[0]).toMatchObject({
      id: "hq1-q0",
      type: "MULTIPLE_CHOICE",
      timeLimit: 30,
      points: 500,
      order: 0,
      mediaUrl: null,
    });
    // answers stay available for client-side checkAnswer
    expect((quiz.questions[0].options as { choices: { isCorrect: boolean }[] }).choices[0].isCorrect).toBe(true);
    // defaults + zip-asset media dropped
    expect(quiz.questions[1]).toMatchObject({ timeLimit: 20, points: 1000, mediaUrl: null, order: 1 });
  });

  it("handles a manifest without questions", () => {
    expect(manifestToPracticeQuiz({}, META).questions).toEqual([]);
  });
});

describe("loadManifest", () => {
  it("extracts manifest.json from a qlz zip", async () => {
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ version: 1, quiz: { title: "X", questions: [] } }));
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    const manifest = await loadManifest(buf);
    expect(manifest.quiz?.questions).toEqual([]);
  });

  it("throws on a zip without manifest.json", async () => {
    const zip = new JSZip();
    zip.file("altro.txt", "x");
    const buf = await zip.generateAsync({ type: "nodebuffer" });
    await expect(loadManifest(buf)).rejects.toThrow("invalid_quiz");
  });
});
