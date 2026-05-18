import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { hubRateLimit } from "@/lib/rate-limit/hub-rate-limit";
import { createPracticeRun } from "@/lib/hub/practice-run";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";

  const rl = await hubRateLimit({
    key: `practice-start:${ip}`,
    windowSeconds: 60,
    max: 5,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429 },
    );
  }

  let body: { quizId: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.quizId) {
    return NextResponse.json({ error: "missing_quiz_id" }, { status: 400 });
  }

  const quiz = await prisma.hubQuiz.findUnique({
    where: { id: body.quizId },
  });

  if (!quiz || quiz.suspended || quiz.unpublishedAt) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const run = await createPracticeRun(quiz.id, ip);

  return NextResponse.json({ runId: run.id }, { status: 201 });
}
