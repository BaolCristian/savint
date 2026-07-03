import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const inst = await prisma.installation.findUnique({ where: { id } });
  if (!inst) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // DISABLED already blocks the token endpoint (api/hub/oauth/token). We also
  // drop existing access tokens so the revocation is immediate.
  await prisma.$transaction([
    prisma.installation.update({ where: { id }, data: { status: "DISABLED" } }),
    prisma.hubAccessToken.deleteMany({ where: { installationId: id } }),
  ]);
  return NextResponse.json({ ok: true });
}
