import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { POST } from "@/app/api/hub/practice/[runId]/answer/route";
import { NextRequest } from "next/server";
import JSZip from "jszip";

function makeReq(runId: string, body: unknown) {
  return new NextRequest(
    `http://localhost/api/hub/practice/${runId}/answer`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

async function callRoute(runId: string, body: unknown) {
  return POST(makeReq(runId, body), {
    params: Promise.resolve({ runId }),
  });
}

describe("POST /api/hub/practice/[runId]/answer", () => {
  let hubAccountId: string;
  let quizId: string;
  let singleRunId: string; // quiz with 1 question (for isLast tests)
  let multiRunId: string;  // quiz with 2 questions

  beforeAll(async () => {
    // Build single-question quiz
    const zip1 = new JSZip();
    zip1.file(
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
          ],
        },
      }),
    );
    const buf1 = await zip1.generateAsync({ type: "nodebuffer" });

    // Build two-question quiz
    const zip2 = new JSZip();
    zip2.file(
      "manifest.json",
      JSON.stringify({
        quiz: {
          questions: [
            {
              type: "TRUE_FALSE",
              text: "Q1?",
              timeLimit: 20,
              points: 100,
              options: { correct: false },
            },
            {
              type: "TRUE_FALSE",
              text: "Q2?",
              timeLimit: 20,
              points: 100,
              options: { correct: true },
            },
          ],
        },
      }),
    );
    const buf2 = await zip2.generateAsync({ type: "nodebuffer" });

    const account = await prisma.hubAccount.create({
      data: {
        email: `pa-${Date.now()}@test.invalid`,
        name: "Tester",
        authMethod: "PASSWORD",
        passwordHash: "x",
        emailVerified: new Date(),
        linkedProviders: ["password"],
      },
    });
    hubAccountId = account.id;

    const quiz1 = await prisma.hubQuiz.create({
      data: {
        hubAccountId: account.id,
        title: "Single Q Quiz",
        description: "desc",
        license: "CC_BY",
        tags: [],
        schoolLevel: "PRIMARIA",
        subject: "matematica",
        language: "it",
        questionCount: 1,
        estimatedDurationSec: 30,
        payloadBlob: buf1 as unknown as Uint8Array<ArrayBuffer>,
        payloadHash: "h1",
        payloadSize: buf1.length,
      },
    });
    quizId = quiz1.id;

    const quiz2 = await prisma.hubQuiz.create({
      data: {
        hubAccountId: account.id,
        title: "Multi Q Quiz",
        description: "desc",
        license: "CC_BY",
        tags: [],
        schoolLevel: "PRIMARIA",
        subject: "matematica",
        language: "it",
        questionCount: 2,
        estimatedDurationSec: 60,
        payloadBlob: buf2 as unknown as Uint8Array<ArrayBuffer>,
        payloadHash: "h2",
        payloadSize: buf2.length,
      },
    });

    singleRunId = (
      await prisma.practiceRun.create({
        data: { hubQuizId: quiz1.id, ipHash: "aaa", expiresAt: new Date(Date.now() + 3600_000) },
      })
    ).id;

    multiRunId = (
      await prisma.practiceRun.create({
        data: { hubQuizId: quiz2.id, ipHash: "bbb", expiresAt: new Date(Date.now() + 3600_000) },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.practiceRun.deleteMany({ where: { hubQuiz: { hubAccountId } } });
    await prisma.hubQuiz.deleteMany({ where: { hubAccountId } });
    await prisma.hubAccount.delete({ where: { id: hubAccountId } });
  });

  it("TRUE_FALSE with selected:true returns isCorrect=true", async () => {
    const run = await prisma.practiceRun.create({
      data: { hubQuizId: quizId, ipHash: "tf1", expiresAt: new Date(Date.now() + 3600_000) },
    });
    const res = await callRoute(run.id, { order: 0, value: { selected: true } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isCorrect).toBe(true);
    expect(body.isLast).toBe(true);
    expect(body.correctOptions).toMatchObject({ correct: true });
  });

  it("TRUE_FALSE with selected:false returns isCorrect=false", async () => {
    const run = await prisma.practiceRun.create({
      data: { hubQuizId: quizId, ipHash: "tf2", expiresAt: new Date(Date.now() + 3600_000) },
    });
    const res = await callRoute(run.id, { order: 0, value: { selected: false } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isCorrect).toBe(false);
    expect(body.isLast).toBe(true);
  });

  it("increments playsCount exactly once after isLast submission", async () => {
    const before = await prisma.hubQuiz.findUnique({ where: { id: quizId } });
    const countBefore = before!.playsCount;

    const res = await callRoute(singleRunId, { order: 0, value: { selected: true } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isLast).toBe(true);

    const after = await prisma.hubQuiz.findUnique({ where: { id: quizId } });
    expect(after!.playsCount).toBe(countBefore + 1);
  });

  it("isLast=false for non-final question in multi-question quiz", async () => {
    const res = await callRoute(multiRunId, { order: 0, value: { selected: true } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isLast).toBe(false);
  });

  it("returns 404 for unknown run", async () => {
    const res = await callRoute("nonexistent-run", { order: 0, value: { selected: true } });
    expect(res.status).toBe(404);
  });
});
