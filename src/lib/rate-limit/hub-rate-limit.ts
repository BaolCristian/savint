/**
 * Hub rate limiter — thin wrapper around the DB-backed `checkRateLimit`.
 *
 * Signature pinned by docs/superpowers/plans/2026-05-17-savint-hub-00-integration-contract.md §3.
 * Plan 5 replaces the in-memory implementation (Plan 2) with a Postgres-backed
 * `HubRateLimit` table while KEEPING this exact function signature and module path.
 */

import { checkRateLimit, resetRateLimits } from "./db-rate-limit";
import type { RateLimitArgs, RateLimitResult } from "./db-rate-limit";

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
  return checkRateLimit(args as RateLimitArgs) as Promise<RateLimitResult>;
}

export async function _resetForTests(): Promise<void> {
  await resetRateLimits();
}

// Limits from spec Section 9 (converted to windowSeconds + max).
export const HUB_LIMITS = {
  REGISTER: { windowSeconds: 3600, max: 5 },        // 5/hour
  LOGIN_PASSWORD: { windowSeconds: 3600, max: 10 }, // 10/hour
  FORGOT_PASSWORD: { windowSeconds: 3600, max: 5 }, // 5/hour
} as const;
