import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, BCRYPT_COST } from "../password";

describe("hashPassword / verifyPassword", () => {
  it("uses bcrypt cost 12", () => {
    expect(BCRYPT_COST).toBe(12);
  });

  it("hashes a password into a bcrypt-format string", async () => {
    const hash = await hashPassword("hunter2-correct-horse");
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(hash.length).toBeGreaterThan(50);
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("hunter2-correct-horse");
    await expect(verifyPassword("hunter2-correct-horse", hash)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("hunter2-correct-horse");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("rejects empty / null hash safely", async () => {
    await expect(verifyPassword("anything", "")).resolves.toBe(false);
    await expect(verifyPassword("anything", null as unknown as string)).resolves.toBe(false);
  });
});
