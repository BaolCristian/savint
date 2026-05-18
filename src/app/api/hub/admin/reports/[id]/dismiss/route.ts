import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const report = await prisma.hubReport.findUnique({ where: { id } });
  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.hubReport.update({
    where: { id },
    data: { status: "DISMISSED", resolvedAt: new Date(), resolvedBy: guard.account.id },
  });
  return NextResponse.json({ ok: true });
}
