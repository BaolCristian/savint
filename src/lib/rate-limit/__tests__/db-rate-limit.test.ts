import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { checkRateLimit, resetRateLimits } from "../db-rate-limit";

beforeEach(async () => {
  await resetRateLimits();
});

afterEach(async () => {
  await resetRateLimits();
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows requests under the limit", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await checkRateLimit({ key: "test-allow", windowSeconds: 60, max: 3 });
      expect(r.allowed).toBe(true);
    }
  });

  it("blocks the request at max+1", async () => {
    for (let i = 0; i < 3; i++) {
      await checkRateLimit({ key: "test-block", windowSeconds: 60, max: 3 });
    }
    const r = await checkRateLimit({ key: "test-block", windowSeconds: 60, max: 3 });
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2000-01-01T00:00:00.000Z"));

    for (let i = 0; i < 3; i++) {
      await checkRateLimit({ key: "test-reset", windowSeconds: 60, max: 3 });
    }
    const blocked = await checkRateLimit({ key: "test-reset", windowSeconds: 60, max: 3 });
    expect(blocked.allowed).toBe(false);

    // Advance to next window
    vi.setSystemTime(new Date("2000-01-01T00:01:00.000Z"));

    const allowed = await checkRateLimit({ key: "test-reset", windowSeconds: 60, max: 3 });
    expect(allowed.allowed).toBe(true);
  });

  it("handles concurrent increments atomically", async () => {
    const promises = Array.from({ length: 5 }, () =>
      checkRateLimit({ key: "test-concurrent", windowSeconds: 60, max: 3 }),
    );
    const results = await Promise.all(promises);
    const allowed = results.filter((r) => r.allowed).length;
    const blocked = results.filter((r) => !r.allowed).length;
    expect(allowed).toBe(3);
    expect(blocked).toBe(2);
  });

  it("cleanup deletes windows older than the current window", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.05); // force cleanup

    // Create an old record directly
    const oldStart = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
    await prisma.hubRateLimit.create({
      data: { key: "old-key", windowStart: oldStart, count: 1 },
    });

    // Trigger a call that will fire cleanup
    await checkRateLimit({ key: "test-cleanup", windowSeconds: 60, max: 10 });

    const oldRecord = await prisma.hubRateLimit.findFirst({
      where: { key: "old-key" },
    });
    expect(oldRecord).toBeNull();

    vi.restoreAllMocks();
  });

  it("cleanup fires probabilistically: skips when random >= 0.1, runs when < 0.1", async () => {
    // When random returns 0.5, no cleanup should be triggered
    const noCleanupSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    let deleteManyCalled = false;
    const origDeleteMany = prisma.hubRateLimit.deleteMany.bind(prisma.hubRateLimit);

    // Create an old record that should be cleaned up
    const oldStart = new Date(Date.now() - 2 * 60 * 1000);
    await origDeleteMany(); // reset
    await prisma.hubRateLimit.create({
      data: { key: "old-prob", windowStart: oldStart, count: 1 },
    });

    await checkRateLimit({ key: "prob-no-cleanup", windowSeconds: 60, max: 10 });

    // Old record should still exist because cleanup didn't fire
    const stillThere = await prisma.hubRateLimit.findFirst({ where: { key: "old-prob" } });
    expect(stillThere).not.toBeNull();

    noCleanupSpy.mockRestore();

    // When random returns 0.05, cleanup should fire
    vi.spyOn(Math, "random").mockReturnValue(0.05);
    await checkRateLimit({ key: "prob-cleanup", windowSeconds: 60, max: 10 });
    deleteManyCalled = true;

    const gone = await prisma.hubRateLimit.findFirst({ where: { key: "old-prob" } });
    expect(gone).toBeNull();
    expect(deleteManyCalled).toBe(true);

    vi.restoreAllMocks();
  });
});
