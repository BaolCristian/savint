import { describe, it, expect, vi, beforeEach } from "vitest";

const consumeVerificationToken = vi.fn();
const hubUpdate = vi.fn();

vi.mock("@/lib/auth/verification-token", () => ({ consumeVerificationToken }));
vi.mock("@/lib/db/client", () => ({ prisma: { hubAccount: { update: hubUpdate } } }));

beforeEach(() => {
  consumeVerificationToken.mockReset();
  hubUpdate.mockReset();
});

describe("resetPassword", () => {
  it("returns invalid_token when token is rejected", async () => {
    consumeVerificationToken.mockResolvedValue(null);
    const { resetPassword } = await import("@/app/(hub)/hub-reset-password/actions");
    const out = await resetPassword({ token: "x".repeat(40), newPassword: "password1" });
    expect(out).toEqual({ ok: false, error: "invalid_token" });
    expect(hubUpdate).not.toHaveBeenCalled();
  });

  it("returns weak_password for short passwords", async () => {
    const { resetPassword } = await import("@/app/(hub)/hub-reset-password/actions");
    const out = await resetPassword({ token: "x".repeat(40), newPassword: "short" });
    expect(out).toEqual({ ok: false, error: "weak_password" });
    expect(consumeVerificationToken).not.toHaveBeenCalled();
  });

  it("updates the account password on success", async () => {
    consumeVerificationToken.mockResolvedValue({ hubAccountId: "acct-1" });
    hubUpdate.mockResolvedValue({});
    const { resetPassword } = await import("@/app/(hub)/hub-reset-password/actions");
    const out = await resetPassword({ token: "x".repeat(40), newPassword: "newpassword1" });
    expect(out).toEqual({ ok: true });
    expect(hubUpdate).toHaveBeenCalledTimes(1);
    const data = (hubUpdate.mock.calls as unknown as Array<[{ data: { passwordHash: string } }]>)[0][0].data;
    expect(data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });
});
