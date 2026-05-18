import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { hashToken } from "@/lib/hub/token-hash";
import { hubRateLimit } from "@/lib/rate-limit/hub-rate-limit";

function bearer(req: NextRequest): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  return m ? m[1] : null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const row = await prisma.hubAccessToken.findUnique({
    where: { accessTokenHash: hashToken(token) },
  });
  if (!row || row.revokedAt || row.accessTokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!row.scopes.includes("clone")) {
    return NextResponse.json({ error: "insufficient_scope" }, { status: 403 });
  }

  const rl = await hubRateLimit({ key: `download:${row.id}`, windowSeconds: 60, max: 30 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { id } = await params;
  const quiz = await prisma.hubQuiz.findUnique({
    where: { id },
    include: { hubAccount: { select: { id: true, name: true, email: true } } },
  });
  if (!quiz || quiz.suspended) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.hubQuiz.update({
    where: { id },
    data: { downloadsCount: { increment: 1 } },
  });

  const qlzBase64 = Buffer.from(quiz.payloadBlob).toString("base64");
  const hubAuthor = quiz.hubAccount.name ?? quiz.hubAccount.email.split("@")[0];

  return NextResponse.json({
    qlzBase64,
    hubQuizId: quiz.id,
    hubAuthor,
    version: quiz.version,
  });
}
