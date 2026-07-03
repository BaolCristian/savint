import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { POST } from "@/app/api/hub/practice/[runId]/complete/route";
import { NextRequest } from "next/server";
import JSZip from "jszip";

function makeReq(runId: string) {
  return new NextRequest(`http://localhost/api/hub/practice/${runId}/complete`, {
    method: "POST",
  });
}

describe("POST /api/hub/practice/[runId]/complete", () => {
  let hubAccountId: string;
  let quizId: string;
  let runId: string;
  let expiredRunId: string;

  beforeAll(async () => {
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ quiz: { questions: [] } }));
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    const account = await prisma.hubAccount.create({
      data: {
        email: `pc-${Date.now()}@test.invalid`,
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
        title: "Complete test",
        description: "desc",
        license: "CC_BY",
        tags: [],
        schoolLevel: "PRIMARIA",
        subject: "matematica",
        language: "it",
        questionCount: 0,
        estimatedDurationSec: 30,
        payloadBlob: buf as unknown as Uint8Array<ArrayBuffer>,
        payloadHash: "h",
        payloadSize: buf.length,
      },
    });
    quizId = quiz.id;

    const run = await prisma.practiceRun.create({
      data: { hubQuizId: quiz.id, ipHash: "x".repeat(64), expiresAt: new Date(Date.now() + 60_000) },
    });
    runId = run.id;

    const expired = await prisma.practiceRun.create({
      data: { hubQuizId: quiz.id, ipHash: "x".repeat(64), expiresAt: new Date(Date.now() - 60_000) },
    });
    expiredRunId = expired.id;
  });

  afterAll(async () => {
    await prisma.practiceRun.deleteMany({ where: { hubQuizId: quizId } });
    await prisma.hubQuiz.delete({ where: { id: quizId } });
    await prisma.hubAccount.delete({ where: { id: hubAccountId } });
  });

  it("marks the run completed and increments playsCount", async () => {
    const res = await POST(makeReq(runId), { params: Promise.resolve({ runId }) });
    expect(res.status).toBe(200);

    const run = await prisma.practiceRun.findUnique({ where: { id: runId } });
    expect(run?.completedAt).not.toBeNull();
    const quiz = await prisma.hubQuiz.findUnique({ where: { id: quizId } });
    expect(quiz?.playsCount).toBe(1);
  });

  it("is idempotent: a second call does not re-increment playsCount", async () => {
    const res = await POST(makeReq(runId), { params: Promise.resolve({ runId }) });
    expect(res.status).toBe(200);
    const quiz = await prisma.hubQuiz.findUnique({ where: { id: quizId } });
    expect(quiz?.playsCount).toBe(1);
  });

  it("returns 410 for an expired run", async () => {
    const res = await POST(makeReq(expiredRunId), { params: Promise.resolve({ runId: expiredRunId }) });
    expect(res.status).toBe(410);
  });

  it("returns 404 for an unknown run", async () => {
    const res = await POST(makeReq("nope"), { params: Promise.resolve({ runId: "nope" }) });
    expect(res.status).toBe(404);
  });
});
