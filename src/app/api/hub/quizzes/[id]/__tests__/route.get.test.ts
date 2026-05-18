import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GET } from "@/app/api/hub/quizzes/[id]/route";
import { prisma } from "@/lib/db/client";
import { NextRequest } from "next/server";
import JSZip from "jszip";

describe("GET /api/hub/quizzes/:id", () => {
  let id: string;
  let accountId: string;

  beforeAll(async () => {
    const zip = new JSZip();
    zip.file(
      "manifest.json",
      JSON.stringify({
        quiz: {
          questions: [
            {
              type: "TRUE_FALSE",
              text: "2+2=4?",
              timeLimit: 20,
              points: 100,
              options: { correct: true },
            },
          ],
        },
      }),
    );
    const buf = await zip.generateAsync({ type: "nodebuffer" });

    const a = await prisma.hubAccount.create({
      data: {
        email: `d-${Date.now()}@t`,
        name: "Maria",
        authMethod: "PASSWORD",
        passwordHash: "x",
        emailVerified: new Date(),
        linkedProviders: ["password"],
      },
    });
    accountId = a.id;
    const q = await prisma.hubQuiz.create({
      data: {
        hubAccountId: a.id,
        title: "T",
        description: "d",
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
    id = q.id;
  });

  afterAll(async () => {
    await prisma.hubQuiz.delete({ where: { id } });
    await prisma.hubAccount.delete({ where: { id: accountId } });
  });

  it("returns metadata and questions without correct answer fields", async () => {
    const res = await GET(new NextRequest(`http://t/api/hub/quizzes/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.author).toBe("Maria");
    expect(body.questions[0].text).toBe("2+2=4?");
    expect(JSON.stringify(body.questions[0])).not.toContain("correct");
  });

  it("404 when suspended", async () => {
    await prisma.hubQuiz.update({ where: { id }, data: { suspended: true } });
    const res = await GET(new NextRequest(`http://t/api/hub/quizzes/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(404);
    await prisma.hubQuiz.update({ where: { id }, data: { suspended: false } });
  });
});
