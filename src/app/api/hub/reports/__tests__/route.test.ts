/**
 * Integration tests for POST /api/hub/reports.
 * Uses the real DB.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { POST } from "../route";

// ── Mock NextAuth so getHubSession returns null by default ────────────────
vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

const TEST_IP = "203.0.113.5";
const OTHER_IP = "203.0.113.6";

function mkReq(body: unknown, ip = TEST_IP) {
  return new Request("http://localhost/api/hub/reports", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  }) as never;
}

let accountId: string;
let quizId: string;

beforeAll(async () => {
  process.env.HUB_IP_HASH_SECRET = "test-ip-secret";

  const a = await prisma.hubAccount.create({
    data: {
      email: `report-test-${Date.now()}@t`,
      name: "Reporter",
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
      title: "Reportable Quiz",
      description: "test",
      license: "CC_BY",
      tags: [],
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
  quizId = q.id;
});

beforeEach(async () => {
  // Clean rate-limit rows scoped to test IPs
  await prisma.hubRateLimit.deleteMany({
    where: {
      key: {
        in: [`report:${TEST_IP}`, `report:${OTHER_IP}`],
      },
    },
  });
  // Clean any reports created in previous test cases
  await prisma.hubReport.deleteMany({ where: { hubQuizId: quizId } });
});

afterAll(async () => {
  await prisma.hubReport.deleteMany({ where: { hubQuizId: quizId } });
  await prisma.hubQuiz.delete({ where: { id: quizId } });
  await prisma.hubAccount.delete({ where: { id: accountId } });
});

describe("POST /api/hub/reports", () => {
  it("201 — creates a report for an anonymous user", async () => {
    const res = await POST(
      mkReq({ hubQuizId: quizId, reason: "OFFENSIVE" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
  });

  it("400 — returns error on missing required fields", async () => {
    const res = await POST(mkReq({ reason: "OFFENSIVE" })); // missing hubQuizId
    expect(res.status).toBe(400);
  });

  it("400 — returns error on invalid reason", async () => {
    const res = await POST(
      mkReq({ hubQuizId: quizId, reason: "UNKNOWN_REASON" }),
    );
    expect(res.status).toBe(400);
  });

  it("404 — returns not_found for a non-existent quiz", async () => {
    const res = await POST(
      mkReq({ hubQuizId: "non-existent-id", reason: "OTHER" }),
    );
    expect(res.status).toBe(404);
  });

  it("409 — deduplicates: second report from same IP on the same day", async () => {
    // First report
    const res1 = await POST(
      mkReq({ hubQuizId: quizId, reason: "COPYRIGHT" }),
    );
    expect(res1.status).toBe(201);

    // Second report from same IP
    const res2 = await POST(
      mkReq({ hubQuizId: quizId, reason: "OTHER" }),
    );
    expect(res2.status).toBe(409);
    const body2 = await res2.json();
    expect(body2.error).toBe("already_reported");
  });

  it("201 — different IP can still report the same quiz", async () => {
    // Report from TEST_IP
    await POST(mkReq({ hubQuizId: quizId, reason: "COPYRIGHT" }));

    // Report from OTHER_IP should succeed
    const res = await POST(
      mkReq({ hubQuizId: quizId, reason: "COPYRIGHT" }, OTHER_IP),
    );
    expect(res.status).toBe(201);
  });

  it("429 — rate-limits after 5 reports in 24h from same IP", async () => {
    for (let i = 0; i < 5; i++) {
      // Reset dedup before each to avoid 409 interfering
      await prisma.hubReport.deleteMany({ where: { hubQuizId: quizId } });
      await POST(mkReq({ hubQuizId: quizId, reason: "OTHER" }));
    }
    // 6th call should be rate-limited (rate limit fires before dedup check)
    await prisma.hubReport.deleteMany({ where: { hubQuizId: quizId } });
    const res = await POST(mkReq({ hubQuizId: quizId, reason: "OTHER" }));
    expect(res.status).toBe(429);
  });
});
