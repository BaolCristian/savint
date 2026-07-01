import { prisma } from "@/lib/db/client";
export type HubOAuthConfig = { clientId: string; clientSecret: string; hubUrl: string };

async function fromDb(): Promise<HubOAuthConfig | null> {
  const row = await prisma.hubConfig.findUnique({ where: { id: "singleton" } });
  if (!row?.clientId || !row?.clientSecret || !row?.hubUrl) return null;
  return { clientId: row.clientId, clientSecret: row.clientSecret, hubUrl: row.hubUrl.replace(/\/+$/, "") };
}
function fromEnv(): HubOAuthConfig | null {
  const clientId = process.env.HUB_OAUTH_CLIENT_ID, clientSecret = process.env.HUB_OAUTH_CLIENT_SECRET, hubUrl = process.env.SAVINT_HUB_URL;
  if (!clientId || !clientSecret || !hubUrl) return null;
  return { clientId, clientSecret, hubUrl: hubUrl.replace(/\/+$/, "") };
}
export async function hasHubOAuthConfig(): Promise<boolean> { return Boolean((await fromDb()) ?? fromEnv()); }
export async function getHubOAuthConfig(): Promise<HubOAuthConfig> {
  const cfg = (await fromDb()) ?? fromEnv();
  if (!cfg) throw new Error("Hub non configurato (né DB né env)");
  return cfg;
}
