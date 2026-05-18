import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getHubSession } from "@/lib/auth/hub-session";
import { hashIp } from "@/lib/security/ip-hash";
import { hubRateLimit } from "@/lib/rate-limit/hub-rate-limit";
import { getClientIp } from "@/lib/rate-limit/get-client-ip";

const schema = z.object({
  hubQuizId: z.string().min(1),
  reason: z.enum(["COPYRIGHT", "PERSONAL_DATA", "OFFENSIVE", "OTHER"]),
  description: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  // Rate-limit: 5 reports per IP per 24 hours
  const rl = await hubRateLimit({
    key: `report:${ip}`,
    windowSeconds: 86400,
    max: 5,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { hubQuizId, reason, description } = parsed.data;

  // Optionally attach reporter account
  const session = await getHubSession(req);
  let reporterAccountId: string | null = null;
  if (session) {
    if (session.bannedAt) {
      return NextResponse.json({ error: "banned" }, { status: 403 });
    }
    reporterAccountId = session.id;
  }

  // Check quiz exists and is not suspended
  const quiz = await prisma.hubQuiz.findUnique({ where: { id: hubQuizId } });
  if (!quiz || quiz.suspended) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (quiz.unpublishedAt) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const reporterIpHash = hashIp(ip);

  // 24-hour dedup: one report per (quizId, ipHash) per day
  const windowStart = new Date();
  windowStart.setUTCHours(0, 0, 0, 0); // start of UTC day

  const existing = await prisma.hubReport.findFirst({
    where: {
      hubQuizId,
      reporterIpHash,
      createdAt: { gte: windowStart },
    },
  });
  if (existing) {
    return NextResponse.json({ error: "already_reported" }, { status: 409 });
  }

  const report = await prisma.hubReport.create({
    data: {
      hubQuizId,
      reporterAccountId,
      reporterIpHash,
      reason,
      description: description ?? null,
    },
  });

  return NextResponse.json({ id: report.id }, { status: 201 });
}
