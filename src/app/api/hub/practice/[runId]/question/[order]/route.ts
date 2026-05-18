import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import JSZip from "jszip";

/**
 * Recursively remove all keys named "correct", "isCorrect", "correctAnswer",
 * "correctOrder", "correctValue", "errorIndices", "acceptedAnswers" from an
 * object or array so the client never receives the answer.
 */
export function stripCorrect(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripCorrect);
  }
  if (value !== null && typeof value === "object") {
    const ANSWER_KEYS = new Set([
      "correct",
      "isCorrect",
      "correctAnswer",
      "correctOrder",
      "correctValue",
      "errorIndices",
      "acceptedAnswers",
    ]);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !ANSWER_KEYS.has(k))
        .map(([k, v]) => [k, stripCorrect(v)]),
    );
  }
  return value;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string; order: string }> },
) {
  const { runId, order } = await params;
  const orderNum = parseInt(order, 10);
  if (isNaN(orderNum) || orderNum < 0) {
    return NextResponse.json({ error: "invalid_order" }, { status: 400 });
  }

  const run = await prisma.practiceRun.findUnique({
    where: { id: runId },
    include: {
      hubQuiz: {
        select: { payloadBlob: true, suspended: true, unpublishedAt: true },
      },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (run.expiresAt < new Date()) {
    return NextResponse.json({ error: "run_expired" }, { status: 410 });
  }

  if (!run.hubQuiz || run.hubQuiz.suspended || run.hubQuiz.unpublishedAt) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let manifest: { quiz?: { questions?: unknown[] } };
  try {
    const zip = await JSZip.loadAsync(Buffer.from(run.hubQuiz.payloadBlob));
    const mf = zip.file("manifest.json");
    if (!mf) {
      return NextResponse.json({ error: "invalid_quiz" }, { status: 500 });
    }
    manifest = JSON.parse(await mf.async("text")) as typeof manifest;
  } catch {
    return NextResponse.json({ error: "invalid_quiz" }, { status: 500 });
  }

  const questions = manifest.quiz?.questions ?? [];
  if (orderNum >= questions.length) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const question = questions[orderNum] as Record<string, unknown>;
  const safe = stripCorrect(question) as Record<string, unknown>;

  return NextResponse.json({
    order: orderNum,
    total: questions.length,
    question: safe,
  });
}
