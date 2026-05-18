import { describe, it, expect } from "vitest";
import { generateOpaqueToken, hashToken } from "@/lib/hub/token-hash";

describe("token-hash", () => {
  it("generates ~base64url tokens of expected entropy", () => {
    const t = generateOpaqueToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43,}$/);
  });

  it("produces a stable 64-char hex hash", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashes are unique per input", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });
});
