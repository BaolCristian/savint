import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { generatePkcePair } from "@/lib/hub/pkce";
import { generateOpaqueToken } from "@/lib/hub/token-hash";
import { getHubOAuthConfig } from "@/lib/hub/oauth-config";
import { publicOrigin } from "@/lib/request-origin";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const quizId = url.searchParams.get("quizId") ?? undefined;
  const scopes = (url.searchParams.get("scopes") ?? "publish").split(/[\s,]+/).filter(Boolean);

  const cfg = await getHubOAuthConfig();
  const pkce = generatePkcePair();
  const state = generateOpaqueToken();

  await prisma.oAuthFlowState.create({
    data: {
      userId: session.user.id,
      codeVerifier: pkce.verifier,
      state,
      quizId,
      scopes,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });

  const origin = publicOrigin(req);
  const redirectUri = `${origin}/api/hub/oauth/callback`;

  const authorize = new URL(`${cfg.hubUrl}/oauth/authorize`);
  authorize.searchParams.set("client_id", cfg.clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", scopes.join(" "));
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", pkce.challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("response_type", "code");

  return NextResponse.redirect(authorize.toString(), 307);
}
