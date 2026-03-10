import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { join } from "path";

export async function GET() {
  const dir = join(process.cwd(), "public", "emoticons");
  try {
    const files = await readdir(dir);
    const emoticons = files
      .filter((f) => /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(f))
      .sort()
      .map((f) => `/emoticons/${f}`);
    return NextResponse.json(emoticons);
  } catch {
    return NextResponse.json([]);
  }
}
