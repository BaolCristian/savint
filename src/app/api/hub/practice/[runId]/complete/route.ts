import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { completePracticeRun } from "@/lib/hub/practice-run";

/**
 * Mark a practice run as completed (idempotent) and increment the quiz's
 * playsCount. Called by PracticeView when the player reaches the review
 * screen. Replaces the per-answer completion of the old practice-runner.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  const run = await prisma.practiceRun.findUnique({ where: { id: runId } });
  if (!run) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (run.expiresAt < new Date()) {
    return NextResponse.json({ error: "run_expired" }, { status: 410 });
  }

  await completePracticeRun(runId);
  return NextResponse.json({ ok: true });
}
