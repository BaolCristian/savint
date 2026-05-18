"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { generateOpaqueToken, hashToken } from "@/lib/hub/token-hash";
import { hubRateLimit } from "@/lib/rate-limit/hub-rate-limit";
import { headers } from "next/headers";

export async function approveAuthorization(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("not_authenticated");

  const clientId = String(formData.get("client_id") ?? "");
  const redirectUri = String(formData.get("redirect_uri") ?? "");
  const scope = String(formData.get("scope") ?? "");
  const state = String(formData.get("state") ?? "");
  const codeChallenge = String(formData.get("code_challenge") ?? "");
  const codeChallengeMethod = String(formData.get("code_challenge_method") ?? "S256");

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await hubRateLimit({ key: `oauth_authorize:${ip}`, windowSeconds: 3600, max: 20 });
  if (!rl.allowed) throw new Error("rate_limited");

  const installation = await prisma.installation.findUnique({
    where: { clientId },
  });
  if (!installation || installation.status !== "ACTIVE") {
    throw new Error("invalid_client");
  }

  const code = generateOpaqueToken();
  await prisma.oAuthAuthorizationCode.create({
    data: {
      codeHash: hashToken(code),
      installationId: installation.id,
      hubAccountId: session.user.id,
      redirectUri,
      scopes: scope.split(/[\s,]+/).filter(Boolean),
      codeChallenge,
      codeChallengeMethod,
      state,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });

  const u = new URL(redirectUri);
  u.searchParams.set("code", code);
  u.searchParams.set("state", state);
  redirect(u.toString());
}
