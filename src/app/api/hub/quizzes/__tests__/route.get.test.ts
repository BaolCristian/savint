import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GET } from "@/app/api/hub/quizzes/route";
import { prisma } from "@/lib/db/client";
import { NextRequest } from "next/server";

describe("GET /api/hub/quizzes", () => {
  let accountId: string;
  let quizId: string;
  beforeAll(async () => {
    const a = await prisma.hubAccount.create({
      data: {
        email: `e-${Date.now()}@t`,
        name: "X",
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
        title: "Geo101",
        description: "world",
        license: "CC_BY",
        tags: [],
        schoolLevel: "PRIMARIA",
        subject: "geografia",
        language: "it",
        questionCount: 3,
        estimatedDurationSec: 180,
        payloadBlob: Buffer.from("x") as unknown as Uint8Array<ArrayBuffer>,
        payloadHash: "h",
        payloadSize: 1,
      },
    });
    quizId = q.id;
  });
  afterAll(async () => {
    await prisma.hubQuiz.delete({ where: { id: quizId } });
    await prisma.hubAccount.delete({ where: { id: accountId } });
  });

  it("returns 200 with paginated items", async () => {
    const req = new NextRequest("http://t/api/hub/quizzes?subject=geografia");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.some((i: { title: string }) => i.title === "Geo101")).toBe(true);
  });

  it("400 on invalid sort", async () => {
    const req = new NextRequest("http://t/api/hub/quizzes?sort=banana");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
