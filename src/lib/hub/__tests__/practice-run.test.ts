import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { hashIp, createPracticeRun, completePracticeRun } from "../practice-run";

describe("practice-run helpers", () => {
  let hubQuizId: string;
  let hubAccountId: string;

  beforeAll(async () => {
    const account = await prisma.hubAccount.create({
      data: {
        email: `prt-${Date.now()}@test.invalid`,
        name: "Test User",
        authMethod: "PASSWORD",
        passwordHash: "x",
        emailVerified: new Date(),
        linkedProviders: ["password"],
      },
    });
    hubAccountId = account.id;

    const buf = Buffer.from("dummy-payload") as unknown as Uint8Array<ArrayBuffer>;
    const quiz = await prisma.hubQuiz.create({
      data: {
        hubAccountId: account.id,
        title: "Practice Test Quiz",
        description: "desc",
        license: "CC_BY",
        tags: [],
        schoolLevel: "PRIMARIA",
        subject: "matematica",
        language: "it",
        questionCount: 2,
        estimatedDurationSec: 60,
        payloadBlob: buf,
        payloadHash: "h",
        payloadSize: buf.length,
      },
    });
    hubQuizId = quiz.id;
  });

  afterAll(async () => {
    await prisma.practiceRun.deleteMany({ where: { hubQuizId } });
    await prisma.hubQuiz.delete({ where: { id: hubQuizId } });
    await prisma.hubAccount.delete({ where: { id: hubAccountId } });
  });

  describe("hashIp", () => {
    it("generates a 64-char hex string", () => {
      const hash = hashIp("192.168.1.1");
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    it("does not contain the original IP", () => {
      const ip = "192.168.1.1";
      const hash = hashIp(ip);
      expect(hash).not.toContain(ip);
    });

    it("is deterministic: same IP → same hash", () => {
      expect(hashIp("10.0.0.1")).toBe(hashIp("10.0.0.1"));
    });

    it("different IPs produce different hashes", () => {
      expect(hashIp("10.0.0.1")).not.toBe(hashIp("10.0.0.2"));
    });
  });

  describe("createPracticeRun", () => {
    it("stores hashed IP (not the raw IP)", async () => {
      const ip = "203.0.113.42";
      const run = await createPracticeRun(hubQuizId, ip);
      expect(run.id).toBeTruthy();
      expect(run.ipHash).toBe(hashIp(ip));
      expect(run.ipHash).not.toContain(ip);
      expect(run.startedAt).toBeInstanceOf(Date);
      expect(run.completedAt).toBeNull();
    });
  });

  describe("completePracticeRun", () => {
    it("sets completedAt and increments playsCount exactly once", async () => {
      const run = await createPracticeRun(hubQuizId, "1.2.3.4");

      const before = await prisma.hubQuiz.findUnique({ where: { id: hubQuizId } });
      const countBefore = before!.playsCount;

      await completePracticeRun(run.id);

      const after = await prisma.hubQuiz.findUnique({ where: { id: hubQuizId } });
      expect(after!.playsCount).toBe(countBefore + 1);

      const completed = await prisma.practiceRun.findUnique({ where: { id: run.id } });
      expect(completed!.completedAt).toBeInstanceOf(Date);
    });

    it("is idempotent: second call does not double-increment playsCount", async () => {
      const run = await createPracticeRun(hubQuizId, "1.2.3.5");

      await completePracticeRun(run.id);
      const mid = await prisma.hubQuiz.findUnique({ where: { id: hubQuizId } });
      const countAfterFirst = mid!.playsCount;

      // Second call should be a no-op
      await completePracticeRun(run.id);
      const after = await prisma.hubQuiz.findUnique({ where: { id: hubQuizId } });
      expect(after!.playsCount).toBe(countAfterFirst);
    });
  });
});
