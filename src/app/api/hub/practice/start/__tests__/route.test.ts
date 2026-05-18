import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { _resetForTests } from "@/lib/rate-limit/hub-rate-limit";
import { POST } from "@/app/api/hub/practice/start/route";
import { NextRequest } from "next/server";
import JSZip from "jszip";

function makeReq(body: unknown, ip = "127.0.0.1") {
  return new NextRequest("http://localhost/api/hub/practice/start", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/hub/practice/start", () => {
  let hubAccountId: string;
  let quizId: string;

  beforeAll(async () => {
    _resetForTests();

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
          ],
        },
      }),
    );
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    const account = await prisma.hubAccount.create({
      data: {
        email: `ps-${Date.now()}@test.invalid`,
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
        title: "Start Test Quiz",
        description: "desc",
        license: "CC_BY",
        tags: [],
        schoolLevel: "PRIMARIA",
        subject: "matematica",
        language: "it",
        questionCount: 1,
        estimatedDurationSec: 30,
        payloadBlob: buf as unknown as Uint8Array<ArrayBuffer>,
        payloadHash: "h",
        payloadSize: buf.length,
      },
    });
    quizId = quiz.id;
  });

  afterAll(async () => {
    await prisma.practiceRun.deleteMany({ where: { hubQuizId: quizId } });
    await prisma.hubQuiz.delete({ where: { id: quizId } });
    await prisma.hubAccount.delete({ where: { id: hubAccountId } });
  });

  beforeEach(() => {
    _resetForTests();
  });

  it("returns 201 with runId on valid quiz", async () => {
    const res = await POST(makeReq({ quizId }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.runId).toBeTruthy();
    expect(typeof body.runId).toBe("string");
  });

  it("returns 404 on unknown quiz id", async () => {
    const res = await POST(makeReq({ quizId: "nonexistent-id" }));
    expect(res.status).toBe(404);
  });

  it("returns 429 when rate limit exceeded", async () => {
    // Exhaust the limit (5 per 60s) using a distinct IP
    const ip = `192.0.2.${Date.now() % 255}`;
    for (let i = 0; i < 5; i++) {
      const res = await POST(makeReq({ quizId }, ip));
      expect(res.status).toBe(201);
    }
    const res = await POST(makeReq({ quizId }, ip));
    expect(res.status).toBe(429);
  });
});
