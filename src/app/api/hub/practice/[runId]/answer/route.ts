import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { checkAnswer } from "@/lib/scoring";
import { completePracticeRun } from "@/lib/hub/practice-run";
import JSZip from "jszip";

interface AnswerBody {
  order: number;
  value: unknown;
}

/**
 * Return the "correct" representation to send back to the client so they can
 * see the right answer after submitting. For each question type we expose only
 * what the client needs to render feedback (not the full internal format).
 */
function correctOptions(type: string, options: Record<string, unknown>) {
  switch (type) {
    case "TRUE_FALSE":
      return { correct: options.correct };
    case "MULTIPLE_CHOICE": {
      const choices = options.choices as { text: string; isCorrect: boolean }[];
      return {
        correctIndices: choices
          .map((c, i) => (c.isCorrect ? i : -1))
          .filter((i) => i >= 0),
      };
    }
    case "OPEN_ANSWER":
      return { acceptedAnswers: options.acceptedAnswers };
    case "ORDERING":
      return { correctOrder: options.correctOrder };
    case "MATCHING":
      return { pairs: options.pairs };
    case "SPOT_ERROR":
      return { errorIndices: options.errorIndices };
    case "NUMERIC_ESTIMATION":
      return { correctValue: options.correctValue, tolerance: options.tolerance };
    case "IMAGE_HOTSPOT":
      return { hotspot: options.hotspot };
    case "CODE_COMPLETION":
      return { correctAnswer: options.correctAnswer };
    default:
      return {};
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  const run = await prisma.practiceRun.findUnique({
    where: { id: runId },
    include: {
      hubQuiz: {
        select: { payloadBlob: true, suspended: true, unpublishedAt: true, questionCount: true },
      },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (run.expiresAt < new Date()) {
    return NextResponse.json({ error: "run_expired" }, { status: 410 });
  }
  if (run.completedAt) {
    return NextResponse.json({ error: "run_already_completed" }, { status: 409 });
  }
  if (!run.hubQuiz || run.hubQuiz.suspended || run.hubQuiz.unpublishedAt) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: AnswerBody;
  try {
    body = (await req.json()) as AnswerBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.order !== "number" || body.value === undefined) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // Parse manifest
  let manifest: { quiz?: { questions?: unknown[] } };
  try {
    const zip = await JSZip.loadAsync(Buffer.from(run.hubQuiz.payloadBlob));
    const mf = zip.file("manifest.json");
    if (!mf) return NextResponse.json({ error: "invalid_quiz" }, { status: 500 });
    manifest = JSON.parse(await mf.async("text")) as typeof manifest;
  } catch {
    return NextResponse.json({ error: "invalid_quiz" }, { status: 500 });
  }

  const questions = manifest.quiz?.questions ?? [];
  if (body.order < 0 || body.order >= questions.length) {
    return NextResponse.json({ error: "invalid_order" }, { status: 400 });
  }

  const question = questions[body.order] as { type: string; options: Record<string, unknown> };
  const isCorrect = checkAnswer(question.type, question.options, body.value);
  const isLast = body.order === questions.length - 1;

  // Persist answer in the run's JSON array
  const existingAnswers = Array.isArray(run.answers) ? run.answers : [];
  const newAnswers = [
    ...existingAnswers,
    { order: body.order, value: body.value, isCorrect },
  ];

  await prisma.practiceRun.update({
    where: { id: runId },
    data: { answers: newAnswers },
  });

  if (isLast) {
    await completePracticeRun(runId);
  }

  return NextResponse.json({
    isCorrect,
    correctOptions: correctOptions(question.type, question.options),
    isLast,
  });
}
