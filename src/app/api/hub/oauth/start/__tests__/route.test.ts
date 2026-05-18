import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/hub/oauth/start/route";
import { prisma } from "@/lib/db/client";

vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(async () => ({ user: { id: "u-start-1" } })),
}));

describe("GET /api/hub/oauth/start", () => {
  beforeEach(async () => {
    process.env.SAVINT_HUB_URL = "https://hub.example";
    process.env.HUB_OAUTH_CLIENT_ID = "cid";
    process.env.HUB_OAUTH_CLIENT_SECRET = "sec";
    await prisma.user.upsert({
      where: { id: "u-start-1" },
      create: { id: "u-start-1", email: `u-start-${Date.now()}@x` },
      update: {},
    });
  });

  it("redirects to hub authorize URL with PKCE challenge and stores verifier", async () => {
    const res = await GET(
      new Request("http://app/api/hub/oauth/start?quizId=q1&scopes=publish") as never,
    );
    expect(res.status).toBe(307);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("https://hub.example/oauth/authorize");
    expect(loc).toContain("code_challenge=");
    const url = new URL(loc);
    const state = url.searchParams.get("state")!;
    const row = await prisma.oAuthFlowState.findUnique({ where: { state } });
    expect(row?.codeVerifier.length).toBeGreaterThan(40);
    expect(row?.quizId).toBe("q1");
  });

  it("rejects when not authenticated", async () => {
    const { auth } = await import("@/lib/auth/config");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const res = await GET(new Request("http://app/api/hub/oauth/start") as never);
    expect(res.status).toBe(401);
  });
});
