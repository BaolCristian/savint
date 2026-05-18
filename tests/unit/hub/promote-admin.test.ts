import { describe, it, expect, vi, beforeEach } from "vitest";

const hub = {
  update: vi.fn(),
  findUnique: vi.fn(),
};

vi.mock("@/lib/db/client", () => ({ prisma: { hubAccount: hub } }));

beforeEach(() => {
  hub.update.mockReset();
  hub.findUnique.mockReset();
});

describe("promoteHubAdmin", () => {
  it("throws when email is missing", async () => {
    const { promoteHubAdmin } = await import("../../../scripts/promote-hub-admin");
    await expect(promoteHubAdmin("")).rejects.toThrow(/email/i);
  });

  it("throws when account does not exist", async () => {
    hub.findUnique.mockResolvedValue(null);
    const { promoteHubAdmin } = await import("../../../scripts/promote-hub-admin");
    await expect(promoteHubAdmin("none@x.com")).rejects.toThrow(/no hubaccount/i);
  });

  it("updates role to HUB_ADMIN for the matching email", async () => {
    hub.findUnique.mockResolvedValue({ id: "a-1", email: "x@y.z", role: "HUB_USER" });
    hub.update.mockResolvedValue({ id: "a-1", email: "x@y.z", role: "HUB_ADMIN" });
    const { promoteHubAdmin } = await import("../../../scripts/promote-hub-admin");
    const out = await promoteHubAdmin("X@Y.Z");
    expect(out).toEqual({ id: "a-1", email: "x@y.z", role: "HUB_ADMIN" });
    expect(hub.update).toHaveBeenCalledWith({
      where: { email: "x@y.z" },
      data: { role: "HUB_ADMIN" },
    });
  });
});
