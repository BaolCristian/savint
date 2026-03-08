import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { qlzManifestSchema } from "@/lib/validators/qlz";
import JSZip from "jszip";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json(
      { error: "Invalid ZIP file" },
      { status: 400 },
    );
  }

  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) {
    return NextResponse.json(
      { error: "Missing manifest.json in archive" },
      { status: 400 },
    );
  }

  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(await manifestFile.async("text"));
  } catch {
    return NextResponse.json(
      { error: "Invalid manifest.json" },
      { status: 400 },
    );
  }

  const parsed = qlzManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid manifest", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const manifest = parsed.data;

  const quiz = await prisma.quiz.create({
    data: {
      title: manifest.quiz.title,
      description: manifest.quiz.description,
      tags: manifest.quiz.tags,
      authorId: session.user.id,
      questions: {
        create: manifest.quiz.questions.map((q, i) => ({
          type: q.type,
          text: q.text,
          timeLimit: q.timeLimit,
          points: q.points,
          order: i,
          options: q.options,
          mediaUrl: null,
        })),
      },
    },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  // Extract images from ZIP and update question mediaUrl
  for (let i = 0; i < manifest.quiz.questions.length; i++) {
    const q = manifest.quiz.questions[i];
    if (!q.image) continue;

    const imageFile = zip.file(q.image);
    if (!imageFile) continue;

    const ext = (q.image.split(".").pop() ?? "png").replace(/[^a-zA-Z0-9]/g, "");
    const dir = join(process.cwd(), "public", "uploads", "quiz", quiz.id);
    const filename = `q${i}.${ext}`;
    const filePath = join(dir, filename);

    await mkdir(dir, { recursive: true });
    const buffer = await imageFile.async("nodebuffer");
    await writeFile(filePath, buffer);

    const mediaUrl = `/uploads/quiz/${quiz.id}/${filename}`;
    await prisma.question.update({
      where: { id: quiz.questions[i].id },
      data: { mediaUrl },
    });
  }

  return NextResponse.json(
    { id: quiz.id, title: quiz.title },
    { status: 201 },
  );
}
