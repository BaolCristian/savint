import { describe, it, expect, beforeEach, vi } from "vitest";
import { hubRateLimit, _resetForTests } from "../hub-rate-limit";

beforeEach(() => {
  _resetForTests();
});

describe("hubRateLimit", () => {
  it("allows up to `max` calls within window", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await hubRateLimit({ key: "k", windowSeconds: 1, max: 3 });
      expect(r.allowed).toBe(true);
    }
    const r = await hubRateLimit({ key: "k", windowSeconds: 1, max: 3 });
    expect(r.allowed).toBe(false);
  });

  it("resets after the window expires", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(0));
      for (let i = 0; i < 3; i++) {
        await hubRateLimit({ key: "k", windowSeconds: 1, max: 3 });
      }
      expect((await hubRateLimit({ key: "k", windowSeconds: 1, max: 3 })).allowed).toBe(false);
      vi.setSystemTime(new Date(2_000));
      expect((await hubRateLimit({ key: "k", windowSeconds: 1, max: 3 })).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keys are independent", async () => {
    expect((await hubRateLimit({ key: "a", windowSeconds: 1, max: 1 })).allowed).toBe(true);
    expect((await hubRateLimit({ key: "b", windowSeconds: 1, max: 1 })).allowed).toBe(true);
    expect((await hubRateLimit({ key: "a", windowSeconds: 1, max: 1 })).allowed).toBe(false);
  });

  it("reports retryAfterSeconds when blocked", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(0));
      await hubRateLimit({ key: "k", windowSeconds: 60, max: 1 });
      const r = await hubRateLimit({ key: "k", windowSeconds: 60, max: 1 });
      expect(r.allowed).toBe(false);
      expect(r.retryAfterSeconds).toBeGreaterThan(0);
      expect(r.retryAfterSeconds).toBeLessThanOrEqual(60);
    } finally {
      vi.useRealTimers();
    }
  });
});
