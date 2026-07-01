import { NextRequest, NextResponse } from "next/server";
import { redeem } from "@/lib/hub/affiliation";
import { hubRateLimit } from "@/lib/rate-limit/hub-rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  const rl = await hubRateLimit({ key: `affiliation-redeem:${ip}`, windowSeconds: 3600, max: 20 });
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as { setupCode?: string };
  if (!body.setupCode) return NextResponse.json({ error: "missing_code" }, { status: 400 });

  const r = await redeem(body.setupCode);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  const hubUrl = (process.env.HUB_PUBLIC_URL ?? "https://savint.it").replace(/\/+$/, "");
  return NextResponse.json({ clientId: r.clientId, clientSecret: r.clientSecret, hubUrl });
}
