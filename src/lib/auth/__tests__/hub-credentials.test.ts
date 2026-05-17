import { describe, it, expect, vi, beforeEach } from "vitest";

const mockHub = {
  findUnique: vi.fn(),
};

vi.mock("@/lib/db/client", () => ({
  prisma: { hubAccount: mockHub },
}));

beforeEach(() => {
  mockHub.findUnique.mockReset();
});

describe("verifyHubCredentials", () => {
  it("returns null when email is missing", async () => {
    const { verifyHubCredentials } = await import("../hub-credentials");
    expect(await verifyHubCredentials("", "x")).toBeNull();
  });

  it("returns null when account does not exist", async () => {
    mockHub.findUnique.mockResolvedValue(null);
    const { verifyHubCredentials } = await import("../hub-credentials");
    expect(await verifyHubCredentials("x@y.z", "password1")).toBeNull();
  });

  it("returns null when authMethod is GOOGLE (no password set)", async () => {
    mockHub.findUnique.mockResolvedValue({
      id: "a", email: "x@y.z", name: "X", image: null,
      authMethod: "GOOGLE", passwordHash: null, emailVerified: new Date(), bannedAt: null,
    });
    const { verifyHubCredentials } = await import("../hub-credentials");
    expect(await verifyHubCredentials("x@y.z", "password1")).toBeNull();
  });

  it("returns null when email is not verified", async () => {
    const { hashPassword } = await import("../password");
    const hash = await hashPassword("password1");
    mockHub.findUnique.mockResolvedValue({
      id: "a", email: "x@y.z", name: "X", image: null,
      authMethod: "PASSWORD", passwordHash: hash, emailVerified: null, bannedAt: null,
    });
    const { verifyHubCredentials } = await import("../hub-credentials");
    expect(await verifyHubCredentials("x@y.z", "password1")).toBeNull();
  });

  it("returns null when account is banned", async () => {
    const { hashPassword } = await import("../password");
    const hash = await hashPassword("password1");
    mockHub.findUnique.mockResolvedValue({
      id: "a", email: "x@y.z", name: "X", image: null,
      authMethod: "PASSWORD", passwordHash: hash, emailVerified: new Date(), bannedAt: new Date(),
    });
    const { verifyHubCredentials } = await import("../hub-credentials");
    expect(await verifyHubCredentials("x@y.z", "password1")).toBeNull();
  });

  it("returns null when password is wrong", async () => {
    const { hashPassword } = await import("../password");
    const hash = await hashPassword("password1");
    mockHub.findUnique.mockResolvedValue({
      id: "a", email: "x@y.z", name: "X", image: null,
      authMethod: "PASSWORD", passwordHash: hash, emailVerified: new Date(), bannedAt: null,
    });
    const { verifyHubCredentials } = await import("../hub-credentials");
    expect(await verifyHubCredentials("x@y.z", "wrong-password")).toBeNull();
  });

  it("returns a user-shaped object on success", async () => {
    const { hashPassword } = await import("../password");
    const hash = await hashPassword("password1");
    mockHub.findUnique.mockResolvedValue({
      id: "a-id", email: "x@y.z", name: "X", image: null,
      authMethod: "PASSWORD", passwordHash: hash, emailVerified: new Date(), bannedAt: null,
    });
    const { verifyHubCredentials } = await import("../hub-credentials");
    const user = await verifyHubCredentials("x@y.z", "password1");
    expect(user).toEqual({ id: "a-id", email: "x@y.z", name: "X", image: null });
  });
});
