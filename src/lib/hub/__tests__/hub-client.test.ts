import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { encryptToken, decryptToken } from "@/lib/hub/token-crypto";
import { fetchWithTokenRefresh } from "@/lib/hub/hub-client";

const CREATED_USERS: string[] = [];

describe("hub-client", () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "test-secret-for-token-encrypt-32";
    process.env.SAVINT_HUB_URL = "https://hub.example";
    process.env.HUB_OAUTH_CLIENT_ID = "cid";
    process.env.HUB_OAUTH_CLIENT_SECRET = "sec";
  });

  afterAll(async () => {
    for (const id of CREATED_USERS) {
      await prisma.hubLink.deleteMany({ where: { userId: id } });
      await prisma.user.deleteMany({ where: { id } });
    }
  });

  it("calls the hub with the current access token", async () => {
    const userId = `u-hc-${Date.now()}`;
    CREATED_USERS.push(userId);
    await prisma.user.create({ data: { id: userId, email: `${userId}@x` } });
    await prisma.hubLink.create({
      data: {
        userId,
        hubAccountId: "ha",
        hubAccountEmail: "h@x",
        accessTokenCiphertext: encryptToken("good-token", process.env.NEXTAUTH_SECRET!),
        refreshTokenCiphertext: encryptToken("refresh", process.env.NEXTAUTH_SECRET!),
        accessTokenExpiresAt: new Date(Date.now() + 60_000),
        scopes: ["publish"],
      },
    });
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer good-token");
      return new Response("ok", { status: 200 });
    });
    global.fetch = fetchMock as typeof fetch;
    const res = await fetchWithTokenRefresh(userId, "/api/hub/quizzes", { method: "GET" });
    expect(res.status).toBe(200);
  });

  it("refreshes when access token is near expiry and retries", async () => {
    const userId = `u-hc-${Date.now()}-r`;
    CREATED_USERS.push(userId);
    await prisma.user.create({ data: { id: userId, email: `${userId}@x` } });
    await prisma.hubLink.create({
      data: {
        userId,
        hubAccountId: "ha",
        hubAccountEmail: "h@x",
        accessTokenCiphertext: encryptToken("expired", process.env.NEXTAUTH_SECRET!),
        refreshTokenCiphertext: encryptToken("rt-1", process.env.NEXTAUTH_SECRET!),
        accessTokenExpiresAt: new Date(Date.now() - 1000),
        scopes: ["publish"],
      },
    });
    let call = 0;
    global.fetch = vi.fn(async (url: string) => {
      call++;
      if (url.endsWith("/api/hub/oauth/token")) {
        return new Response(
          JSON.stringify({
            access_token: "new-at",
            refresh_token: "new-rt",
            expires_in: 900,
            scope: "publish",
            token_type: "Bearer",
            hub_account_id: "ha",
            hub_account_email: "h@x",
          }),
          { status: 200 },
        );
      }
      return new Response("ok", { status: 200 });
    }) as typeof fetch;
    const res = await fetchWithTokenRefresh(userId, "/api/hub/quizzes");
    expect(res.status).toBe(200);
    expect(call).toBe(2);
    const link = await prisma.hubLink.findUnique({ where: { userId } });
    expect(decryptToken(link!.accessTokenCiphertext, process.env.NEXTAUTH_SECRET!)).toBe(
      "new-at",
    );
  });
});
