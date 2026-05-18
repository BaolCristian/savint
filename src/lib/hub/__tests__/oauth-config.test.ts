import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { getHubOAuthConfig, hasHubOAuthConfig } from "@/lib/hub/oauth-config";

describe("oauth-config", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    delete process.env.HUB_OAUTH_CLIENT_ID;
    delete process.env.HUB_OAUTH_CLIENT_SECRET;
    delete process.env.SAVINT_HUB_URL;
  });

  afterAll(() => {
    Object.assign(process.env, saved);
  });

  it("returns null helpers when not configured", () => {
    expect(hasHubOAuthConfig()).toBe(false);
    expect(() => getHubOAuthConfig()).toThrow(/HUB_OAUTH_CLIENT_ID/);
  });

  it("returns full config when all three vars are set", () => {
    process.env.HUB_OAUTH_CLIENT_ID = "cid";
    process.env.HUB_OAUTH_CLIENT_SECRET = "sec";
    process.env.SAVINT_HUB_URL = "https://savint.it";
    expect(hasHubOAuthConfig()).toBe(true);
    const c = getHubOAuthConfig();
    expect(c.clientId).toBe("cid");
    expect(c.hubUrl).toBe("https://savint.it");
  });

  it("rejects a malformed hub URL", () => {
    process.env.HUB_OAUTH_CLIENT_ID = "cid";
    process.env.HUB_OAUTH_CLIENT_SECRET = "sec";
    process.env.SAVINT_HUB_URL = "not a url";
    expect(() => getHubOAuthConfig()).toThrow();
  });
});
