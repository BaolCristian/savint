import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import type { QlzManifest } from "@/lib/validators/qlz";
import JSZip from "jszip";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join, extname } from "path";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = await params;
  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  if (!quiz) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

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
          if (existsSync(filePath)) {
            buffer = await readFile(filePath);
          } else {
            throw new Error("File not found");
          }
        } else if (q.mediaUrl.startsWith("http")) {
          const res = await fetch(q.mediaUrl);
          buffer = Buffer.from(await res.arrayBuffer());
        } else {
          throw new Error("Unsupported media URL");
        }

        zip.file(assetName, buffer);
        imagePath = assetName;
      } catch {
        // Skip silently on error
      }
    }

    questionsManifest.push({
      type: q.type as QlzManifest["quiz"]["questions"][number]["type"],
      text: q.text,
      ...(imagePath ? { image: imagePath } : {}),
      timeLimit: q.timeLimit,
      points: q.points,
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

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

  const sanitizedTitle = quiz.title
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100);

  return new Response(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${sanitizedTitle}.qlz"`,
    },
  });
}
