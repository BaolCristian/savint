import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const row = await prisma.affiliationRequest.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    // deleteMany = idempotent; deleting the Installation cascades to its
    // HubAccessToken / OAuthAuthorizationCode rows (onDelete: Cascade).
    if (row.installationId) {
      await tx.installation.deleteMany({ where: { id: row.installationId } });
    }
    await tx.affiliationRequest.delete({ where: { id } });
  });
  return NextResponse.json({ ok: true });
}
