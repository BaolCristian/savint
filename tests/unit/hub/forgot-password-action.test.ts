import { describe, it, expect, vi, beforeEach } from "vitest";

const hub = { findUnique: vi.fn() };
const issueVerificationToken = vi.fn().mockResolvedValue({
  plainToken: "tok-reset",
  expiresAt: new Date(Date.now() + 1000),
});
const sendPasswordResetEmail = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/db/client", () => ({ prisma: { hubAccount: hub } }));
vi.mock("@/lib/auth/verification-token", () => ({ issueVerificationToken }));
vi.mock("@/lib/email/send", () => ({ sendPasswordResetEmail }));

beforeEach(() => {
  hub.findUnique.mockReset();
  sendPasswordResetEmail.mockClear();
  issueVerificationToken.mockClear();
  process.env.HUB_BASE_URL = "https://savint.it";
});

describe("requestPasswordReset", () => {
  it("returns ok and sends an email when the account exists with PASSWORD method", async () => {
    hub.findUnique.mockResolvedValue({ id: "acct-1", email: "u@x.com", authMethod: "PASSWORD" });
    const { requestPasswordReset } = await import("@/app/(hub)/hub-forgot-password/actions");
    const out = await requestPasswordReset({ email: "u@x.com", locale: "it" });
    expect(out.ok).toBe(true);
    expect(issueVerificationToken).toHaveBeenCalledWith("acct-1", "RESET_PASSWORD");
    expect(sendPasswordResetEmail).toHaveBeenCalledWith({
      to: "u@x.com",
      link: expect.stringContaining("https://savint.it/savint/hub-reset-password?token=tok-reset"),
      locale: "it",
    });
  });

  it("returns ok but does NOT send when account does not exist (no enumeration)", async () => {
    hub.findUnique.mockResolvedValue(null);
    const { requestPasswordReset } = await import("@/app/(hub)/hub-forgot-password/actions");
    const out = await requestPasswordReset({ email: "absent@x.com", locale: "it" });
    expect(out.ok).toBe(true);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("returns ok but does NOT send when authMethod is GOOGLE", async () => {
    hub.findUnique.mockResolvedValue({ id: "acct-2", email: "g@x.com", authMethod: "GOOGLE" });
    const { requestPasswordReset } = await import("@/app/(hub)/hub-forgot-password/actions");
    const out = await requestPasswordReset({ email: "g@x.com", locale: "it" });
    expect(out.ok).toBe(true);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
