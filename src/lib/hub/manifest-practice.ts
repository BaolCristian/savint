import JSZip from "jszip";
import type { QuestionOptions } from "@/types";
import type { QuestionType } from "@prisma/client";

/** Shape expected by <PracticeView quiz={...}> (see practice-view.tsx). */
export interface PracticeQuizData {
  id: string;
  title: string;
  description: string | null;
  authorName: string;
  questions: {
    id: string;
    type: QuestionType;
    text: string;
    mediaUrl: string | null;
    timeLimit: number;
    points: number;
    options: QuestionOptions;
    order: number;
  }[];
}

interface ManifestQuestion {
  type: string;
  text: string;
  image?: string;
  timeLimit?: number;
  points?: number;
  options: QuestionOptions;
}

/**
 * Map the questions of a .qlz manifest to the PracticeView quiz shape.
 * Media is intentionally dropped: manifest images are ZIP assets
 * (e.g. "assets/q0.png"), not URLs the hub can serve.
 */
export function manifestToPracticeQuiz(
  manifest: { quiz?: { questions?: unknown[] } },
  meta: { id: string; title: string; description: string | null; authorName: string },
): PracticeQuizData {
  const raw = (manifest.quiz?.questions ?? []) as ManifestQuestion[];
  return {
    ...meta,
    questions: raw.map((q, i) => ({
      id: `${meta.id}-q${i}`,
      type: q.type as QuestionType,
      text: q.text,
      mediaUrl: null,
      timeLimit: q.timeLimit ?? 20,
      points: q.points ?? 1000,
      options: q.options,
      order: i,
    })),
  };
}

/** Extract and parse manifest.json from a .qlz payload blob. */
export async function loadManifest(
  payloadBlob: Uint8Array | Buffer,
): Promise<{ quiz?: { questions?: unknown[] } }> {
  const zip = await JSZip.loadAsync(Buffer.from(payloadBlob));
  const mf = zip.file("manifest.json");
  if (!mf) throw new Error("invalid_quiz");
  return JSON.parse(await mf.async("text"));
}
