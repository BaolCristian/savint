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

export const GET = async (req: NextRequest) => handlers.GET(rewriteRequest(req));

export const POST = async (req: NextRequest) => handlers.POST(rewriteRequest(req));
