import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { generateOpaqueToken, hashToken } from "@/lib/hub/token-hash";
import { verifyPkce } from "@/lib/hub/pkce";
import { verifyPassword } from "@/lib/auth/password";

const ACCESS_TTL_S = 15 * 60;
const REFRESH_TTL_S = 90 * 24 * 3600;

function err(code: string, status = 400) {
  return NextResponse.json({ error: code }, { status });
}

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") ?? "";
  const params = ct.includes("application/json")
    ? new URLSearchParams(Object.entries((await req.json()) ?? {}).map(([k, v]) => [k, String(v)]))
    : new URLSearchParams(await req.text());

  const grant = params.get("grant_type");
  const clientId = params.get("client_id");
  const clientSecret = params.get("client_secret");
  if (!clientId || !clientSecret) return err("invalid_client", 401);

  const installation = await prisma.installation.findUnique({ where: { clientId } });
  if (!installation || installation.status !== "ACTIVE") return err("invalid_client", 401);
  if (!(await verifyPassword(clientSecret, installation.clientSecretHash))) {
    return err("invalid_client", 401);
  }

  if (grant === "authorization_code") {
    const code = params.get("code");
    const redirectUri = params.get("redirect_uri");
    const codeVerifier = params.get("code_verifier");
    if (!code || !redirectUri || !codeVerifier) return err("invalid_request");

    const row = await prisma.oAuthAuthorizationCode.findUnique({
      where: { codeHash: hashToken(code) },
    });
    if (!row) return err("invalid_grant");
    if (row.installationId !== installation.id) return err("invalid_grant");
    if (row.usedAt) return err("invalid_grant");
    if (row.expiresAt < new Date()) return err("invalid_grant");
    if (row.redirectUri !== redirectUri) return err("invalid_grant");
    if (!verifyPkce(codeVerifier, row.codeChallenge, row.codeChallengeMethod as "S256")) {
      return err("invalid_grant");
    }

    const accessToken = generateOpaqueToken();
    const refreshToken = generateOpaqueToken();
    const now = new Date();

    await prisma.$transaction([
      prisma.oAuthAuthorizationCode.update({
        where: { id: row.id },
        data: { usedAt: now },
      }),
      prisma.hubAccessToken.create({
        data: {
          hubAccountId: row.hubAccountId,
          installationId: installation.id,
          accessTokenHash: hashToken(accessToken),
          refreshTokenHash: hashToken(refreshToken),
          accessTokenExpiresAt: new Date(now.getTime() + ACCESS_TTL_S * 1000),
          refreshTokenExpiresAt: new Date(now.getTime() + REFRESH_TTL_S * 1000),
          scopes: row.scopes,
        },
      }),
      prisma.installation.update({
        where: { id: installation.id },
        data: { lastSeenAt: now },
      }),
    ]);

    return NextResponse.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "Bearer",
      expires_in: ACCESS_TTL_S,
      scope: row.scopes.join(" "),
    });
  }

  if (grant === "refresh_token") {
    const refresh = params.get("refresh_token");
    if (!refresh) return err("invalid_request");
    const row = await prisma.hubAccessToken.findUnique({
      where: { refreshTokenHash: hashToken(refresh) },
    });
    if (!row || row.installationId !== installation.id) return err("invalid_grant");

    if (row.revokedAt) {
      await prisma.hubAccessToken.updateMany({
        where: {
          OR: [
            { id: row.id },
            { parentTokenId: row.id },
          ],
          revokedAt: null,
        },
        data: { revokedAt: new Date(), revokedReason: "refresh_replay" },
      });
      return err("invalid_grant");
    }

    if (row.refreshTokenExpiresAt < new Date()) return err("invalid_grant");

    const newAccess = generateOpaqueToken();
    const newRefresh = generateOpaqueToken();
    const now = new Date();

    const created = await prisma.$transaction(async (tx) => {
      const rotated = await tx.hubAccessToken.create({
        data: {
          hubAccountId: row.hubAccountId,
          installationId: installation.id,
          accessTokenHash: hashToken(newAccess),
          refreshTokenHash: hashToken(newRefresh),
          accessTokenExpiresAt: new Date(now.getTime() + ACCESS_TTL_S * 1000),
          refreshTokenExpiresAt: new Date(now.getTime() + REFRESH_TTL_S * 1000),
          scopes: row.scopes,
          rotationCount: row.rotationCount + 1,
          parentTokenId: row.id,
        },
      });
      await tx.hubAccessToken.update({
        where: { id: row.id },
        data: { revokedAt: now, revokedReason: "rotated" },
      });
      return rotated;
    });

    return NextResponse.json({
      access_token: newAccess,
      refresh_token: newRefresh,
      token_type: "Bearer",
      expires_in: ACCESS_TTL_S,
      scope: created.scopes.join(" "),
    });
  }

  return err("unsupported_grant_type");
}
