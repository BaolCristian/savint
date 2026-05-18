export type HubOAuthConfig = {
  clientId: string;
  clientSecret: string;
  hubUrl: string;
};

export function hasHubOAuthConfig(): boolean {
  return Boolean(
    process.env.HUB_OAUTH_CLIENT_ID &&
      process.env.HUB_OAUTH_CLIENT_SECRET &&
      process.env.SAVINT_HUB_URL,
  );
}

export function getHubOAuthConfig(): HubOAuthConfig {
  const clientId = process.env.HUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.HUB_OAUTH_CLIENT_SECRET;
  const hubUrl = process.env.SAVINT_HUB_URL;
  if (!clientId) throw new Error("HUB_OAUTH_CLIENT_ID is not set");
  if (!clientSecret) throw new Error("HUB_OAUTH_CLIENT_SECRET is not set");
  if (!hubUrl) throw new Error("SAVINT_HUB_URL is not set");
  try {
    const u = new URL(hubUrl);
    if (!u.protocol.startsWith("http")) throw new Error("bad protocol");
  } catch {
    throw new Error(`SAVINT_HUB_URL is malformed: ${hubUrl}`);
  }
  return { clientId, clientSecret, hubUrl: hubUrl.replace(/\/+$/, "") };
}
