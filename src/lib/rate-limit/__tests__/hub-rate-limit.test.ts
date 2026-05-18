import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { hubRateLimit, _resetForTests } from "../hub-rate-limit";

beforeEach(async () => {
  await _resetForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("hubRateLimit", () => {
  it("allows up to `max` calls within window", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await hubRateLimit({ key: "k", windowSeconds: 60, max: 3 });
      expect(r.allowed).toBe(true);
    }
    const r = await hubRateLimit({ key: "k", windowSeconds: 60, max: 3 });
    expect(r.allowed).toBe(false);
  });

  it("resets after the window expires", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2000-01-01T00:00:00.000Z"));
      for (let i = 0; i < 3; i++) {
        await hubRateLimit({ key: "k2", windowSeconds: 60, max: 3 });
      }
      expect((await hubRateLimit({ key: "k2", windowSeconds: 60, max: 3 })).allowed).toBe(false);
      // Advance past the window
      vi.setSystemTime(new Date("2000-01-01T00:01:00.000Z"));
      expect((await hubRateLimit({ key: "k2", windowSeconds: 60, max: 3 })).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keys are independent", async () => {
    expect((await hubRateLimit({ key: "a", windowSeconds: 60, max: 1 })).allowed).toBe(true);
    expect((await hubRateLimit({ key: "b", windowSeconds: 60, max: 1 })).allowed).toBe(true);
    expect((await hubRateLimit({ key: "a", windowSeconds: 60, max: 1 })).allowed).toBe(false);
  });

  it("reports retryAfterSeconds when blocked", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2000-01-01T00:00:00.000Z"));
      await hubRateLimit({ key: "k3", windowSeconds: 60, max: 1 });
      const r = await hubRateLimit({ key: "k3", windowSeconds: 60, max: 1 });
      expect(r.allowed).toBe(false);
      expect(r.retryAfterSeconds).toBeGreaterThan(0);
      expect(r.retryAfterSeconds).toBeLessThanOrEqual(60);
    } finally {
      vi.useRealTimers();
    }
  });

  describe("DB delegation", () => {
    it("delegates to checkRateLimit from db-rate-limit", async () => {
      const dbModule = await import("../db-rate-limit");
      const spy = vi.spyOn(dbModule, "checkRateLimit").mockResolvedValue({ allowed: true });

      const result = await hubRateLimit({ key: "delegated", windowSeconds: 30, max: 5 });

      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith({ key: "delegated", windowSeconds: 30, max: 5 });
      expect(result.allowed).toBe(true);
    });

    it("_resetForTests delegates to resetRateLimits", async () => {
      const dbModule = await import("../db-rate-limit");
      const spy = vi.spyOn(dbModule, "resetRateLimits").mockResolvedValue();

      await _resetForTests();

      expect(spy).toHaveBeenCalledOnce();
    });
  });
});
