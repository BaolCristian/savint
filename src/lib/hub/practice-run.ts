import { createHash } from "crypto";
import { prisma } from "@/lib/db/client";

const PRACTICE_RUN_TTL_SECONDS = 3600;

/**
 * Hash an IP address to a 64-char hex string so we never store raw IPs.
 * The hash is deterministic (same IP → same hash) but not reversible.
 */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`practice-ip:${ip}`).digest("hex");
}

/**
 * Create a new PracticeRun for the given quiz.
 * The IP is hashed before storage.
 */
export async function createPracticeRun(hubQuizId: string, ip: string) {
  const ipHash = hashIp(ip);
  const expiresAt = new Date(Date.now() + PRACTICE_RUN_TTL_SECONDS * 1000);
  return prisma.practiceRun.create({
    data: {
      hubQuizId,
      ipHash,
      expiresAt,
    },
  });
}

/**
 * Mark a PracticeRun as completed and increment the quiz's playsCount.
 * Uses a transaction so the count is only incremented once.
 * Idempotent: if already completed, returns without re-incrementing.
 */
export async function completePracticeRun(runId: string) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.practiceRun.findUnique({ where: { id: runId } });
    if (!run || run.completedAt) return null; // already completed or missing

    await tx.practiceRun.update({
      where: { id: runId },
      data: { completedAt: new Date() },
    });

    await tx.hubQuiz.update({
      where: { id: run.hubQuizId },
      data: { playsCount: { increment: 1 } },
    });

    return run;
  });
}
