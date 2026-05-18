import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { checkRateLimit, resetRateLimitsByPrefix } from "../db-rate-limit";

// All keys in this test file are prefixed to avoid collision with
// other test files running in parallel in the same DB.
const PREFIX = "dbrl-";

beforeEach(async () => {
  await resetRateLimitsByPrefix(PREFIX);
});

afterEach(async () => {
  await resetRateLimitsByPrefix(PREFIX);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("checkRateLimit", () => {
  it("allows requests under the limit", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await checkRateLimit({ key: `${PREFIX}allow`, windowSeconds: 60, max: 3 });
      expect(r.allowed).toBe(true);
    }
  });

  it("blocks the request at max+1", async () => {
    for (let i = 0; i < 3; i++) {
      await checkRateLimit({ key: `${PREFIX}block`, windowSeconds: 60, max: 3 });
    }
    const r = await checkRateLimit({ key: `${PREFIX}block`, windowSeconds: 60, max: 3 });
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2000-01-01T00:00:00.000Z"));

    for (let i = 0; i < 3; i++) {
      await checkRateLimit({ key: `${PREFIX}reset`, windowSeconds: 60, max: 3 });
    }
    const blocked = await checkRateLimit({ key: `${PREFIX}reset`, windowSeconds: 60, max: 3 });
    expect(blocked.allowed).toBe(false);

    // Advance to next window
    vi.setSystemTime(new Date("2000-01-01T00:01:00.000Z"));

    const allowed = await checkRateLimit({ key: `${PREFIX}reset`, windowSeconds: 60, max: 3 });
    expect(allowed.allowed).toBe(true);
  });

  it("handles concurrent increments atomically", async () => {
    // Disable probabilistic cleanup during this test to avoid interference
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const promises = Array.from({ length: 5 }, () =>
      checkRateLimit({ key: `${PREFIX}concurrent`, windowSeconds: 60, max: 3 }),
    );
    const results = await Promise.all(promises);
    const allowed = results.filter((r) => r.allowed).length;
    const blocked = results.filter((r) => !r.allowed).length;
    expect(allowed).toBe(3);
    expect(blocked).toBe(2);
  });

  it("cleanup deletes expired windows for the SAME key", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.05); // force cleanup

    // Create an old record for the same key that will be triggered
    const cleanupKey = `${PREFIX}cleanup`;
    const oldStart = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago (expired)
    await prisma.hubRateLimit.create({
      data: { key: cleanupKey, windowStart: oldStart, count: 1 },
    });

    // Trigger a call with the SAME key — cleanup is scoped to that key
    await checkRateLimit({ key: cleanupKey, windowSeconds: 60, max: 10 });

    const oldRecord = await prisma.hubRateLimit.findFirst({
      where: { key: cleanupKey, windowStart: oldStart },
    });
    expect(oldRecord).toBeNull();
  });

  it("cleanup fires probabilistically: skips when random >= 0.1, runs when < 0.1", async () => {
    const cleanupKey = `${PREFIX}old-prob`;
    // Create an old record for the same key
    const oldStart = new Date(Date.now() - 2 * 60 * 1000);
    await prisma.hubRateLimit.create({
      data: { key: cleanupKey, windowStart: oldStart, count: 1 },
    });

    // When random returns 0.5, no cleanup should be triggered
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    await checkRateLimit({ key: cleanupKey, windowSeconds: 60, max: 10 });

    // Old record should still exist because cleanup didn't fire
    const stillThere = await prisma.hubRateLimit.findFirst({
      where: { key: cleanupKey, windowStart: oldStart },
    });
    expect(stillThere).not.toBeNull();

    // When random returns 0.05, cleanup should fire and remove the expired window
    vi.spyOn(Math, "random").mockReturnValue(0.05);
    await checkRateLimit({ key: cleanupKey, windowSeconds: 60, max: 10 });

    const gone = await prisma.hubRateLimit.findFirst({
      where: { key: cleanupKey, windowStart: oldStart },
    });
    expect(gone).toBeNull();
  });
});
