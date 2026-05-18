import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken } from "@/lib/hub/token-crypto";

describe("token-crypto", () => {
  const secret = "test-secret-please-change-me-32-chars";

  it("round-trips a plaintext", () => {
    const ct = encryptToken("hello-token", secret);
    expect(ct).not.toContain("hello-token");
    expect(decryptToken(ct, secret)).toBe("hello-token");
  });

  it("produces different ciphertexts for same plaintext (random IV)", () => {
    const a = encryptToken("x", secret);
    const b = encryptToken("x", secret);
    expect(a).not.toBe(b);
  });

  it("throws on tampered ciphertext", () => {
    const ct = encryptToken("safe", secret);
    const tampered = ct.slice(0, -2) + "AA";
    expect(() => decryptToken(tampered, secret)).toThrow();
  });

  it("throws on wrong key", () => {
    const ct = encryptToken("safe", secret);
    expect(() => decryptToken(ct, "another-secret-of-sufficient-length-xx")).toThrow();
  });
});
