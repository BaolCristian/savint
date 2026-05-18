import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST } from "@/app/api/hub/oauth/token/route";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";

describe("refresh-token rotation + replay detection", () => {
  let clientId: string;
  const clientSecret = "rr-secretpw";
  let installationId: string;
  let hubAccountId: string;

  const fields = async (form: Record<string, string>) =>
    POST(new Request("http://h/api/hub/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    }) as never);

  beforeAll(async () => {
    clientId = `c-rr-${Date.now()}-${Math.random()}`;
    const ha = await prisma.hubAccount.create({
      data: {
        email: `ha-rr-${Date.now()}@x`,
        authMethod: "PASSWORD",
        passwordHash: "x",
        emailVerified: new Date(),
      },
    });
    hubAccountId = ha.id;
    const i = await prisma.installation.create({
      data: {
        name: "RR", contactEmail: "rr@x",
        clientId, clientSecretHash: await hashPassword(clientSecret),
      },
    });
    installationId = i.id;
  });

  afterAll(async () => {
    await prisma.hubAccessToken.deleteMany({ where: { installationId } });
    await prisma.installation.delete({ where: { id: installationId } });
    await prisma.hubAccount.delete({ where: { id: hubAccountId } });
  });

  it("rotates on each refresh and revokes chain on replay", async () => {
    const seedAccess = `seed-at-rr-${Date.now()}`;
    const seedRefresh = `seed-rt-rr-${Date.now()}`;
    const { hashToken } = await import("@/lib/hub/token-hash");
    await prisma.hubAccessToken.create({
      data: {
        hubAccountId,
        installationId,
        accessTokenHash: hashToken(seedAccess),
        refreshTokenHash: hashToken(seedRefresh),
        accessTokenExpiresAt: new Date(Date.now() + 900_000),
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 86400_000),
        scopes: ["publish"],
      },
    });

    const r1 = await fields({
      grant_type: "refresh_token",
      refresh_token: seedRefresh,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(r1.status).toBe(200);
    const b1 = await r1.json();

    // legitimate refresh with the rotated refresh token works
    const r2 = await fields({
      grant_type: "refresh_token",
      refresh_token: b1.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(r2.status).toBe(200);

    // replay of the original seedRefresh fails AND revokes the chain
    const r3 = await fields({
      grant_type: "refresh_token",
      refresh_token: seedRefresh,
      client_id: clientId,
      client_secret: clientSecret,
    });
    expect(r3.status).toBe(400);

    const revoked = await prisma.hubAccessToken.findMany({
      where: { installationId, revokedAt: { not: null } },
    });
    expect(revoked.length).toBeGreaterThanOrEqual(2);
  });
});
