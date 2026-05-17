import { describe, it, expect, vi, beforeEach } from "vitest";

const consumeVerificationToken = vi.fn();
const hubUpdate = vi.fn();

vi.mock("@/lib/auth/verification-token", () => ({ consumeVerificationToken }));
vi.mock("@/lib/db/client", () => ({
  prisma: { hubAccount: { update: hubUpdate } },
}));

beforeEach(() => {
  consumeVerificationToken.mockReset();
  hubUpdate.mockReset();
});

describe("GET /api/hub/auth/verify", () => {
  it("redirects to /hub-login?verified=1 on success and sets emailVerified", async () => {
    consumeVerificationToken.mockResolvedValue({ hubAccountId: "acct-1" });
    hubUpdate.mockResolvedValue({});
    const { GET } = await import("@/app/api/hub/auth/verify/route");
    const res = await GET(new Request("http://localhost/savint/api/hub/auth/verify?token=abc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/hub-login?verified=1");
    expect(consumeVerificationToken).toHaveBeenCalledWith("abc", "VERIFY_EMAIL");
    expect(hubUpdate).toHaveBeenCalledWith({
      where: { id: "acct-1" },
      data: { emailVerified: expect.any(Date) },
    });
  });

  it("redirects to /hub-login?verified=0 on invalid/expired token", async () => {
    consumeVerificationToken.mockResolvedValue(null);
    const { GET } = await import("@/app/api/hub/auth/verify/route");
    const res = await GET(new Request("http://localhost/savint/api/hub/auth/verify?token=bad"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/hub-login?verified=0");
    expect(hubUpdate).not.toHaveBeenCalled();
  });

  it("redirects to /hub-login?verified=0 when token query param is missing", async () => {
    const { GET } = await import("@/app/api/hub/auth/verify/route");
    const res = await GET(new Request("http://localhost/savint/api/hub/auth/verify"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/hub-login?verified=0");
    expect(consumeVerificationToken).not.toHaveBeenCalled();
  });
});
