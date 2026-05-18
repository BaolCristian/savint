/**
 * Integration test: the public search endpoint must hide quizzes flagged
 * as suspended. Uses real DB.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { GET } from "../route";

const createdQuizIds: string[] = [];
const createdAccountIds: string[] = [];

beforeEach(async () => {
  // Clear rate-limit row that the search GET uses so multiple test runs
  // don't get 429'd from leftover counters.
  await prisma.hubRateLimit.deleteMany({ where: { key: { startsWith: "search:" } } });
});

afterEach(async () => {
  if (createdQuizIds.length) {
    await prisma.hubQuiz.deleteMany({ where: { id: { in: createdQuizIds.splice(0) } } });
  }
  if (createdAccountIds.length) {
    await prisma.hubAccount.deleteMany({ where: { id: { in: createdAccountIds.splice(0) } } });
  }
});

describe("search hides suspended quizzes", () => {
  it("omits suspended=true entries", async () => {
    const a = await prisma.hubAccount.create({
      data: {
        email: `a-${Date.now()}-${Math.random().toString(36).slice(2)}@x.it`,
        name: "A",
        authMethod: "PASSWORD",
        linkedProviders: ["password"],
      },
    });
    createdAccountIds.push(a.id);

    const visible = await prisma.hubQuiz.create({
      data: {
        hubAccountId: a.id,
        title: `Visible-${Date.now()}`,
        license: "CC_BY",
        schoolLevel: "PRIMARIA",
        subject: "storia",
        language: "it",
        questionCount: 1,
        estimatedDurationSec: 60,
        payloadBlob: Buffer.from("x") as unknown as Uint8Array<ArrayBuffer>,
        payloadHash: "h",
        payloadSize: 1,
      },
    });
    createdQuizIds.push(visible.id);

    const hidden = await prisma.hubQuiz.create({
      data: {
        hubAccountId: a.id,
        title: `Hidden-${Date.now()}`,
        license: "CC_BY",
        schoolLevel: "PRIMARIA",
        subject: "storia",
        language: "it",
        questionCount: 1,
        estimatedDurationSec: 60,
        payloadBlob: Buffer.from("x") as unknown as Uint8Array<ArrayBuffer>,
        payloadHash: "h",
        payloadSize: 1,
        suspended: true,
        suspendedReason: "x",
      },
    });
    createdQuizIds.push(hidden.id);

    const res = await GET(
      new Request("http://localhost/api/hub/quizzes?q=") as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const titles = body.items.map((q: { title: string }) => q.title);
    expect(titles).toContain(visible.title);
    expect(titles).not.toContain(hidden.title);
  });
});
