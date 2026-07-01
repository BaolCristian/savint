import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // solo admin installazione
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (me?.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { setupCode?: string };
  if (!body.setupCode) return NextResponse.json({ error: "missing_code" }, { status: 400 });

  const hubBase = (process.env.SAVINT_HUB_URL ?? "https://savint.it").replace(/\/+$/, "");
  const res = await fetch(`${hubBase}/api/hub/affiliation/redeem`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ setupCode: body.setupCode }) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); return NextResponse.json({ error: e.error ?? "redeem_failed" }, { status: 400 }); }
  const creds = (await res.json()) as { clientId: string; clientSecret: string; hubUrl: string };

  await prisma.hubConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", clientId: creds.clientId, clientSecret: creds.clientSecret, hubUrl: creds.hubUrl },
    update: { clientId: creds.clientId, clientSecret: creds.clientSecret, hubUrl: creds.hubUrl },
  });
  return NextResponse.json({ ok: true, hubUrl: creds.hubUrl });
}
