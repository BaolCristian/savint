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

export function middleware(req: NextRequest) {
  if (isHubMode()) return NextResponse.next();
  const pathname = req.nextUrl.pathname;
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
