/**
 * Integration tests that verify IP-based rate limiting on the public hub
 * endpoints (search and detail). Both routes use DB-backed hubRateLimit and
 * will return 429 when the window is exhausted.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { GET as searchGet } from "../route";
import { GET as detailGet } from "../[id]/route";

// Use a unique IP per test session to avoid cross-file interference in parallel runs.
const SESSION_ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const TEST_IP = `10.255.${parseInt(SESSION_ID.slice(0, 2), 36) % 256}.${parseInt(SESSION_ID.slice(2, 4), 36) % 256}`;

function mkReq(url: string, ip = TEST_IP) {
  return new Request(url, {
    headers: { "x-forwarded-for": ip },
  }) as never;
}

beforeEach(async () => {
  await prisma.hubRateLimit.deleteMany({
    where: { key: `search:${TEST_IP}` },
  });
  await prisma.hubRateLimit.deleteMany({
    where: { key: `detail:${TEST_IP}` },
  });
});

describe("rate-limit: search", () => {
  it("returns 429 after 60 requests in 60 seconds from the same IP", async () => {
    // Fire calls until we hit a 429 (stops at most at max+1 = 61 within the same window).
    // We loop up to 70 to absorb a rare window-boundary split without infinite loop.
    let hit429 = false;
    for (let i = 0; i < 70 && !hit429; i++) {
      const r = await searchGet(mkReq("http://localhost/api/hub/quizzes"));
      if (r.status === 429) hit429 = true;
    }
    expect(hit429).toBe(true);
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
