import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { encryptToken } from "@/lib/hub/token-crypto";
import { getHubOAuthConfig } from "@/lib/hub/oauth-config";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  const flow = await prisma.oAuthFlowState.findUnique({ where: { state } });
  if (!flow || flow.userId !== session.user.id || flow.expiresAt < new Date()) {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  const cfg = getHubOAuthConfig();
  const tokenRes = await fetch(`${cfg.hubUrl}/api/hub/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: `${url.origin}/api/hub/oauth/callback`,
      code_verifier: flow.codeVerifier,
    }).toString(),
  });
  if (!tokenRes.ok) {
    return NextResponse.json({ error: "exchange_failed" }, { status: 502 });
  }
  const body = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
    hub_account_id: string;
    hub_account_email: string;
  };

  const secret = process.env.NEXTAUTH_SECRET ?? "";
  const accessTokenCiphertext = encryptToken(body.access_token, secret);
  const refreshTokenCiphertext = encryptToken(body.refresh_token, secret);

  await prisma.hubLink.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      hubAccountId: body.hub_account_id,
      hubAccountEmail: body.hub_account_email,
      accessTokenCiphertext,
      refreshTokenCiphertext,
      accessTokenExpiresAt: new Date(Date.now() + body.expires_in * 1000),
      scopes: body.scope.split(/\s+/).filter(Boolean),
    },
    update: {
      hubAccountId: body.hub_account_id,
      hubAccountEmail: body.hub_account_email,
      accessTokenCiphertext,
      refreshTokenCiphertext,
      accessTokenExpiresAt: new Date(Date.now() + body.expires_in * 1000),
      scopes: body.scope.split(/\s+/).filter(Boolean),
      revokedAt: null,
    },
  });

  await prisma.oAuthFlowState.delete({ where: { id: flow.id } });

  const dest = flow.quizId
    ? `/quiz/${flow.quizId}?hubLinked=1`
    : `/account/hub-link?linked=1`;
  return NextResponse.redirect(`${url.origin}${dest}`, 307);
}
