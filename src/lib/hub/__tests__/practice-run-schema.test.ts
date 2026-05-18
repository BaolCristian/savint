import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";

describe("PracticeRun schema", () => {
  let hubQuizId: string;
  let hubAccountId: string;

  beforeAll(async () => {
    const account = await prisma.hubAccount.create({
      data: {
        email: `pr-${Date.now()}@test`,
        name: "T",
        authMethod: "PASSWORD",
        passwordHash: "x",
        emailVerified: new Date(),
        linkedProviders: ["password"],
      },
    });
    hubAccountId = account.id;
    const q = await prisma.hubQuiz.create({
      data: {
        hubAccountId: account.id,
        title: "X",
        description: "d",
        license: "CC_BY",
        tags: [],
        schoolLevel: "PRIMARIA",
        subject: "matematica",
        language: "it",
        questionCount: 1,
        estimatedDurationSec: 30,
        payloadBlob: Buffer.from("x") as unknown as Uint8Array<ArrayBuffer>,
        payloadHash: "h",
        payloadSize: 1,
      },
    });
    hubQuizId = q.id;
  });

  afterAll(async () => {
    await prisma.practiceRun.deleteMany({ where: { hubQuizId } });
    await prisma.hubQuiz.delete({ where: { id: hubQuizId } });
    await prisma.hubAccount.delete({ where: { id: hubAccountId } });
  });

  it("creates a practice run with TTL fields", async () => {
    const run = await prisma.practiceRun.create({
      data: { hubQuizId, ipHash: "abc" },
    });
    expect(run.startedAt).toBeInstanceOf(Date);
    expect(run.completedAt).toBeNull();
    expect(run.expiresAt).toBeInstanceOf(Date);
  });
});
