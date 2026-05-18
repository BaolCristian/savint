/**
 * Integration tests that verify IP-based rate limiting on the public hub
 * endpoints (search and detail). Both routes use DB-backed hubRateLimit and
 * will return 429 when the window is exhausted.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { GET as searchGet } from "../route";
import { GET as detailGet } from "../[id]/route";

const TEST_IP = "8.8.8.8";

function mkReq(url: string, ip = TEST_IP) {
  return new Request(url, {
    headers: { "x-forwarded-for": ip },
  }) as never;
}

beforeEach(async () => {
  await prisma.hubRateLimit.deleteMany({
    where: { key: { startsWith: "search:" } },
  });
  await prisma.hubRateLimit.deleteMany({
    where: { key: { startsWith: "detail:" } },
  });
});

describe("rate-limit: search", () => {
  it("returns 429 after 60 requests in 60 seconds from the same IP", async () => {
    for (let i = 0; i < 60; i++) {
      await searchGet(mkReq("http://localhost/api/hub/quizzes"));
    }
    const r = await searchGet(mkReq("http://localhost/api/hub/quizzes"));
    expect(r.status).toBe(429);
  });
});

describe("rate-limit: detail", () => {
  it("returns 429 after 120 requests in 60 seconds from the same IP", async () => {
    const ctx = { params: Promise.resolve({ id: "anything" }) };
    for (let i = 0; i < 120; i++) {
      await detailGet(mkReq("http://localhost/api/hub/quizzes/anything"), ctx);
    }
    const r = await detailGet(
      mkReq("http://localhost/api/hub/quizzes/anything"),
      ctx,
    );
    expect(r.status).toBe(429);
  });
});
