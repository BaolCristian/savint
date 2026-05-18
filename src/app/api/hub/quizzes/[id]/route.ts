import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { hashToken } from "@/lib/hub/token-hash";
import { hubRateLimit } from "@/lib/rate-limit/hub-rate-limit";
import { extractQuestionPreviews } from "@/lib/hub/qlz-preview";

function bearer(req: NextRequest): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  return m ? m[1] : null;
}

export async function DELETE(
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
  if (!row.scopes.includes("publish")) {
    return NextResponse.json({ error: "insufficient_scope" }, { status: 403 });
  }
  const { id } = await params;
  const quiz = await prisma.hubQuiz.findUnique({ where: { id } });
  if (!quiz) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (quiz.hubAccountId !== row.hubAccountId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const updated = await prisma.hubQuiz.update({
    where: { id },
    data: { unpublishedAt: new Date() },
  });
  return NextResponse.json({ id, unpublishedAt: updated.unpublishedAt });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  const rl = await hubRateLimit({ key: `detail:${ip}`, windowSeconds: 60, max: 120 });
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { id } = await params;
  const q = await prisma.hubQuiz.findUnique({
    where: { id },
    include: { hubAccount: { select: { id: true, name: true, email: true, affiliation: true } } },
  });
  if (!q || q.suspended) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const previews = await extractQuestionPreviews(Buffer.from(q.payloadBlob));
  return NextResponse.json({
    id: q.id,
    title: q.title,
    description: q.description,
    tags: q.tags,
    license: q.license,
    schoolLevel: q.schoolLevel,
    subject: q.subject,
    language: q.language,
    ageMin: q.ageMin,
    ageMax: q.ageMax,
    questionCount: q.questionCount,
    estimatedDurationSec: q.estimatedDurationSec,
    version: q.version,
    publishedAt: q.publishedAt,
    updatedAt: q.updatedAt,
    unpublishedAt: q.unpublishedAt,
    downloadsCount: q.downloadsCount,
    playsCount: q.playsCount,
    author: q.hubAccount.name ?? q.hubAccount.email.split("@")[0],
    authorId: q.hubAccount.id,
    authorAffiliation: q.hubAccount.affiliation,
    questions: previews,
  });
}
