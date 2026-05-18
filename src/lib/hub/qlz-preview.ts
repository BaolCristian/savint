import JSZip from "jszip";

export interface QuestionPreview {
  order: number;
  type: string;
  text: string;
  timeLimit: number;
  points: number;
  hasMedia: boolean;
}

interface RawQuestion {
  type?: string;
  text?: string;
  timeLimit?: number;
  points?: number;
  image?: string;
}

export async function extractQuestionPreviews(payload: Buffer): Promise<QuestionPreview[]> {
  const zip = await JSZip.loadAsync(payload);
  const mf = zip.file("manifest.json");
  if (!mf) return [];
  const manifest = JSON.parse(await mf.async("text")) as {
    quiz?: { questions?: RawQuestion[] };
  };
  return (manifest.quiz?.questions ?? []).map((q, i) => ({
    order: i,
    type: q.type ?? "",
    text: q.text ?? "",
    timeLimit: q.timeLimit ?? 0,
    points: q.points ?? 0,
    hasMedia: Boolean(q.image),
  }));
}
