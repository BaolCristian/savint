import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { GET } from "@/app/api/hub/oauth/callback/route";
import { prisma } from "@/lib/db/client";

vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(async () => ({ user: { id: "u-cb-1" } })),
}));

describe("GET /api/hub/oauth/callback", () => {
  beforeEach(async () => {
    process.env.SAVINT_HUB_URL = "https://hub.example";
    process.env.HUB_OAUTH_CLIENT_ID = "cid";
    process.env.HUB_OAUTH_CLIENT_SECRET = "sec";
    process.env.NEXTAUTH_SECRET = "test-secret-for-token-encrypt-32";
    await prisma.user.upsert({
      where: { id: "u-cb-1" },
      create: { id: "u-cb-1", email: `u-cb-${Date.now()}@x` },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.hubLink.deleteMany({ where: { userId: "u-cb-1" } });
    await prisma.oAuthFlowState.deleteMany({ where: { userId: "u-cb-1" } });
    await prisma.user.deleteMany({ where: { id: "u-cb-1" } });
  });

  it("exchanges code, encrypts tokens, creates HubLink", async () => {
    const flow = await prisma.oAuthFlowState.create({
      data: {
        userId: "u-cb-1",
        codeVerifier: "v".repeat(64),
        state: `ST-${Date.now()}-1`,
        scopes: ["publish"],
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: "at-1",
          refresh_token: "rt-1",
          token_type: "Bearer",
          expires_in: 900,
          scope: "publish",
          hub_account_id: "ha-1",
          hub_account_email: "h@x",
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const res = await GET(
      new Request(`http://app/api/hub/oauth/callback?code=C&state=${flow.state}`) as never,
    );
    expect([302, 307]).toContain(res.status);
    const link = await prisma.hubLink.findUnique({ where: { userId: "u-cb-1" } });
    expect(link?.accessTokenCiphertext).toBeTruthy();
    expect(link?.scopes).toContain("publish");
  });

  it("rejects an unknown state", async () => {
    const res = await GET(
      new Request("http://app/api/hub/oauth/callback?code=C&state=does-not-exist") as never,
    );
    expect(res.status).toBe(400);
  });
});
