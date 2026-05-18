import { describe, it, expect, vi, beforeEach } from "vitest";

const hub = {
  findUnique: vi.fn(),
  update: vi.fn(),
};
const authFn = vi.fn();

vi.mock("@/lib/db/client", () => ({ prisma: { hubAccount: hub } }));
vi.mock("@/lib/auth/config", () => ({ auth: authFn }));

beforeEach(() => {
  hub.findUnique.mockReset();
  hub.update.mockReset();
  authFn.mockReset();
});

describe("account actions: updateProfile", () => {
  it("rejects when unauthenticated", async () => {
    authFn.mockResolvedValue(null);
    const { updateProfile } = await import("@/app/(hub)/hub-account/actions");
    const out = await updateProfile({ name: "New", affiliation: "Liceo Galilei" });
    expect(out).toEqual({ ok: false, error: "unauthorized" });
  });

  it("updates name and affiliation for the current account", async () => {
    authFn.mockResolvedValue({ user: { id: "acct-1" } });
    hub.update.mockResolvedValue({});
    const { updateProfile } = await import("@/app/(hub)/hub-account/actions");
    const out = await updateProfile({ name: "Tina B.", affiliation: "Liceo Galilei, Padova" });
    expect(out).toEqual({ ok: true });
    expect(hub.update).toHaveBeenCalledWith({
      where: { id: "acct-1" },
      data: { name: "Tina B.", affiliation: "Liceo Galilei, Padova" },
    });
  });
});

describe("account actions: changePassword", () => {
  it("rejects when unauthenticated", async () => {
    authFn.mockResolvedValue(null);
    const { changePassword } = await import("@/app/(hub)/hub-account/actions");
    const out = await changePassword({ currentPassword: "x", newPassword: "newpassword1" });
    expect(out).toEqual({ ok: false, error: "unauthorized" });
  });

  it("returns wrong_password when current does not match", async () => {
    const { hashPassword } = await import("@/lib/auth/password");
    const realHash = await hashPassword("password1");
    authFn.mockResolvedValue({ user: { id: "acct-1" } });
    hub.findUnique.mockResolvedValue({ id: "acct-1", authMethod: "PASSWORD", passwordHash: realHash });
    const { changePassword } = await import("@/app/(hub)/hub-account/actions");
    const out = await changePassword({ currentPassword: "wrong", newPassword: "newpassword1" });
    expect(out).toEqual({ ok: false, error: "wrong_password" });
    expect(hub.update).not.toHaveBeenCalled();
  });

  it("updates password on success", async () => {
    const { hashPassword } = await import("@/lib/auth/password");
    const realHash = await hashPassword("password1");
    authFn.mockResolvedValue({ user: { id: "acct-1" } });
    hub.findUnique.mockResolvedValue({ id: "acct-1", authMethod: "PASSWORD", passwordHash: realHash });
    hub.update.mockResolvedValue({});
    const { changePassword } = await import("@/app/(hub)/hub-account/actions");
    const out = await changePassword({ currentPassword: "password1", newPassword: "newpassword1" });
    expect(out).toEqual({ ok: true });
    expect(hub.update).toHaveBeenCalledTimes(1);
    const data = (hub.update.mock.calls as unknown as Array<[{ data: { passwordHash: string } }]>)[0][0].data;
    expect(data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("rejects when authMethod is GOOGLE-only (no password to change)", async () => {
    authFn.mockResolvedValue({ user: { id: "acct-1" } });
    hub.findUnique.mockResolvedValue({ id: "acct-1", authMethod: "GOOGLE", passwordHash: null });
    const { changePassword } = await import("@/app/(hub)/hub-account/actions");
    const out = await changePassword({ currentPassword: "anything", newPassword: "newpassword1" });
    expect(out).toEqual({ ok: false, error: "not_password_account" });
  });
});
