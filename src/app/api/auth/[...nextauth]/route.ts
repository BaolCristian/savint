import { handlers } from "@/lib/auth/config";
import { NextRequest } from "next/server";

const basePath = "/savint";

// Next.js strips basePath from request URL, but NextAuth v5 needs it to parse actions.
// Re-inject basePath into the URL before passing to NextAuth handlers.
function rewriteRequest(req: NextRequest) {
  const { headers, nextUrl: { protocol, host, pathname, search } } = req;
  const detectedHost = headers.get("x-forwarded-host") ?? host;
  const detectedProtocol = headers.get("x-forwarded-proto") ?? protocol;
  const _protocol = `${detectedProtocol.replace(/:$/, "")}:`;
  const url = new URL(`${_protocol}//${detectedHost}${basePath}${pathname}${search}`);
  return new NextRequest(url, req);
}

export const GET = async (req: NextRequest) => {
  const cookieNames = req.cookies.getAll().map(c => c.name);
  console.log("[AUTH DEBUG] GET", req.nextUrl.pathname, "cookies:", cookieNames);
  const rewritten = rewriteRequest(req);
  console.log("[AUTH DEBUG] rewritten url:", rewritten.url);
  const response = await handlers.GET(rewritten);
  // Log Set-Cookie headers from the response
  const setCookies = response.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    console.log("[AUTH DEBUG] GET response Set-Cookie:", setCookies.map(c => c.split("=")[0]));
  }
  return response;
};

export const POST = async (req: NextRequest) => {
  const cookieNames = req.cookies.getAll().map(c => c.name);
  console.log("[AUTH DEBUG] POST", req.nextUrl.pathname, "cookies:", cookieNames);
  const response = await handlers.POST(rewriteRequest(req));
  // Log Set-Cookie headers from the response
  const setCookies = response.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    console.log("[AUTH DEBUG] POST response Set-Cookie:", setCookies.map(c => c.split("=")[0]));
  }
  return response;
};
