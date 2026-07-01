import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { getHubOAuthConfig, hasHubOAuthConfig } from "@/lib/hub/oauth-config";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    hubConfig: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db/client";

const mockFindUnique = prisma.hubConfig.findUnique as ReturnType<typeof vi.fn>;

describe("oauth-config", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    mockFindUnique.mockResolvedValue(null);
    delete process.env.HUB_OAUTH_CLIENT_ID;
    delete process.env.HUB_OAUTH_CLIENT_SECRET;
    delete process.env.SAVINT_HUB_URL;
  });

  afterAll(() => {
    Object.assign(process.env, saved);
  });

  it("returns false / throws when neither DB nor env is set", async () => {
    expect(await hasHubOAuthConfig()).toBe(false);
    await expect(getHubOAuthConfig()).rejects.toThrow(/Hub non configurato/);
  });

  it("DB row present → returns DB values (ignores env)", async () => {
    mockFindUnique.mockResolvedValue({
      id: "singleton",
      clientId: "db-cid",
      clientSecret: "db-sec",
      hubUrl: "https://hub.savint.it/",
      connectedAt: new Date(),
      updatedAt: new Date(),
    });
    // env should NOT override
    process.env.HUB_OAUTH_CLIENT_ID = "env-cid";
    process.env.HUB_OAUTH_CLIENT_SECRET = "env-sec";
    process.env.SAVINT_HUB_URL = "https://env.savint.it";

    expect(await hasHubOAuthConfig()).toBe(true);
    const cfg = await getHubOAuthConfig();
    expect(cfg.clientId).toBe("db-cid");
    expect(cfg.clientSecret).toBe("db-sec");
    expect(cfg.hubUrl).toBe("https://hub.savint.it"); // trailing slash stripped
  });

  it("DB row absent → falls back to env", async () => {
    mockFindUnique.mockResolvedValue(null);
    process.env.HUB_OAUTH_CLIENT_ID = "cid";
    process.env.HUB_OAUTH_CLIENT_SECRET = "sec";
    process.env.SAVINT_HUB_URL = "https://savint.it";

    expect(await hasHubOAuthConfig()).toBe(true);
    const cfg = await getHubOAuthConfig();
    expect(cfg.clientId).toBe("cid");
    expect(cfg.hubUrl).toBe("https://savint.it");
  });

  it("DB row has incomplete fields → falls back to env", async () => {
    mockFindUnique.mockResolvedValue({
      id: "singleton",
      clientId: "db-cid",
      clientSecret: null,
      hubUrl: null,
      connectedAt: new Date(),
      updatedAt: new Date(),
    });
    process.env.HUB_OAUTH_CLIENT_ID = "env-cid";
    process.env.HUB_OAUTH_CLIENT_SECRET = "env-sec";
    process.env.SAVINT_HUB_URL = "https://savint.it";

    const cfg = await getHubOAuthConfig();
    expect(cfg.clientId).toBe("env-cid");
  });
});
