/**
 * DB-backed fixed-window rate limiter using the HubRateLimit table.
 *
 * Each window is identified by (key, windowStart). Within a window, requests
 * are counted atomically via upsert + increment. When count exceeds max, the
 * request is denied.
 *
 * Probabilistic cleanup (10% chance per call) removes expired windows to
 * prevent unbounded table growth.
 */

import { prisma } from "@/lib/db/client";

export interface RateLimitArgs {
  key: string;
  windowSeconds: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * Rounds a Date down to the nearest window boundary.
 */
function windowStart(date: Date, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(date.getTime() / windowMs) * windowMs);
}

/**
 * Check and increment the rate limit for a given key and window.
 * Returns allowed=true if the request is within the limit, false otherwise.
 */
export async function checkRateLimit(args: RateLimitArgs): Promise<RateLimitResult> {
  const { key, windowSeconds, max } = args;
  const now = new Date();
  const start = windowStart(now, windowSeconds);

  // Atomically upsert and increment count
  const record = await prisma.hubRateLimit.upsert({
    where: {
      key_windowStart: { key, windowStart: start },
    },
    create: {
      key,
      windowStart: start,
      count: 1,
    },
    update: {
      count: { increment: 1 },
    },
  });

  // Probabilistic cleanup: 10% chance
  if (Math.random() < 0.1) {
    const cutoff = new Date(now.getTime() - windowSeconds * 1000);
    await prisma.hubRateLimit.deleteMany({
      where: { windowStart: { lt: cutoff } },
    });
  }

  if (record.count > max) {
    const windowEndMs = start.getTime() + windowSeconds * 1000;
    const retryAfterMs = windowEndMs - now.getTime();
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  return { allowed: true };
}

/**
 * Delete all HubRateLimit rows. Used in tests to reset state.
 */
export async function resetRateLimits(): Promise<void> {
  await prisma.hubRateLimit.deleteMany();
}
