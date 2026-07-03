import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";

/**
 * Delete a connected school directly by its Installation id. Some schools are
 * connected without going through the self-service AffiliationRequest flow
 * (created via the install script), so they exist only as an Installation.
 * Deleting the Installation cascades its tokens/authorization codes; we also
 * drop any AffiliationRequest that referenced it.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const inst = await prisma.installation.findUnique({ where: { id } });
  if (!inst) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.affiliationRequest.deleteMany({ where: { installationId: id } });
    await tx.installation.delete({ where: { id } }); // cascade: token + authcode
  });
  return NextResponse.json({ ok: true });
}
