import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { GET } from "@/app/api/hub/practice/[runId]/question/[order]/route";
import { NextRequest } from "next/server";
import JSZip from "jszip";

function makeReq(runId: string, order: string) {
  return new NextRequest(
    `http://localhost/api/hub/practice/${runId}/question/${order}`,
  );
}

describe("GET /api/hub/practice/[runId]/question/[order]", () => {
  let hubAccountId: string;
  let quizId: string;
  let runId: string;

  beforeAll(async () => {
    const zip = new JSZip();
    zip.file(
      "manifest.json",
      JSON.stringify({
        quiz: {
          questions: [
            {
              type: "TRUE_FALSE",
              text: "Is 2+2=4?",
              timeLimit: 20,
              points: 100,
              options: { correct: true },
            },
            {
              type: "MULTIPLE_CHOICE",
              text: "What colour is the sky?",
              timeLimit: 30,
              points: 200,
              options: {
                choices: [
                  { text: "Blue", isCorrect: true },
                  { text: "Red", isCorrect: false },
                ],
              },
            },
          ],
        },
      }),
    );
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    const account = await prisma.hubAccount.create({
      data: {
        email: `pq-${Date.now()}@test.invalid`,
        name: "Tester",
        authMethod: "PASSWORD",
        passwordHash: "x",
        emailVerified: new Date(),
        linkedProviders: ["password"],
      },
    });
    hubAccountId = account.id;

    const quiz = await prisma.hubQuiz.create({
      data: {
        hubAccountId: account.id,
        title: "Question Test Quiz",
        description: "desc",
        license: "CC_BY",
        tags: [],
        schoolLevel: "PRIMARIA",
        subject: "matematica",
        language: "it",
        questionCount: 2,
        estimatedDurationSec: 60,
        payloadBlob: buf as unknown as Uint8Array<ArrayBuffer>,
        payloadHash: "h",
        payloadSize: buf.length,
      },
    });
    quizId = quiz.id;

    const run = await prisma.practiceRun.create({
      data: {
        hubQuizId: quizId,
        ipHash: "abc",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    runId = run.id;
  });

  afterAll(async () => {
    await prisma.practiceRun.deleteMany({ where: { hubQuizId: quizId } });
    await prisma.hubQuiz.delete({ where: { id: quizId } });
    await prisma.hubAccount.delete({ where: { id: hubAccountId } });
  });

  it("returns question text, timing and points", async () => {
    const res = await GET(makeReq(runId, "0"), {
      params: Promise.resolve({ runId, order: "0" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.question.text).toBe("Is 2+2=4?");
    expect(body.question.timeLimit).toBe(20);
    expect(body.question.points).toBe(100);
    expect(body.total).toBe(2);
    expect(body.order).toBe(0);
  });

  it("strips correct-answer fields from response (case-insensitive check)", async () => {
    const res = await GET(makeReq(runId, "0"), {
      params: Promise.resolve({ runId, order: "0" }),
    });
    const json = JSON.stringify(await res.json());
    expect(json.toLowerCase()).not.toContain("correct");
  });

  it("strips isCorrect from MULTIPLE_CHOICE choices", async () => {
    const res = await GET(makeReq(runId, "1"), {
      params: Promise.resolve({ runId, order: "1" }),
    });
    const body = await res.json();
    const json = JSON.stringify(body);
    expect(json.toLowerCase()).not.toContain("correct");
    // choices text should still be present
    expect(body.question.options.choices[0].text).toBe("Blue");
  });

  it("returns 404 for unknown runId", async () => {
    const res = await GET(makeReq("nonexistent-run", "0"), {
      params: Promise.resolve({ runId: "nonexistent-run", order: "0" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 410 for expired run", async () => {
    const expiredRun = await prisma.practiceRun.create({
      data: {
        hubQuizId: quizId,
        ipHash: "def",
        expiresAt: new Date(Date.now() - 1000), // already expired
      },
    });
    const res = await GET(makeReq(expiredRun.id, "0"), {
      params: Promise.resolve({ runId: expiredRun.id, order: "0" }),
    });
    expect(res.status).toBe(410);
  });
});
