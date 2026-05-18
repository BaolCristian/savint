/**
 * In-memory sliding-window rate limiter (Plan 2).
 *
 * Plan 5 swaps the implementation to a Postgres-backed `HubRateLimit` table
 * (spec Section 9) while KEEPING this exact function signature and module path.
 *
 * Signature pinned by docs/superpowers/plans/2026-05-17-savint-hub-00-integration-contract.md §3.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface HubRateLimitArgs {
  key: string;
  windowSeconds: number;
  max: number;
}

export interface HubRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export async function hubRateLimit(args: HubRateLimitArgs): Promise<HubRateLimitResult> {
  const { key, windowSeconds, max } = args;
  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }
  if (bucket.count >= max) {
    const retryAfterMs = windowMs - (now - bucket.windowStart);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }
  bucket.count += 1;
  return { allowed: true };
}

export function _resetForTests() {
  buckets.clear();
}

// Limits from spec Section 9 (converted to windowSeconds + max).
export const HUB_LIMITS = {
  REGISTER: { windowSeconds: 3600, max: 5 },        // 5/hour
  LOGIN_PASSWORD: { windowSeconds: 3600, max: 10 }, // 10/hour
  FORGOT_PASSWORD: { windowSeconds: 3600, max: 5 }, // 5/hour
} as const;
