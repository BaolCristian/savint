import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";

describe("hub publish schema", () => {
  let userId: string;
  let installationId: string;
  let hubAccountId: string;

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `t-${Date.now()}@x` } });
    userId = u.id;
    const ha = await prisma.hubAccount.create({
      data: {
        email: `ha-${Date.now()}@x`,
        authMethod: "PASSWORD",
        passwordHash: "x",
        emailVerified: new Date(),
      },
    });
    hubAccountId = ha.id;
    const inst = await prisma.installation.create({
      data: { name: "Test Inst", contactEmail: "a@b", clientId: `c-${Date.now()}`, clientSecretHash: "hash" },
    });
    installationId = inst.id;
  });

  afterAll(async () => {
    await prisma.hubLink.deleteMany({ where: { userId } });
    await prisma.hubAccessToken.deleteMany({ where: { installationId } });
    await prisma.installation.delete({ where: { id: installationId } });
    await prisma.hubAccount.delete({ where: { id: hubAccountId } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it("creates a HubLink", async () => {
    const link = await prisma.hubLink.create({
      data: {
        userId,
        hubAccountId,
        hubAccountEmail: "x@y",
        accessTokenCiphertext: "ct1",
        refreshTokenCiphertext: "ct2",
        accessTokenExpiresAt: new Date(Date.now() + 60_000),
        scopes: ["publish", "clone"],
      },
    });
    expect(link.id).toBeTruthy();
  });

  it("creates a HubAccessToken & enforces unique hash", async () => {
    const t = await prisma.hubAccessToken.create({
      data: {
        hubAccountId,
        installationId,
        accessTokenHash: `at-${Date.now()}`,
        refreshTokenHash: `rt-${Date.now()}`,
        accessTokenExpiresAt: new Date(Date.now() + 900_000),
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 86400_000),
        scopes: ["publish"],
      },
    });
    expect(t.rotationCount).toBe(0);
    await expect(
      prisma.hubAccessToken.create({
        data: {
          hubAccountId,
          installationId,
          accessTokenHash: t.accessTokenHash, // duplicate triggers @unique
          refreshTokenHash: `other-${Date.now()}`,
          accessTokenExpiresAt: t.accessTokenExpiresAt,
          refreshTokenExpiresAt: t.refreshTokenExpiresAt,
          scopes: t.scopes,
        },
      }),
    ).rejects.toThrow();
  });
});
