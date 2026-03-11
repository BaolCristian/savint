import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import crypto from "crypto";

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const EXT_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File))
    return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!ALLOWED_TYPES.has(file.type))
    return NextResponse.json(
      { error: "Invalid file type. Allowed: png, jpeg, gif, webp" },
      { status: 400 },
    );

  if (file.size > MAX_SIZE)
    return NextResponse.json(
      { error: "File too large. Maximum size is 5MB" },
      { status: 400 },
    );

  const quizId = formData.get("quizId");
  const folder = typeof quizId === "string" && quizId && /^[a-zA-Z0-9_-]+$/.test(quizId)
    ? quizId
    : "temp";
  const ext = EXT_MAP[file.type];
  const filename = `${crypto.randomUUID()}.${ext}`;

  const relativeDir = join("uploads", "quiz", folder);
  const baseDir = process.env.APP_ROOT || process.cwd();
  const absoluteDir = join(baseDir, "public", relativeDir);

  await mkdir(absoluteDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(absoluteDir, filename), buffer);

  // Return API-served URL so it works after build (Next.js doesn't serve
  // files added to public/ at runtime) and with basePath.
  const url = `/api/uploads/quiz/${folder}/${filename}`;

  return NextResponse.json({ url }, { status: 201 });
}
