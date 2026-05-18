import JSZip from "jszip";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, extname } from "path";
import { createHash } from "crypto";
import type { QlzManifest } from "@/lib/validators/qlz";
import type { Quiz, Question } from "@prisma/client";

export async function buildQlz(
  quiz: Quiz & { questions: Question[] },
): Promise<{ buffer: Buffer; payloadHash: string }> {
  const zip = new JSZip();
  zip.folder("assets");
  const questionsManifest: QlzManifest["quiz"]["questions"] = [];

  for (let i = 0; i < quiz.questions.length; i++) {
    const q = quiz.questions[i];
    let imagePath: string | undefined;

    if (q.mediaUrl) {
      const ext = extname(q.mediaUrl).slice(1) || "bin";
      const assetName = `assets/q${i}.${ext}`;
      try {
        let buffer: Buffer;
        if (q.mediaUrl.startsWith("/uploads/")) {
          const filePath = join(process.cwd(), "public", q.mediaUrl);
          if (!existsSync(filePath)) throw new Error("not_found");
          buffer = await readFile(filePath);
        } else if (q.mediaUrl.startsWith("http")) {
          const r = await fetch(q.mediaUrl);
          if (!r.ok) throw new Error("fetch_failed");
          buffer = Buffer.from(await r.arrayBuffer());
        } else {
          throw new Error("unsupported");
        }
        zip.file(assetName, buffer);
        imagePath = assetName;
      } catch {
        /* skip image */
      }
    }

    questionsManifest.push({
      type: q.type as QlzManifest["quiz"]["questions"][number]["type"],
      text: q.text,
      ...(imagePath ? { image: imagePath } : {}),
      timeLimit: q.timeLimit,
      points: q.points,
      confidenceEnabled: q.confidenceEnabled,
      options: q.options as QlzManifest["quiz"]["questions"][number]["options"],
    });
  }

  const manifest: QlzManifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    quiz: {
      title: quiz.title,
      ...(quiz.description ? { description: quiz.description } : {}),
      tags: (quiz.tags as string[]) ?? [],
      questions: questionsManifest,
    },
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const payloadHash = createHash("sha256").update(buffer).digest("hex");
  return { buffer, payloadHash };
}
