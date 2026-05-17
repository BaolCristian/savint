import { describe, it, expect, vi, beforeEach } from "vitest";
import { VerificationPurpose } from "@prisma/client";

const mockToken = {
  create: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
};

vi.mock("@/lib/db/client", () => ({
  prisma: {
    emailVerificationToken: mockToken,
  },
}));

beforeEach(() => {
  mockToken.create.mockReset();
  mockToken.findUnique.mockReset();
  mockToken.update.mockReset();
});

describe("issueVerificationToken", () => {
  it("returns a plain token and stores its SHA-256 hash with 24h TTL", async () => {
    mockToken.create.mockResolvedValue({ id: "tok-1" });
    const { issueVerificationToken, TOKEN_TTL_MS } = await import("../verification-token");
    const before = Date.now();
    const { plainToken, expiresAt } = await issueVerificationToken("acct-1", VerificationPurpose.VERIFY_EMAIL);
    expect(plainToken).toMatch(/^[a-f0-9]{64}$/);
    expect(mockToken.create).toHaveBeenCalledTimes(1);
    const data = mockToken.create.mock.calls[0][0].data;
    expect(data.hubAccountId).toBe("acct-1");
    expect(data.purpose).toBe(VerificationPurpose.VERIFY_EMAIL);
    expect(data.tokenHash).not.toBe(plainToken);
    expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(TOKEN_TTL_MS - 1000);
    expect(expiresAt.getTime() - before).toBeLessThanOrEqual(TOKEN_TTL_MS + 1000);
  });
});

describe("consumeVerificationToken", () => {
  it("returns the hubAccountId for a valid unused token and marks it used", async () => {
    mockToken.findUnique.mockResolvedValue({
      id: "tok-1",
      hubAccountId: "acct-1",
      purpose: VerificationPurpose.VERIFY_EMAIL,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });
    mockToken.update.mockResolvedValue({});
    const { consumeVerificationToken } = await import("../verification-token");
    const plain = "a".repeat(64);
    const result = await consumeVerificationToken(plain, VerificationPurpose.VERIFY_EMAIL);
    expect(result).toEqual({ hubAccountId: "acct-1" });
    expect(mockToken.update).toHaveBeenCalledTimes(1);
    expect(mockToken.update.mock.calls[0][0].data.usedAt).toBeInstanceOf(Date);
  });

  it("returns null when the token does not exist", async () => {
    mockToken.findUnique.mockResolvedValue(null);
    const { consumeVerificationToken } = await import("../verification-token");
    const result = await consumeVerificationToken("a".repeat(64), VerificationPurpose.VERIFY_EMAIL);
    expect(result).toBeNull();
  });

  it("returns null for an expired token (does not mark used)", async () => {
    mockToken.findUnique.mockResolvedValue({
      id: "tok-1",
      hubAccountId: "acct-1",
      purpose: VerificationPurpose.VERIFY_EMAIL,
      expiresAt: new Date(Date.now() - 60_000),
      usedAt: null,
    });
    const { consumeVerificationToken } = await import("../verification-token");
    const result = await consumeVerificationToken("a".repeat(64), VerificationPurpose.VERIFY_EMAIL);
    expect(result).toBeNull();
    expect(mockToken.update).not.toHaveBeenCalled();
  });

  it("returns null when the token has already been used", async () => {
    mockToken.findUnique.mockResolvedValue({
      id: "tok-1",
      hubAccountId: "acct-1",
      purpose: VerificationPurpose.VERIFY_EMAIL,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(Date.now() - 1_000),
    });
    const { consumeVerificationToken } = await import("../verification-token");
    const result = await consumeVerificationToken("a".repeat(64), VerificationPurpose.VERIFY_EMAIL);
    expect(result).toBeNull();
    expect(mockToken.update).not.toHaveBeenCalled();
  });

  it("returns null when the token purpose does not match", async () => {
    mockToken.findUnique.mockResolvedValue({
      id: "tok-1",
      hubAccountId: "acct-1",
      purpose: VerificationPurpose.RESET_PASSWORD,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });
    const { consumeVerificationToken } = await import("../verification-token");
    const result = await consumeVerificationToken("a".repeat(64), VerificationPurpose.VERIFY_EMAIL);
    expect(result).toBeNull();
    expect(mockToken.update).not.toHaveBeenCalled();
  });
});
