import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { hashToken } from "@/lib/hub/token-hash";
import { verifyPassword } from "@/lib/auth/password";

export async function POST(req: NextRequest) {
  const params = new URLSearchParams(await req.text());
  const clientId = params.get("client_id");
  const clientSecret = params.get("client_secret");
  const token = params.get("token");
  if (!clientId || !clientSecret || !token) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const inst = await prisma.installation.findUnique({ where: { clientId } });
  if (!inst || !(await verifyPassword(clientSecret, inst.clientSecretHash))) {
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  }
  const tokenHash = hashToken(token);
  const row =
    (await prisma.hubAccessToken.findUnique({ where: { accessTokenHash: tokenHash } })) ??
    (await prisma.hubAccessToken.findUnique({ where: { refreshTokenHash: tokenHash } }));
  if (row && row.installationId === inst.id) {
    await prisma.hubAccessToken.updateMany({
      where: {
        hubAccountId: row.hubAccountId,
        installationId: inst.id,
        revokedAt: null,
      },
      data: { revokedAt: new Date(), revokedReason: "user_revoked" },
    });
  }
  return NextResponse.json({ ok: true });
}
