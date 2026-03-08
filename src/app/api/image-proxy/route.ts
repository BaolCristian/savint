import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return new NextResponse("Non autorizzato", { status: 401 });

  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("Parametro url mancante", { status: 400 });

  // Allow only pixabay domains
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("pixabay.com")) {
      return new NextResponse("Dominio non consentito", { status: 403 });
    }
  } catch {
    return new NextResponse("URL non valido", { status: 400 });
  }

  const res = await fetch(url, {
    headers: { Referer: "https://pixabay.com/" },
  });

  if (!res.ok) {
    return new NextResponse("Errore nel recupero immagine", { status: 502 });
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buffer = await res.arrayBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
