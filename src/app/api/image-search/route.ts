import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";

const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ hits: [] });

  if (!PIXABAY_API_KEY) {
    return NextResponse.json(
      { error: "PIXABAY_API_KEY non configurata nel file .env" },
      { status: 500 },
    );
  }

  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", PIXABAY_API_KEY);
  url.searchParams.set("q", q);
  url.searchParams.set("image_type", "photo");
  url.searchParams.set("per_page", "20");
  url.searchParams.set("safesearch", "true");
  url.searchParams.set("lang", "it");

  console.log("[image-search] Fetching Pixabay for:", q);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error("[image-search] Pixabay error:", err);
    return NextResponse.json({ error: "Errore nella ricerca immagini" }, { status: 502 });
  }

  const data = await res.json();
  console.log("[image-search] Got", data.hits?.length ?? 0, "results");

  const hits = (data.hits ?? []).map((item: any) => ({
    id: item.id,
    preview: item.previewURL,
    web: item.webformatURL,
    thumb: item.previewURL,
    user: item.user,
    tags: item.tags,
  }));

  return NextResponse.json({ hits });
}
