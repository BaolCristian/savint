import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { join, extname } from "path";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const relativePath = segments.join("/");

  // Prevent directory traversal
  if (relativePath.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // Try both process.cwd() and __dirname-based paths for pm2 compatibility
  const baseDir = process.env.APP_ROOT || process.cwd();
  const filePath = join(baseDir, "public", "uploads", relativePath);
  const ext = extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext];

  if (!mime) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await stat(filePath);
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
