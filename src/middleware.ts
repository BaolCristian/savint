import { NextResponse, type NextRequest } from "next/server";
import { isHubMode } from "@/lib/config/savint-mode";

const HUB_ONLY_PREFIXES = [
  "/hub-login",
  "/hub-register",
  "/hub-forgot-password",
  "/hub-reset-password",
  "/hub-account",
  "/hub-verify-email",
  "/api/hub/",
];

// Endpoints under /api/hub that the INSTALLATION serves itself: the OAuth client
// flow to link a teacher's hub account, and the local publish proxy. These must
// pass through in installation mode (the rest of /api/hub/* stays hub-only).
const INSTALLATION_API_ALLOW = [
  "/api/hub/oauth/start",
  "/api/hub/oauth/callback",
  "/api/hub/oauth/link",
  "/api/hub/quiz/", // /api/hub/quiz/[id]/publish (singular "quiz", not "quizzes")
];

/** I caricamenti privati (i formulari delle verifiche) stanno sotto
 * public/uploads/privati, nel volume dei caricamenti: la cartella `public`
 * li servirebbe a chiunque come file statici, senza login. Qui non passano
 * mai. `pathname` è già senza basePath (/savint, /demo). Il confronto è sul
 * percorso decodificato e normalizzato (".", "..", barre doppie o
 * rovesciate) e senza badare alla cassa (macOS non la distingue). */
export function percorsoPrivato(pathname: string): boolean {
  let p = pathname;
  try {
    p = decodeURIComponent(p);
  } catch {
    // Una codifica rotta: si controlla il percorso così com'è.
  }
  const segmenti: string[] = [];
  for (const s of p.replace(/\\/g, "/").split("/")) {
    if (s === "" || s === ".") continue;
    if (s === "..") segmenti.pop();
    else segmenti.push(s.toLowerCase());
  }
  return segmenti[0] === "uploads" && segmenti[1] === "privati";
}

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (percorsoPrivato(pathname)) return new NextResponse("Not Found", { status: 404 });
  if (isHubMode()) return NextResponse.next();
  if (INSTALLATION_API_ALLOW.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }
  for (const prefix of HUB_ONLY_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/") || pathname.startsWith(prefix)) {
      return new NextResponse("Not Found", { status: 404 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/hub-login/:path*",
    "/hub-register/:path*",
    "/hub-forgot-password/:path*",
    "/hub-reset-password/:path*",
    "/hub-account/:path*",
    "/hub-verify-email/:path*",
    "/api/hub/:path*",
    // Ogni percorso che nomina "uploads", in qualunque cassa: il controllo
    // vero (`percorsoPrivato`) lo fa il codice, sul percorso normalizzato.
    "/(.*[Uu][Pp][Ll][Oo][Aa][Dd][Ss].*)",
    // E ogni percorso con un carattere codificato: "/%75ploads/privati/..."
    // non nomina "uploads" per il matcher, ma il server dei file statici lo
    // decodifica e lo servirebbe.
    "/(.*%.*)",
  ],
};
