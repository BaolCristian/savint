import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { hashToken } from "@/lib/hub/token-hash";

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
