import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db/client";
import { hashToken } from "@/lib/hub/token-hash";
import { hubRateLimit } from "@/lib/rate-limit/hub-rate-limit";
import { publishMetadataSchema } from "@/lib/hub/quiz-metadata";

const MAX_MB = Number(process.env.HUB_MAX_QUIZ_SIZE_MB ?? "50");
const MAX_PER_ACCOUNT = Number(process.env.HUB_PUBLIC_QUIZZES_PER_ACCOUNT_MAX ?? "200");

function bearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

async function authenticate(req: NextRequest, requiredScope: string) {
  const token = bearer(req);
  if (!token) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  const row = await prisma.hubAccessToken.findUnique({
    where: { accessTokenHash: hashToken(token) },
  });
  if (!row || row.revokedAt || row.accessTokenExpiresAt < new Date()) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  }
  if (!row.scopes.includes(requiredScope)) {
    return { error: NextResponse.json({ error: "insufficient_scope" }, { status: 403 }) } as const;
  }
  await prisma.hubAccessToken.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });
  return { token: row, error: null } as const;
}

export async function POST(req: NextRequest) {
  const a = await authenticate(req, "publish");
  if (a.error) return a.error;
  const { token } = a;

  const rl = await hubRateLimit({ key: `publish:${token.id}`, windowSeconds: 3600, max: 10 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: { metadata: unknown; qlzBase64: string; payloadHash: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.qlzBase64 || !body.payloadHash) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const meta = publishMetadataSchema.safeParse(body.metadata);
  if (!meta.success) {
    return NextResponse.json(
      { error: "invalid_metadata", details: meta.error.flatten() },
      { status: 400 },
    );
  }

  let payload: Uint8Array<ArrayBuffer>;
  try {
    payload = Buffer.from(body.qlzBase64, "base64") as unknown as Uint8Array<ArrayBuffer>;
  } catch {
    return NextResponse.json({ error: "invalid_payload_b64" }, { status: 400 });
  }
  if (payload.length === 0) {
    return NextResponse.json({ error: "empty_payload" }, { status: 400 });
  }
  if (payload.length > MAX_MB * 1024 * 1024) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const recomputed = createHash("sha256").update(payload).digest("hex");
  if (recomputed !== body.payloadHash) {
    return NextResponse.json({ error: "payload_hash_mismatch" }, { status: 400 });
  }

  let questionCount = 0;
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(payload);
    const manifestFile = zip.file("manifest.json");
    if (!manifestFile) {
      return NextResponse.json({ error: "missing_manifest" }, { status: 400 });
    }
    const manifest = JSON.parse(await manifestFile.async("text"));
    questionCount = Array.isArray(manifest?.quiz?.questions)
      ? manifest.quiz.questions.length
      : 0;
    if (questionCount === 0) {
      return NextResponse.json({ error: "no_questions" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "invalid_qlz" }, { status: 400 });
  }

  const ifMatch = req.headers.get("if-match");
  if (ifMatch) {
    const existing = await prisma.hubQuiz.findUnique({ where: { id: ifMatch } });
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (existing.hubAccountId !== token.hubAccountId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const nextVersion = existing.version + 1;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.hubQuizVersion.upsert({
        where: { hubQuizId_version: { hubQuizId: existing.id, version: existing.version } },
        create: {
          hubQuizId: existing.id,
          version: existing.version,
          payloadBlob: existing.payloadBlob,
          payloadHash: existing.payloadHash,
          payloadSize: existing.payloadSize,
        },
        update: {
          payloadBlob: existing.payloadBlob,
          payloadHash: existing.payloadHash,
          payloadSize: existing.payloadSize,
        },
      });
      const updatedQuiz = await tx.hubQuiz.update({
        where: { id: existing.id },
        data: {
          title: meta.data.title,
          description: meta.data.description,
          license: meta.data.license,
          tags: meta.data.tags,
          schoolLevel: meta.data.schoolLevel,
          subject: meta.data.subject,
          language: meta.data.language,
          ageMin: meta.data.ageMin,
          ageMax: meta.data.ageMax,
          questionCount,
          estimatedDurationSec: meta.data.estimatedDurationSec,
          payloadBlob: payload,
          payloadHash: recomputed,
          payloadSize: payload.length,
          version: nextVersion,
          unpublishedAt: null,
        },
      });
      await tx.hubQuizVersion.create({
        data: {
          hubQuizId: existing.id,
          version: nextVersion,
          payloadBlob: payload,
          payloadHash: recomputed,
          payloadSize: payload.length,
        },
      });
      return updatedQuiz;
    });
    return NextResponse.json({
      hubQuizId: updated.id,
      version: updated.version,
      publishedAt: updated.updatedAt,
      url: `${new URL(req.url).origin}/q/${updated.id}`,
    });
  }

  const total = await prisma.hubQuiz.count({
    where: { hubAccountId: token.hubAccountId, unpublishedAt: null },
  });
  if (total >= MAX_PER_ACCOUNT) {
    return NextResponse.json({ error: "quota_exceeded" }, { status: 429 });
  }

  const created = await prisma.hubQuiz.create({
    data: {
      hubAccountId: token.hubAccountId,
      title: meta.data.title,
      description: meta.data.description,
      license: meta.data.license,
      tags: meta.data.tags,
      schoolLevel: meta.data.schoolLevel,
      subject: meta.data.subject,
      language: meta.data.language,
      ageMin: meta.data.ageMin,
      ageMax: meta.data.ageMax,
      questionCount,
      estimatedDurationSec: meta.data.estimatedDurationSec,
      payloadBlob: payload,
      payloadHash: recomputed,
      payloadSize: payload.length,
    },
  });
  await prisma.hubQuizVersion.create({
    data: {
      hubQuizId: created.id,
      version: 1,
      payloadBlob: payload,
      payloadHash: recomputed,
      payloadSize: payload.length,
    },
  });
  return NextResponse.json(
    {
      hubQuizId: created.id,
      version: 1,
      publishedAt: created.publishedAt,
      url: `${new URL(req.url).origin}/q/${created.id}`,
    },
    { status: 201 },
  );
}
