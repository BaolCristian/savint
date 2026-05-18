import { describe, it, expect } from "vitest";
import { generatePkcePair, verifyPkce } from "@/lib/hub/pkce";

describe("pkce", () => {
  it("generates verifier 43-128 chars and S256 challenge", () => {
    const { verifier, challenge, method } = generatePkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(method).toBe("S256");
  });

  it("verifyPkce accepts the matching verifier", () => {
    const { verifier, challenge } = generatePkcePair();
    expect(verifyPkce(verifier, challenge)).toBe(true);
  });

  it("rejects a tampered verifier", () => {
    const { challenge } = generatePkcePair();
    expect(verifyPkce("wrongverifier".padEnd(43, "x"), challenge)).toBe(false);
  });

  it("rejects unsupported method explicitly", () => {
    expect(verifyPkce("v", "c", "plain" as never)).toBe(false);
  });
});
