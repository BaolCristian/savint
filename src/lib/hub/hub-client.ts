import { prisma } from "@/lib/db/client";
import { decryptToken, encryptToken } from "@/lib/hub/token-crypto";
import { getHubOAuthConfig } from "@/lib/hub/oauth-config";

const REFRESH_SKEW_MS = 30_000;

export class HubLinkMissingError extends Error {
  constructor() { super("hub_link_missing"); }
}
export class HubReauthRequiredError extends Error {
  constructor() { super("hub_reauth_required"); }
}

/**
 * Returns the install-side URL that starts the OAuth flow with the hub.
 * Optionally passes a quizId so the callback can redirect back to that quiz.
 */
export function getAuthorizeUrl(quizId?: string): string {
  const params = new URLSearchParams();
  if (quizId) params.set("quizId", quizId);
  params.set("scopes", "publish clone");
  return `/api/hub/oauth/start?${params.toString()}`;
}

async function refreshLink(userId: string, secret: string) {
  const cfg = getHubOAuthConfig();
  const link = await prisma.hubLink.findUnique({ where: { userId } });
  if (!link || link.revokedAt) throw new HubLinkMissingError();
  const currentRefresh = decryptToken(link.refreshTokenCiphertext, secret);
  const res = await fetch(`${cfg.hubUrl}/api/hub/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: currentRefresh,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }).toString(),
  });
  if (!res.ok) {
    await prisma.hubLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date() },
    });
    throw new HubReauthRequiredError();
  }
  const body = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };
  await prisma.hubLink.update({
    where: { id: link.id },
    data: {
      accessTokenCiphertext: encryptToken(body.access_token, secret),
      refreshTokenCiphertext: encryptToken(body.refresh_token, secret),
      accessTokenExpiresAt: new Date(Date.now() + body.expires_in * 1000),
      scopes: body.scope.split(/\s+/).filter(Boolean),
      lastUsedAt: new Date(),
    },
  });
  return body.access_token;
}

/**
 * Calls the hub at `path` with the user's current access token, transparently
 * refreshing it when near expiry or on a 401.
 *
 * @param userId installation-local user.id
 * @param path  hub-side path (e.g. `/api/hub/quizzes`)
 * @param init  standard fetch init
 */
export async function fetchWithTokenRefresh(
  userId: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const cfg = getHubOAuthConfig();
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  const link = await prisma.hubLink.findUnique({ where: { userId } });
  if (!link || link.revokedAt) throw new HubLinkMissingError();

  let accessToken: string;
  if (link.accessTokenExpiresAt.getTime() - Date.now() < REFRESH_SKEW_MS) {
    accessToken = await refreshLink(userId, secret);
  } else {
    accessToken = decryptToken(link.accessTokenCiphertext, secret);
  }

  // Build a plain-object headers record so callers can read Authorization directly.
  const existingHeaders: Record<string, string> = {};
  if (init.headers) {
    if (init.headers instanceof Headers) {
      for (const [k, v] of (init.headers as Headers).entries()) {
        existingHeaders[k] = v;
      }
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers as string[][]) {
        existingHeaders[k] = v;
      }
    } else {
      Object.assign(existingHeaders, init.headers as Record<string, string>);
    }
  }
  const headers: Record<string, string> = { ...existingHeaders, Authorization: `Bearer ${accessToken}` };

  let res = await fetch(`${cfg.hubUrl}${path}`, { ...init, headers });
  if (res.status === 401) {
    accessToken = await refreshLink(userId, secret);
    headers["Authorization"] = `Bearer ${accessToken}`;
    res = await fetch(`${cfg.hubUrl}${path}`, { ...init, headers });
  }
  return res;
}
