import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST } from "@/app/api/hub/oauth/revoke/route";
import { prisma } from "@/lib/db/client";
import { hashToken, generateOpaqueToken } from "@/lib/hub/token-hash";
import { hashPassword } from "@/lib/auth/password";

const req = (form: Record<string, string>) =>
  new Request("http://h/api/hub/oauth/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });

describe("POST /api/hub/oauth/revoke", () => {
  let installationId: string;
  let hubAccountId: string;
  let clientId: string;
  const clientSecret = "verysecretpassword";
  let plainAccess: string;
  let tokenId: string;

  beforeAll(async () => {
    clientId = `c-${Date.now()}-${Math.random()}`;
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
      data: {
        name: "T", contactEmail: "a@b", clientId,
        clientSecretHash: await hashPassword(clientSecret),
      },
    });
    installationId = inst.id;
    plainAccess = generateOpaqueToken();
    const tk = await prisma.hubAccessToken.create({
      data: {
        hubAccountId,
        installationId,
        accessTokenHash: hashToken(plainAccess),
        refreshTokenHash: hashToken(generateOpaqueToken()),
        accessTokenExpiresAt: new Date(Date.now() + 900_000),
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 86400_000),
        scopes: ["publish"],
      },
    });
    tokenId = tk.id;
  });

  afterAll(async () => {
    await prisma.hubAccessToken.deleteMany({ where: { installationId } });
    await prisma.installation.delete({ where: { id: installationId } });
    await prisma.hubAccount.delete({ where: { id: hubAccountId } });
  });

  it("revokes the access token and the chain", async () => {
    const res = await POST(req({
      token: plainAccess,
      client_id: clientId,
      client_secret: clientSecret,
    }) as never);
    expect(res.status).toBe(200);
    const after = await prisma.hubAccessToken.findUnique({ where: { id: tokenId } });
    expect(after?.revokedAt).toBeInstanceOf(Date);
  });

  it("rejects with invalid client", async () => {
    const res = await POST(req({
      token: plainAccess,
      client_id: clientId,
      client_secret: "wrong-secret-of-sufficient-length",
    }) as never);
    expect(res.status).toBe(401);
  });
});
