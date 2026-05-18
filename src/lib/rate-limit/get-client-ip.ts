/**
 * Extract the real client IP address from a Next.js Request object.
 *
 * Trust order:
 * 1. x-forwarded-for header — first entry (set by proxies/load balancers)
 * 2. x-real-ip header — set by nginx when single-proxy setups
 * 3. "unknown" — when no header is available
 */

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0];
    return first.trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}
