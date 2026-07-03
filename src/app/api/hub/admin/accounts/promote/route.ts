import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";

/**
 * Promote an existing hub account to HUB_ADMIN by email. The person must have
 * already registered on the hub — we never create accounts here.
 */
export async function POST(req: NextRequest) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const email = String((body as { email?: unknown })?.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "invalid_email" }, { status: 400 });

  const acct = await prisma.hubAccount.findUnique({ where: { email } });
  if (!acct) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (acct.role !== "HUB_ADMIN") {
    await prisma.hubAccount.update({ where: { id: acct.id }, data: { role: "HUB_ADMIN" } });
  }
  return NextResponse.json({ ok: true, id: acct.id });
}
