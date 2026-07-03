import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const inst = await prisma.installation.findUnique({ where: { id } });
  if (!inst) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // The school keeps its clientId/secret and obtains fresh tokens on next OAuth.
  await prisma.installation.update({ where: { id }, data: { status: "ACTIVE" } });
  return NextResponse.json({ ok: true });
}
