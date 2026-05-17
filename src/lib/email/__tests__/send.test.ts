import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMail = vi.fn().mockResolvedValue({ messageId: "fake" });
const createTransport = vi.fn(() => ({ sendMail }));

vi.mock("nodemailer", () => ({
  default: { createTransport },
  createTransport,
}));

const ENV_KEYS = [
  "HUB_EMAIL_FROM",
  "HUB_SMTP_HOST",
  "HUB_SMTP_PORT",
  "HUB_SMTP_USER",
  "HUB_SMTP_PASS",
  "HUB_SMTP_SECURE",
];

describe("email/send", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
    }
    process.env.HUB_EMAIL_FROM = "noreply@savint.it";
    process.env.HUB_SMTP_HOST = "mailhog";
    process.env.HUB_SMTP_PORT = "1025";
    process.env.HUB_SMTP_USER = "smtp-user";
    process.env.HUB_SMTP_PASS = "smtp-pass";
    process.env.HUB_SMTP_SECURE = "false";
    sendMail.mockClear();
    createTransport.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
  });

  it("sends a verification email with link and locale 'it'", async () => {
    const { sendVerificationEmail } = await import("../send");
    await sendVerificationEmail({
      to: "user@example.com",
      link: "https://savint.it/savint/api/hub/auth/verify?token=xyz",
      locale: "it",
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const args = sendMail.mock.calls[0][0];
    expect(args.from).toBe("noreply@savint.it");
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toMatch(/Conferma/i);
    expect(args.html).toContain("https://savint.it/savint/api/hub/auth/verify?token=xyz");
    expect(args.text).toContain("https://savint.it/savint/api/hub/auth/verify?token=xyz");
  });

  it("sends a verification email in English", async () => {
    const { sendVerificationEmail } = await import("../send");
    await sendVerificationEmail({ to: "user@example.com", link: "https://x/v", locale: "en" });
    const args = sendMail.mock.calls[0][0];
    expect(args.subject).toMatch(/Confirm/i);
  });

  it("sends a password reset email", async () => {
    const { sendPasswordResetEmail } = await import("../send");
    await sendPasswordResetEmail({ to: "user@example.com", link: "https://x/r", locale: "it" });
    const args = sendMail.mock.calls[0][0];
    expect(args.subject).toMatch(/password/i);
    expect(args.html).toContain("https://x/r");
  });

  it("creates the SMTP transport using env vars", async () => {
    const { sendVerificationEmail } = await import("../send");
    await sendVerificationEmail({ to: "u@e.com", link: "x", locale: "it" });
    expect(createTransport).toHaveBeenCalledTimes(1);
    const cfg = createTransport.mock.calls[0][0];
    expect(cfg.host).toBe("mailhog");
    expect(cfg.port).toBe(1025);
    expect(cfg.secure).toBe(false);
    expect(cfg.auth).toEqual({ user: "smtp-user", pass: "smtp-pass" });
  });

  it("generic sendEmail passes through to transport", async () => {
    const { sendEmail } = await import("../send");
    await sendEmail({
      to: "u@e.com",
      subject: "Hello",
      text: "Plain body",
      html: "<p>HTML body</p>",
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const args = sendMail.mock.calls[0][0];
    expect(args.from).toBe("noreply@savint.it");
    expect(args.to).toBe("u@e.com");
    expect(args.subject).toBe("Hello");
    expect(args.text).toBe("Plain body");
    expect(args.html).toBe("<p>HTML body</p>");
  });
});
