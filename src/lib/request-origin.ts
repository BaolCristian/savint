/**
 * Public origin of the incoming request, honoring the reverse proxy.
 *
 * Behind nginx the app listens on an internal address (e.g. localhost:3000),
 * so `new URL(req.url).origin` yields that internal origin instead of the
 * public one. We set `X-Forwarded-Host` / `X-Forwarded-Proto` at the proxy;
 * this reads them to build the real public origin (e.g. https://savint.it).
 *
 * Falls back to the request's own origin when no proxy headers are present
 * (e.g. in unit tests or direct local access).
 */
export function publicOrigin(req: Request): string {
  const xfHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (xfHost) {
    const xfProto =
      req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    return `${xfProto}://${xfHost}`;
  }
  return new URL(req.url).origin;
}
