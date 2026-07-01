import { NextRequest, NextResponse } from "next/server";
import { affiliationRequestSchema } from "@/lib/affiliation/schema";
import { createRequest } from "@/lib/hub/affiliation";
import { sendAffiliationVerifyEmail } from "@/lib/email/affiliation-emails";
import { hubRateLimit } from "@/lib/rate-limit/hub-rate-limit";
import { publicOrigin } from "@/lib/request-origin";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  const rl = await hubRateLimit({ key: `affiliation-request:${ip}`, windowSeconds: 3600, max: 5 });
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds }, { status: 429 });

  const parsed = affiliationRequestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { request, emailToken } = await createRequest(parsed.data);
  const link = `${publicOrigin(req)}/api/hub/affiliation/verify?token=${emailToken}`;
  await sendAffiliationVerifyEmail({ to: request.contactEmail, link });
  return NextResponse.json({ ok: true }, { status: 201 });
}
