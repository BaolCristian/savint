import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("hashIp", () => {
  const ORIGINAL_SECRET = process.env.HUB_IP_HASH_SECRET;

  beforeEach(() => {
    vi.resetModules();
    process.env.HUB_IP_HASH_SECRET = "test-secret-value";
  });

  afterEach(() => {
    if (ORIGINAL_SECRET !== undefined) {
      process.env.HUB_IP_HASH_SECRET = ORIGINAL_SECRET;
    } else {
      delete process.env.HUB_IP_HASH_SECRET;
    }
    vi.resetModules();
  });

  it("is deterministic — same IP and secret produce same hash", async () => {
    const { hashIp } = await import("../ip-hash");
    const h1 = hashIp("192.168.1.1");
    const h2 = hashIp("192.168.1.1");
    expect(h1).toBe(h2);
  });

  it("produces different hashes for different IPs", async () => {
    const { hashIp } = await import("../ip-hash");
    expect(hashIp("192.168.1.1")).not.toBe(hashIp("10.0.0.1"));
  });

  it("outputs a 64-character hex string (SHA-256)", async () => {
    const { hashIp } = await import("../ip-hash");
    const h = hashIp("1.2.3.4");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("throws when HUB_IP_HASH_SECRET is not set", async () => {
    delete process.env.HUB_IP_HASH_SECRET;
    const { hashIp } = await import("../ip-hash");
    expect(() => hashIp("1.2.3.4")).toThrow("HUB_IP_HASH_SECRET is not configured");
  });
});
