import { describe, it, expect, vi, beforeEach } from "vitest";
import { _resetForTests } from "@/lib/rate-limit/hub-rate-limit";

const hub = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
}));
const sendVerificationEmail = vi.fn().mockResolvedValue(undefined);
const issueVerificationToken = vi.fn().mockResolvedValue({
  plainToken: "tok-plain",
  expiresAt: new Date(Date.now() + 1000),
});

vi.mock("@/lib/db/client", () => ({
  prisma: {
    hubAccount: hub,
    hubRateLimit: {
      upsert: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));
vi.mock("@/lib/email/send", () => ({ sendVerificationEmail }));
vi.mock("@/lib/auth/verification-token", () => ({ issueVerificationToken }));
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-real-ip", "127.0.0.1"]]) as unknown as Headers,
}));

beforeEach(() => {
  _resetForTests();
  hub.findUnique.mockReset();
  hub.create.mockReset();
  sendVerificationEmail.mockClear();
  issueVerificationToken.mockClear();
  process.env.HUB_BASE_URL = "https://savint.it";
});

describe("registerHubAccount", () => {
  it("rejects invalid email", async () => {
    const { registerHubAccount } = await import("@/app/(hub)/hub-register/actions");
    const out = await registerHubAccount({ email: "not-an-email", password: "password1", name: "X", locale: "it" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe("invalid_email");
  });

  it("rejects short password", async () => {
    const { registerHubAccount } = await import("@/app/(hub)/hub-register/actions");
    const out = await registerHubAccount({ email: "u@x.com", password: "short", name: "X", locale: "it" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe("weak_password");
  });

  it("returns ok-shaped when email already registered (anti-enumeration)", async () => {
    hub.findUnique.mockResolvedValue({ id: "a", email: "u@x.com", authMethod: "PASSWORD" });
    const { registerHubAccount } = await import("@/app/(hub)/hub-register/actions");
    const out = await registerHubAccount({ email: "u@x.com", password: "password1", name: "X", locale: "it" });
    expect(out.ok).toBe(true);
    expect(hub.create).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("creates HubAccount with PASSWORD and sends verification email", async () => {
    hub.findUnique.mockResolvedValue(null);
    hub.create.mockResolvedValue({ id: "new-id", email: "u@x.com" });
    const { registerHubAccount } = await import("@/app/(hub)/hub-register/actions");
    const out = await registerHubAccount({ email: "U@X.com", password: "password1", name: "Tina", locale: "it" });
    expect(out.ok).toBe(true);
    expect(hub.create).toHaveBeenCalledTimes(1);
    const data = (hub.create.mock.calls as unknown as Array<[{ data: { email: string; name: string; authMethod: string; linkedProviders: string[]; passwordHash: string } }]>)[0][0].data;
    expect(data.email).toBe("u@x.com");
    expect(data.name).toBe("Tina");
    expect(data.authMethod).toBe("PASSWORD");
    expect(data.linkedProviders).toEqual(["password"]);
    expect(data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(issueVerificationToken).toHaveBeenCalledWith("new-id", "VERIFY_EMAIL");
    expect(sendVerificationEmail).toHaveBeenCalledWith({
      to: "u@x.com",
      link: expect.stringContaining("https://savint.it/savint/api/hub/auth/verify?token=tok-plain"),
      locale: "it",
    });
  });
});
