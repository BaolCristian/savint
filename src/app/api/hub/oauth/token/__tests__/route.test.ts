import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST } from "@/app/api/hub/oauth/token/route";
import { prisma } from "@/lib/db/client";
import { hashToken } from "@/lib/hub/token-hash";
import { generatePkcePair } from "@/lib/hub/pkce";
import { hashPassword } from "@/lib/auth/password";

const req = (form: Record<string, string>) =>
  new Request("http://h/api/hub/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });

describe("POST /api/hub/oauth/token", () => {
  let installationId: string;
  let clientId: string;
  let clientSecret: string;
  let hubAccountId: string;

  beforeAll(async () => {
    clientId = `c-${Date.now()}-${Math.random()}`;
    clientSecret = "secretXXXX";
    const account = await prisma.hubAccount.create({
      data: {
        email: `test-oauth-${Date.now()}@test.invalid`,
        name: "Test Hub Account",
        authMethod: "PASSWORD",
      },
    });
    hubAccountId = account.id;
    const i = await prisma.installation.create({
      data: {
        name: "T",
        contactEmail: "a@b",
        clientId,
        clientSecretHash: await hashPassword(clientSecret),
      },
    });
    installationId = i.id;
  });

  afterAll(async () => {
    await prisma.hubAccessToken.deleteMany({ where: { installationId } });
    await prisma.oAuthAuthorizationCode.deleteMany({ where: { installationId } });
    await prisma.installation.delete({ where: { id: installationId } });
    await prisma.hubAccount.delete({ where: { id: hubAccountId } });
  });

  it("exchanges code for tokens with PKCE", async () => {
    const code = `auth-code-${Date.now()}-1`;
    const pkce = generatePkcePair();
    await prisma.oAuthAuthorizationCode.create({
      data: {
        codeHash: hashToken(code),
        installationId,
        hubAccountId,
        redirectUri: "https://x/cb",
        scopes: ["publish"],
        codeChallenge: pkce.challenge,
        codeChallengeMethod: "S256",
        state: "s",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const res = await POST(req({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: "https://x/cb",
      code_verifier: pkce.verifier,
    }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.refresh_token).toBeTruthy();
    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBeGreaterThan(0);
    expect(body.hub_account_id).toBeTruthy();
    expect(body.hub_account_email).toBeDefined();
  });

  it("rejects a reused code", async () => {
    const code = `auth-code-${Date.now()}-2`;
    const pkce = generatePkcePair();
    await prisma.oAuthAuthorizationCode.create({
      data: {
        codeHash: hashToken(code),
        installationId,
        hubAccountId,
        redirectUri: "https://x/cb",
        scopes: ["publish"],
        codeChallenge: pkce.challenge,
        codeChallengeMethod: "S256",
        state: "s",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const form = {
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: "https://x/cb",
      code_verifier: pkce.verifier,
    };
    const ok = await POST(req(form) as never);
    expect(ok.status).toBe(200);
    const replay = await POST(req(form) as never);
    expect(replay.status).toBe(400);
  });

  it("rejects wrong PKCE verifier", async () => {
    const code = `auth-code-${Date.now()}-3`;
    const pkce = generatePkcePair();
    await prisma.oAuthAuthorizationCode.create({
      data: {
        codeHash: hashToken(code),
        installationId,
        hubAccountId,
        redirectUri: "https://x/cb",
        scopes: ["publish"],
        codeChallenge: pkce.challenge,
        codeChallengeMethod: "S256",
        state: "s",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const res = await POST(req({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: "https://x/cb",
      code_verifier: "wrong-verifier".padEnd(43, "x"),
    }) as never);
    expect(res.status).toBe(400);
  });

  it("rejects expired code", async () => {
    const code = `auth-code-${Date.now()}-4`;
    const pkce = generatePkcePair();
    await prisma.oAuthAuthorizationCode.create({
      data: {
        codeHash: hashToken(code),
        installationId,
        hubAccountId,
        redirectUri: "https://x/cb",
        scopes: ["publish"],
        codeChallenge: pkce.challenge,
        codeChallengeMethod: "S256",
        state: "s",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const res = await POST(req({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: "https://x/cb",
      code_verifier: pkce.verifier,
    }) as never);
    expect(res.status).toBe(400);
  });
});
