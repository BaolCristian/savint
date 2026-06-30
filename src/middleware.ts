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

export function middleware(req: NextRequest) {
  if (isHubMode()) return NextResponse.next();
  const pathname = req.nextUrl.pathname;
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
  ],
};
