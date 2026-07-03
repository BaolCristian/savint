import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";

/**
 * Remove HUB_ADMIN from an account (back to HUB_USER). An admin cannot demote
 * themselves — that guarantees at least one admin always remains and avoids
 * locking yourself out.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (id === guard.account.id) {
    return NextResponse.json({ error: "cannot_demote_self" }, { status: 400 });
  }
  const acct = await prisma.hubAccount.findUnique({ where: { id } });
  if (!acct) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (acct.role === "HUB_ADMIN") {
    await prisma.hubAccount.update({ where: { id }, data: { role: "HUB_USER" } });
  }
  return NextResponse.json({ ok: true });
}
