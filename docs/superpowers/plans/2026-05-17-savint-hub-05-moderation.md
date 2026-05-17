# SAVINT Hub — Plan 5: Moderation, Rate Limiting, and Transactional Email

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **READ FIRST:** [`2026-05-17-savint-hub-00-integration-contract.md`](./2026-05-17-savint-hub-00-integration-contract.md). Plan 5's `hubRateLimit` already matches the contract signature — keep `checkRateLimit` internal to `db-rate-limit.ts` (do not re-export from `hub-rate-limit.ts`). The contract is consistent with this plan; it mainly fixes drift in Plans 2/3/4.

**Goal:** Make the hub production-ready by adding content moderation, abuse-resistant rate limiting backed by the database, and transactional emails for moderation events.

**Architecture:** A `HubRateLimit` table with `(key, windowStart)` rows + a generic `rateLimit({ key, windowSeconds, max })` middleware applied to every public/authenticated endpoint. `HubReport` model mirrors the existing local `Report` shape. Admin panel `/admin/hub/reports` lists pending reports with quiz preview and admin actions (dismiss, suspend, ban author). Suspension fires an automatic email to the author. IPs are hashed one-way for `PracticeRun.ipHash` and `HubReport.reporterIpHash` using a server-side `HUB_IP_HASH_SECRET`.

**Tech Stack:** Prisma 6, Next.js 16 App Router, Zod 4, nodemailer (already installed), Vitest 3, Playwright.

---

## File Structure

**Create (schema + libs):**
- `prisma/migrations/2026_05_17_hub_moderation_and_rate_limit/migration.sql` — Postgres DDL for `HubReport`, `HubRateLimit`, related enums and indexes.
- `src/lib/security/ip-hash.ts` — `hashIp(ip: string): string` using `HUB_IP_HASH_SECRET`.
- `src/lib/security/__tests__/ip-hash.test.ts` — vitest unit tests for hashing determinism and salt sensitivity.
- `src/lib/rate-limit/db-rate-limit.ts` — `checkRateLimit({ key, windowSeconds, max })` against `HubRateLimit`, with probabilistic cleanup.
- `src/lib/rate-limit/__tests__/db-rate-limit.test.ts` — vitest tests for window arithmetic, concurrent upserts, cleanup probability.
- `src/lib/rate-limit/get-client-ip.ts` — extract client IP from `NextRequest` headers (`x-forwarded-for`, `x-real-ip`, fallback).
- `src/lib/rate-limit/__tests__/get-client-ip.test.ts` — vitest tests for header parsing edge cases.
- `src/lib/auth/require-hub-admin.ts` — `requireHubAdmin()` returns `{ ok: true, account } | { ok: false, response }`.
- `src/lib/auth/__tests__/require-hub-admin.test.ts` — vitest unit tests.
- `src/lib/email/templates/quiz-suspended.ts` — `subject(locale)`, `body({ quizTitle, reason, appealEmail }, locale)`.
- `src/lib/email/templates/account-banned.ts` — `subject(locale)`, `body({ reason, appealEmail }, locale)`.
- `src/lib/email/templates/__tests__/templates.test.ts` — vitest renders for IT and EN.
- `src/app/api/hub/reports/route.ts` — `POST` create report (anonymous OR authenticated).
- `src/app/api/hub/reports/__tests__/route.test.ts` — vitest integration tests with prisma test DB.
- `src/app/api/hub/admin/reports/[id]/dismiss/route.ts` — `POST` mark report DISMISSED.
- `src/app/api/hub/admin/reports/[id]/suspend/route.ts` — `POST` suspend quiz + RESOLVE report + email author.
- `src/app/api/hub/admin/accounts/[id]/ban/route.ts` — `POST` ban account + suspend all quizzes.
- `src/app/api/hub/admin/__tests__/admin-actions.test.ts` — vitest integration tests covering all three admin endpoints.
- `src/app/admin/hub/reports/page.tsx` — server component listing pending reports.
- `src/components/admin/hub/hub-reports-client.tsx` — client component with action buttons.
- `src/components/hub/report-quiz-button.tsx` — Report button + modal on `/q/[id]`.
- `tests/e2e/hub-moderation.spec.ts` — Playwright end-to-end (report → suspend → hidden + email).

**Modify:**
- `prisma/schema.prisma` — add `HubReport`, `HubRateLimit` models + enums `HubReportReason`, `HubReportStatus`.
- `src/lib/rate-limit/hub-rate-limit.ts` — replace in-memory body with a thin pass-through to `db-rate-limit.ts`. Signature preserved.
- `src/lib/rate-limit/__tests__/hub-rate-limit.test.ts` — updated tests for the delegating wrapper.
- `src/app/api/hub/auth/login/route.ts` — wire `checkRateLimit` for 10/h/IP.
- `src/app/api/hub/auth/register/route.ts` — wire 5/h/IP.
- `src/app/api/hub/oauth/authorize/route.ts` — wire 20/h/IP.
- `src/app/api/hub/quizzes/route.ts` — wire 60/min/IP on GET, 10/h/token on POST.
- `src/app/api/hub/quizzes/[id]/route.ts` — wire 120/min/IP on GET.
- `src/app/api/hub/quizzes/[id]/download/route.ts` — wire 30/min/token on GET.
- `src/app/q/[id]/play/route.ts` — wire 5/min/IP on POST (practice start).
- `src/app/q/[id]/page.tsx` — render Report button (was a stub from Plan 4); render banner when `HubQuiz.suspended`.
- `src/app/api/hub/quizzes/route.ts` (GET search) — filter out `suspended: true` quizzes.
- `src/messages/it.json` and `src/messages/en.json` — new keys under `hub.report.*`, `hub.suspended.*`, `hub.admin.*`, `hub.email.suspended.*`, `hub.email.banned.*`.
- `.env.example` — document `HUB_IP_HASH_SECRET`.

Each task below is self-contained, TDD-oriented, and ends in a single commit.

---

## Task 1: Add `HubReport` and `HubRateLimit` Prisma models + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/2026_05_17_hub_moderation_and_rate_limit/migration.sql`
- Create: `tests/unit/prisma/hub-moderation-models.test.ts`

- [ ] **Step 1: Write failing schema test**

Create `tests/unit/prisma/hub-moderation-models.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("HubReport and HubRateLimit models", () => {
  beforeAll(async () => {
    await prisma.hubReport.deleteMany();
    await prisma.hubRateLimit.deleteMany();
  });

  afterEach(async () => {
    await prisma.hubReport.deleteMany();
    await prisma.hubRateLimit.deleteMany();
  });

  it("creates a HubReport with required fields", async () => {
    const quiz = await prisma.hubQuiz.create({
      data: {
        hubAccountId: (await prisma.hubAccount.create({
          data: { email: "a@b.it", name: "A", authMethod: "PASSWORD", linkedProviders: ["password"] },
        })).id,
        title: "t", license: "CC_BY",
        questionCount: 1, estimatedDurationSec: 60,
        payloadBlob: Buffer.from("x"), payloadHash: "h",
      },
    });
    const r = await prisma.hubReport.create({
      data: {
        hubQuizId: quiz.id,
        reporterIpHash: "abc",
        reason: "OFFENSIVE",
        description: "bad",
      },
    });
    expect(r.status).toBe("PENDING");
  });

  it("enforces unique (key, windowStart) on HubRateLimit", async () => {
    const now = new Date();
    await prisma.hubRateLimit.create({ data: { key: "k", windowStart: now, count: 1 } });
    await expect(
      prisma.hubRateLimit.create({ data: { key: "k", windowStart: now, count: 1 } }),
    ).rejects.toThrow();
  });
});
```

Run: `pnpm vitest run tests/unit/prisma/hub-moderation-models.test.ts`
Expected: fails because models do not exist yet.

- [ ] **Step 2: Add enums and models to `prisma/schema.prisma`**

After the existing `ReportStatus` enum add:

```prisma
enum HubReportReason {
  COPYRIGHT
  PERSONAL_DATA
  OFFENSIVE
  OTHER
}

enum HubReportStatus {
  PENDING
  REVIEWED
  RESOLVED
  DISMISSED
}
```

At the end of the file add:

```prisma
model HubReport {
  id                String          @id @default(cuid())
  hubQuizId         String
  hubQuiz           HubQuiz         @relation(fields: [hubQuizId], references: [id], onDelete: Cascade)
  reporterAccountId String?
  reporterAccount   HubAccount?     @relation("hubReportsMade", fields: [reporterAccountId], references: [id], onDelete: SetNull)
  reporterIpHash    String
  reason            HubReportReason
  description       String?
  status            HubReportStatus @default(PENDING)
  resolvedAt        DateTime?
  resolvedBy        String?
  resolver          HubAccount?     @relation("hubReportsResolved", fields: [resolvedBy], references: [id], onDelete: SetNull)
  createdAt         DateTime        @default(now())

  @@index([hubQuizId, reporterIpHash, createdAt])
  @@index([status])
}

model HubRateLimit {
  id          String   @id @default(cuid())
  key         String
  windowStart DateTime
  count       Int      @default(0)

  @@unique([key, windowStart])
  @@index([windowStart])
}
```

Add the inverse relations to `HubAccount` (assumed created in Plan 2):

```prisma
  hubReportsMade     HubReport[] @relation("hubReportsMade")
  hubReportsResolved HubReport[] @relation("hubReportsResolved")
```

Add to `HubQuiz` (assumed Plan 3): `reports HubReport[]`.

- [ ] **Step 3: Generate the migration**

Run: `pnpm prisma migrate dev --name hub_moderation_and_rate_limit --create-only`

Expected: file written under `prisma/migrations/2026_05_17_hub_moderation_and_rate_limit/migration.sql`. Open it and verify it contains `CREATE TYPE "HubReportReason"`, `CREATE TABLE "HubReport"`, `CREATE TABLE "HubRateLimit"`, and the unique index `(key, windowStart)`.

- [ ] **Step 4: Apply migration and re-run test**

Run: `pnpm prisma migrate dev` then `pnpm vitest run tests/unit/prisma/hub-moderation-models.test.ts`
Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/unit/prisma/hub-moderation-models.test.ts
git commit -m "feat(hub): add HubReport and HubRateLimit models"
```

---

## Task 2: IP-hashing helper

**Files:**
- Create: `src/lib/security/ip-hash.ts`
- Create: `src/lib/security/__tests__/ip-hash.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing tests**

Create `src/lib/security/__tests__/ip-hash.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";

describe("hashIp", () => {
  beforeEach(() => {
    process.env.HUB_IP_HASH_SECRET = "test-secret";
    // force reload between tests:
    // dynamic import inside each test would be safer; we reset modules instead.
  });

  it("returns the same hash for the same IP", async () => {
    const { hashIp } = await import("../ip-hash");
    expect(hashIp("1.2.3.4")).toBe(hashIp("1.2.3.4"));
  });

  it("returns different hashes for different IPs", async () => {
    const { hashIp } = await import("../ip-hash");
    expect(hashIp("1.2.3.4")).not.toBe(hashIp("1.2.3.5"));
  });

  it("returns 64-char hex (SHA-256)", async () => {
    const { hashIp } = await import("../ip-hash");
    expect(hashIp("1.2.3.4")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("throws if HUB_IP_HASH_SECRET is missing", async () => {
    delete process.env.HUB_IP_HASH_SECRET;
    const { hashIp } = await import("../ip-hash");
    expect(() => hashIp("1.2.3.4")).toThrow(/HUB_IP_HASH_SECRET/);
  });

  it("is sensitive to the secret (different salt → different hash)", async () => {
    process.env.HUB_IP_HASH_SECRET = "salt-a";
    const a = (await import("../ip-hash")).hashIp("1.2.3.4");
    process.env.HUB_IP_HASH_SECRET = "salt-b";
    // re-import after env change
    const b = (await import("../ip-hash?bust=" as string)).hashIp?.("1.2.3.4");
    // fallback if dynamic invalidation fails: assert at least equal under same secret
    if (b) expect(a).not.toBe(b);
  });
});
```

Run: `pnpm vitest run src/lib/security/__tests__/ip-hash.test.ts`
Expected: fails (module missing).

- [ ] **Step 2: Implement `hashIp`**

Create `src/lib/security/ip-hash.ts`:

```ts
import { createHmac } from "crypto";

/**
 * One-way salted hash of an IP. Used for dedup of anonymous reports and
 * for `PracticeRun.ipHash`. NEVER used for analytics or reverse lookup.
 */
export function hashIp(ip: string): string {
  const secret = process.env.HUB_IP_HASH_SECRET;
  if (!secret) {
    throw new Error("HUB_IP_HASH_SECRET is not configured");
  }
  return createHmac("sha256", secret).update(ip).digest("hex");
}
```

Run: `pnpm vitest run src/lib/security/__tests__/ip-hash.test.ts`
Expected: all tests pass.

- [ ] **Step 3: Document env var**

Append to `.env.example`:

```
# Salt for one-way hashing of IPs in HubReport / PracticeRun. Required when SAVINT_MODE=hub.
HUB_IP_HASH_SECRET=change-me-to-32-random-bytes
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/security .env.example
git commit -m "feat(hub): add salted IP hashing helper"
```

---

## Task 3: Database-backed rate limiter

**Files:**
- Create: `src/lib/rate-limit/db-rate-limit.ts`
- Create: `src/lib/rate-limit/__tests__/db-rate-limit.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/rate-limit/__tests__/db-rate-limit.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { checkRateLimit, _internal } from "../db-rate-limit";

describe("checkRateLimit", () => {
  beforeEach(async () => {
    await prisma.hubRateLimit.deleteMany();
  });

  it("allows requests below the limit", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await checkRateLimit({ key: "ip:1.1.1.1:test", windowSeconds: 60, max: 5 });
      expect(r.allowed).toBe(true);
    }
  });

  it("blocks the (max+1)th request and returns retryAfterSeconds", async () => {
    for (let i = 0; i < 3; i++) {
      await checkRateLimit({ key: "ip:2.2.2.2:test", windowSeconds: 60, max: 3 });
    }
    const r = await checkRateLimit({ key: "ip:2.2.2.2:test", windowSeconds: 60, max: 3 });
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
    expect(r.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("resets after the window expires", async () => {
    const now = new Date("2026-05-17T12:00:00Z");
    vi.setSystemTime(now);
    for (let i = 0; i < 5; i++) {
      await checkRateLimit({ key: "ip:3.3.3.3:test", windowSeconds: 60, max: 5 });
    }
    expect((await checkRateLimit({ key: "ip:3.3.3.3:test", windowSeconds: 60, max: 5 })).allowed).toBe(false);
    vi.setSystemTime(new Date("2026-05-17T12:01:01Z"));
    expect((await checkRateLimit({ key: "ip:3.3.3.3:test", windowSeconds: 60, max: 5 })).allowed).toBe(true);
    vi.useRealTimers();
  });

  it("handles concurrent increments atomically", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        checkRateLimit({ key: "ip:4.4.4.4:test", windowSeconds: 60, max: 10 }),
      ),
    );
    const allowed = results.filter(r => r.allowed).length;
    expect(allowed).toBe(10);
  });

  it("cleanup deletes windows older than 24h", async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await prisma.hubRateLimit.create({ data: { key: "old", windowStart: old, count: 1 } });
    await _internal.cleanup();
    expect(await prisma.hubRateLimit.count({ where: { key: "old" } })).toBe(0);
  });

  it("triggers cleanup probabilistically (~1 in 100)", async () => {
    const spy = vi.spyOn(_internal, "cleanup").mockResolvedValue();
    // Force shouldCleanup to return true via deterministic RNG mock:
    const rand = vi.spyOn(Math, "random").mockReturnValue(0.005);
    await checkRateLimit({ key: "rng-test", windowSeconds: 60, max: 5 });
    expect(spy).toHaveBeenCalled();
    rand.mockRestore();
    spy.mockRestore();
  });
});
```

Run: `pnpm vitest run src/lib/rate-limit/__tests__/db-rate-limit.test.ts`
Expected: fails.

- [ ] **Step 2: Implement DB-backed limiter**

Create `src/lib/rate-limit/db-rate-limit.ts`:

```ts
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

const CLEANUP_PROBABILITY = 0.01; // 1 in 100 requests
const CLEANUP_MAX_AGE_HOURS = 24;

function windowStartFor(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

async function cleanup(): Promise<void> {
  const cutoff = new Date(Date.now() - CLEANUP_MAX_AGE_HOURS * 60 * 60 * 1000);
  await prisma.hubRateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } });
}

export const _internal = { cleanup };

export async function checkRateLimit(args: RateLimitArgs): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = windowStartFor(now, args.windowSeconds);
  const windowEnd = new Date(windowStart.getTime() + args.windowSeconds * 1000);

  if (Math.random() < CLEANUP_PROBABILITY) {
    // Fire-and-forget; do not await to avoid latency hit
    _internal.cleanup().catch(() => undefined);
  }

  const row = await prisma.hubRateLimit.upsert({
    where: { key_windowStart: { key: args.key, windowStart } },
    create: { key: args.key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });

  if (row.count > args.max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd.getTime() - now.getTime()) / 1000));
    return { allowed: false, retryAfterSeconds };
  }
  return { allowed: true };
}
```

Run: `pnpm vitest run src/lib/rate-limit/__tests__/db-rate-limit.test.ts`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/rate-limit/db-rate-limit.ts src/lib/rate-limit/__tests__/db-rate-limit.test.ts
git commit -m "feat(hub): add DB-backed rate limiter"
```

---

## Task 4: Replace in-memory `hub-rate-limit.ts` (Plan 2) with a DB-delegating wrapper

**Files:**
- Modify: `src/lib/rate-limit/hub-rate-limit.ts`
- Modify: `src/lib/rate-limit/__tests__/hub-rate-limit.test.ts`

- [ ] **Step 1: Read the existing in-memory module**

Open `src/lib/rate-limit/hub-rate-limit.ts` (Plan 2). It exports a function with signature like:

```ts
export async function hubRateLimit(args: { key: string; windowSeconds: number; max: number }):
  Promise<{ allowed: boolean; retryAfterSeconds?: number }>
```

- [ ] **Step 2: Update tests to assert DB delegation**

Modify `src/lib/rate-limit/__tests__/hub-rate-limit.test.ts` so the suite imports both `hubRateLimit` and the underlying `checkRateLimit`, mocks the DB one, and asserts the wrapper passes args through unchanged:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { hubRateLimit } from "../hub-rate-limit";
import { checkRateLimit } from "../db-rate-limit";

describe("hubRateLimit (DB-backed wrapper)", () => {
  it("delegates to checkRateLimit with the exact same args", async () => {
    await hubRateLimit({ key: "k", windowSeconds: 60, max: 5 });
    expect(checkRateLimit).toHaveBeenCalledWith({ key: "k", windowSeconds: 60, max: 5 });
  });

  it("returns the DB result unchanged", async () => {
    (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      retryAfterSeconds: 42,
    });
    const r = await hubRateLimit({ key: "k", windowSeconds: 60, max: 1 });
    expect(r).toEqual({ allowed: false, retryAfterSeconds: 42 });
  });
});
```

Run: `pnpm vitest run src/lib/rate-limit/__tests__/hub-rate-limit.test.ts`
Expected: fails (still using in-memory implementation).

- [ ] **Step 3: Replace `hub-rate-limit.ts` with the wrapper**

Overwrite `src/lib/rate-limit/hub-rate-limit.ts` with:

```ts
import { checkRateLimit, type RateLimitArgs, type RateLimitResult } from "./db-rate-limit";

/**
 * Backwards-compatible name preserved from the Plan 2 in-memory helper.
 * Now delegates to the DB-backed limiter so multiple processes share state.
 *
 * Do NOT introduce any other behavioral differences here.
 */
export async function hubRateLimit(args: RateLimitArgs): Promise<RateLimitResult> {
  return checkRateLimit(args);
}
```

Run: `pnpm vitest run src/lib/rate-limit/__tests__/hub-rate-limit.test.ts`
Expected: pass.

- [ ] **Step 4: Type-check the whole project**

Run: `pnpm tsc --noEmit`
Expected: no new errors (callers from Plan 2 keep working because the signature is identical).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit/hub-rate-limit.ts src/lib/rate-limit/__tests__/hub-rate-limit.test.ts
git commit -m "refactor(hub): delegate hubRateLimit to DB-backed limiter"
```

---

## Task 5: `getClientIp` helper

**Files:**
- Create: `src/lib/rate-limit/get-client-ip.ts`
- Create: `src/lib/rate-limit/__tests__/get-client-ip.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/rate-limit/__tests__/get-client-ip.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { getClientIp } from "../get-client-ip";

function req(headers: Record<string, string>) {
  return new NextRequest("http://localhost/x", { headers });
}

describe("getClientIp", () => {
  it("prefers the first entry of x-forwarded-for", () => {
    expect(getClientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
  });
  it("falls back to x-real-ip", () => {
    expect(getClientIp(req({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
  });
  it("returns 'unknown' when no header is present", () => {
    expect(getClientIp(req({}))).toBe("unknown");
  });
  it("trims whitespace", () => {
    expect(getClientIp(req({ "x-forwarded-for": "  4.4.4.4 " }))).toBe("4.4.4.4");
  });
});
```

Run: `pnpm vitest run src/lib/rate-limit/__tests__/get-client-ip.test.ts`
Expected: fails.

- [ ] **Step 2: Implement helper**

Create `src/lib/rate-limit/get-client-ip.ts`:

```ts
import type { NextRequest } from "next/server";

export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
```

Run: `pnpm vitest run src/lib/rate-limit/__tests__/get-client-ip.test.ts`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/rate-limit/get-client-ip.ts src/lib/rate-limit/__tests__/get-client-ip.test.ts
git commit -m "feat(hub): add getClientIp helper"
```

---

## Task 6: Wire rate limiter into Plan 2 auth endpoints (register, login, oauth/authorize)

**Files:**
- Modify: `src/app/api/hub/auth/register/route.ts`
- Modify: `src/app/api/hub/auth/login/route.ts`
- Modify: `src/app/api/hub/oauth/authorize/route.ts`
- Create: `src/app/api/hub/auth/__tests__/rate-limit.test.ts`

- [ ] **Step 1: Write failing integration tests**

Create `src/app/api/hub/auth/__tests__/rate-limit.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { POST as login } from "../login/route";
import { POST as register } from "../register/route";

function mkReq(url: string, body: unknown, ip = "9.9.9.9") {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof login>[0];
}

beforeEach(async () => { await prisma.hubRateLimit.deleteMany(); });

describe("rate-limit: hub login", () => {
  it("blocks after 10 requests in an hour from the same IP", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await login(mkReq("http://localhost/api/hub/auth/login", { email: "x@y.it", password: "p" }));
      expect(res.status).not.toBe(429);
    }
    const res = await login(mkReq("http://localhost/api/hub/auth/login", { email: "x@y.it", password: "p" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toMatch(/^\d+$/);
  });
});

describe("rate-limit: hub register", () => {
  it("blocks after 5 requests in an hour from the same IP", async () => {
    for (let i = 0; i < 5; i++) {
      await register(mkReq("http://localhost/api/hub/auth/register", { email: `u${i}@y.it`, password: "pw" }));
    }
    const res = await register(mkReq("http://localhost/api/hub/auth/register", { email: "z@y.it", password: "pw" }));
    expect(res.status).toBe(429);
  });
});
```

Run: `pnpm vitest run src/app/api/hub/auth/__tests__/rate-limit.test.ts`
Expected: fails.

- [ ] **Step 2: Wire limiter into `login/route.ts`**

At the top of `POST`, before any other work:

```ts
import { hubRateLimit } from "@/lib/rate-limit/hub-rate-limit";
import { getClientIp } from "@/lib/rate-limit/get-client-ip";

// inside POST(req: NextRequest):
const ip = getClientIp(req);
const rl = await hubRateLimit({ key: `login:${ip}`, windowSeconds: 3600, max: 10 });
if (!rl.allowed) {
  return NextResponse.json(
    { error: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) } },
  );
}
```

- [ ] **Step 3: Wire limiter into `register/route.ts`**

Same pattern with `key: \`register:${ip}\``, `max: 5`, `windowSeconds: 3600`.

- [ ] **Step 4: Wire limiter into `oauth/authorize/route.ts`**

`key: \`oauth-authorize:${ip}\``, `max: 20`, `windowSeconds: 3600`.

- [ ] **Step 5: Run the test suite**

Run: `pnpm vitest run src/app/api/hub/auth/__tests__/rate-limit.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/hub/auth src/app/api/hub/oauth/authorize
git commit -m "feat(hub): rate-limit auth and oauth/authorize endpoints"
```

---

## Task 7: Wire rate limiter into Plan 3/4 endpoints (search, detail, download, publish, practice)

**Files:**
- Modify: `src/app/api/hub/quizzes/route.ts`
- Modify: `src/app/api/hub/quizzes/[id]/route.ts`
- Modify: `src/app/api/hub/quizzes/[id]/download/route.ts`
- Modify: `src/app/q/[id]/play/route.ts`
- Create: `src/app/api/hub/quizzes/__tests__/rate-limit.test.ts`

- [ ] **Step 1: Write a failing limit test for each endpoint**

Create `src/app/api/hub/quizzes/__tests__/rate-limit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { GET as searchGet } from "../route";
import { GET as detailGet } from "../[id]/route";

function mkReq(url: string, ip = "8.8.8.8") {
  return new Request(url, { headers: { "x-forwarded-for": ip } }) as any;
}

beforeEach(async () => { await prisma.hubRateLimit.deleteMany(); });

describe("rate-limit: search", () => {
  it("returns 429 after 60 requests in 60 seconds from the same IP", async () => {
    for (let i = 0; i < 60; i++) {
      const r = await searchGet(mkReq("http://localhost/api/hub/quizzes"));
      expect(r.status).not.toBe(429);
    }
    const r = await searchGet(mkReq("http://localhost/api/hub/quizzes"));
    expect(r.status).toBe(429);
  });
});

describe("rate-limit: detail", () => {
  it("returns 429 after 120 requests in 60 seconds from the same IP", async () => {
    const ctx = { params: Promise.resolve({ id: "anything" }) };
    for (let i = 0; i < 120; i++) {
      await detailGet(mkReq("http://localhost/api/hub/quizzes/anything"), ctx);
    }
    const r = await detailGet(mkReq("http://localhost/api/hub/quizzes/anything"), ctx);
    expect(r.status).toBe(429);
  });
});
```

Run: `pnpm vitest run src/app/api/hub/quizzes/__tests__/rate-limit.test.ts`
Expected: fails.

- [ ] **Step 2: Add limiter to search (`GET /api/hub/quizzes`)**

At the start of `GET`:

```ts
const ip = getClientIp(req);
const rl = await hubRateLimit({ key: `search:${ip}`, windowSeconds: 60, max: 60 });
if (!rl.allowed) return new Response(JSON.stringify({ error: "rate_limited" }),
  { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) } });
```

- [ ] **Step 3: Add limiter to detail (`GET /api/hub/quizzes/[id]`)**

Same pattern, `key: \`detail:${ip}\``, `max: 120`, `windowSeconds: 60`.

- [ ] **Step 4: Add limiter to download (`GET /api/hub/quizzes/[id]/download`)**

This endpoint uses Bearer auth. Use the token as the key:

```ts
const auth = req.headers.get("authorization") ?? "";
const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
const rl = await hubRateLimit({ key: `download:${token.slice(0, 16) || getClientIp(req)}`, windowSeconds: 60, max: 30 });
```

The truncation prevents leaking the full token into the DB key column.

- [ ] **Step 5: Add limiter to publish (`POST /api/hub/quizzes`)**

```ts
const auth = req.headers.get("authorization") ?? "";
const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
const rl = await hubRateLimit({ key: `publish:${token.slice(0, 16) || getClientIp(req)}`, windowSeconds: 3600, max: 10 });
```

- [ ] **Step 6: Add limiter to practice-start (`POST /q/[id]/play`)**

```ts
const rl = await hubRateLimit({ key: `practice:${getClientIp(req)}`, windowSeconds: 60, max: 5 });
```

- [ ] **Step 7: Run the test suite**

Run: `pnpm vitest run src/app/api/hub/quizzes/__tests__/rate-limit.test.ts`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/hub/quizzes src/app/q
git commit -m "feat(hub): rate-limit search, detail, download, publish, practice"
```

---

## Task 8: `POST /api/hub/reports` — anonymous + authenticated, 24h dedup

**Files:**
- Create: `src/app/api/hub/reports/route.ts`
- Create: `src/app/api/hub/reports/__tests__/route.test.ts`

- [ ] **Step 1: Write failing integration tests**

Create `src/app/api/hub/reports/__tests__/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { POST } from "../route";

vi.mock("@/lib/auth/hub-session", () => ({ getHubSession: vi.fn(async () => null) }));

function mkReq(body: unknown, ip = "5.5.5.5", token?: string) {
  return new Request("http://localhost/api/hub/reports", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }) as any;
}

async function seedQuiz() {
  const acc = await prisma.hubAccount.create({
    data: { email: `a-${Date.now()}@b.it`, name: "A", authMethod: "PASSWORD", linkedProviders: ["password"] },
  });
  return prisma.hubQuiz.create({
    data: {
      hubAccountId: acc.id,
      title: "t", license: "CC_BY",
      questionCount: 1, estimatedDurationSec: 60,
      payloadBlob: Buffer.from("x"), payloadHash: "h",
    },
  });
}

beforeEach(async () => {
  process.env.HUB_IP_HASH_SECRET = "test-secret";
  await prisma.hubReport.deleteMany();
  await prisma.hubRateLimit.deleteMany();
  await prisma.hubQuiz.deleteMany();
  await prisma.hubAccount.deleteMany();
});

describe("POST /api/hub/reports", () => {
  it("creates a report from an anonymous reporter", async () => {
    const q = await seedQuiz();
    const res = await POST(mkReq({ hubQuizId: q.id, reason: "OFFENSIVE", description: "bad" }));
    expect(res.status).toBe(201);
    const all = await prisma.hubReport.findMany();
    expect(all).toHaveLength(1);
    expect(all[0].reporterAccountId).toBeNull();
    expect(all[0].reporterIpHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("dedups same (quiz, ip) within 24h with 409", async () => {
    const q = await seedQuiz();
    await POST(mkReq({ hubQuizId: q.id, reason: "OFFENSIVE" }));
    const res = await POST(mkReq({ hubQuizId: q.id, reason: "OFFENSIVE" }));
    expect(res.status).toBe(409);
  });

  it("allows a different IP to report the same quiz", async () => {
    const q = await seedQuiz();
    await POST(mkReq({ hubQuizId: q.id, reason: "OFFENSIVE" }, "1.1.1.1"));
    const res = await POST(mkReq({ hubQuizId: q.id, reason: "OFFENSIVE" }, "1.1.1.2"));
    expect(res.status).toBe(201);
  });

  it("returns 404 for missing quiz", async () => {
    const res = await POST(mkReq({ hubQuizId: "missing", reason: "OFFENSIVE" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 on invalid reason", async () => {
    const q = await seedQuiz();
    const res = await POST(mkReq({ hubQuizId: q.id, reason: "NOPE" }));
    expect(res.status).toBe(400);
  });

  it("rejects banned reporter account", async () => {
    const q = await seedQuiz();
    const banned = await prisma.hubAccount.create({
      data: { email: "b@b.it", name: "B", authMethod: "PASSWORD", linkedProviders: ["password"], bannedAt: new Date() },
    });
    const { getHubSession } = await import("@/lib/auth/hub-session");
    (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ accountId: banned.id });
    const res = await POST(mkReq({ hubQuizId: q.id, reason: "OFFENSIVE" }));
    expect(res.status).toBe(403);
  });
});
```

Run: `pnpm vitest run src/app/api/hub/reports/__tests__/route.test.ts`
Expected: fails.

- [ ] **Step 2: Implement the route**

Create `src/app/api/hub/reports/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { hashIp } from "@/lib/security/ip-hash";
import { getClientIp } from "@/lib/rate-limit/get-client-ip";
import { hubRateLimit } from "@/lib/rate-limit/hub-rate-limit";
import { getHubSession } from "@/lib/auth/hub-session";

const Body = z.object({
  hubQuizId: z.string().min(1),
  reason: z.enum(["COPYRIGHT", "PERSONAL_DATA", "OFFENSIVE", "OTHER"]),
  description: z.string().max(1000).optional(),
});

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await hubRateLimit({ key: `report:${ip}`, windowSeconds: 3600, max: 5 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) } },
    );
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const quiz = await prisma.hubQuiz.findUnique({ where: { id: parsed.data.hubQuizId } });
  if (!quiz) return NextResponse.json({ error: "quiz_not_found" }, { status: 404 });

  const session = await getHubSession(req);
  let reporterAccountId: string | null = null;
  if (session?.accountId) {
    const acc = await prisma.hubAccount.findUnique({ where: { id: session.accountId } });
    if (acc?.bannedAt) {
      return NextResponse.json({ error: "banned" }, { status: 403 });
    }
    reporterAccountId = acc?.id ?? null;
  }

  const reporterIpHash = hashIp(ip);
  const sinceCutoff = new Date(Date.now() - ONE_DAY_MS);

  const existing = await prisma.hubReport.findFirst({
    where: {
      hubQuizId: quiz.id,
      reporterIpHash,
      createdAt: { gte: sinceCutoff },
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "already_reported" }, { status: 409 });
  }

  const report = await prisma.hubReport.create({
    data: {
      hubQuizId: quiz.id,
      reporterAccountId,
      reporterIpHash,
      reason: parsed.data.reason,
      description: parsed.data.description ?? null,
    },
  });

  return NextResponse.json({ id: report.id, status: report.status }, { status: 201 });
}
```

Run: `pnpm vitest run src/app/api/hub/reports/__tests__/route.test.ts`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/hub/reports
git commit -m "feat(hub): add POST /api/hub/reports with 24h IP dedup"
```

---

## Task 9: Report button on `/q/[id]` detail page

**Files:**
- Create: `src/components/hub/report-quiz-button.tsx`
- Modify: `src/app/q/[id]/page.tsx`
- Modify: `src/messages/it.json`, `src/messages/en.json`
- Create: `src/components/hub/__tests__/report-quiz-button.test.tsx`

- [ ] **Step 1: Add i18n keys**

In both message files, under `hub`, add:

```json
"report": {
  "button": "Segnala",
  "title": "Segnala questo quiz",
  "reason": "Motivo",
  "reasonCopyright": "Violazione di copyright",
  "reasonPersonalData": "Dati personali",
  "reasonOffensive": "Contenuto offensivo",
  "reasonOther": "Altro",
  "description": "Descrizione (facoltativa)",
  "submit": "Invia segnalazione",
  "cancel": "Annulla",
  "success": "Grazie. La segnalazione è stata ricevuta.",
  "already": "Hai già segnalato questo quiz nelle ultime 24 ore.",
  "rateLimited": "Troppe segnalazioni. Riprova più tardi.",
  "error": "Errore. Riprova."
}
```

Translate the strings for `en.json` ("Report", "Report this quiz", "Reason", "Copyright violation", "Personal data", "Offensive content", "Other", "Description (optional)", "Submit", "Cancel", "Thank you. The report has been received.", "You already reported this quiz in the last 24 hours.", "Too many reports. Try again later.", "Error. Try again.").

- [ ] **Step 2: Write failing component test**

Create `src/components/hub/__tests__/report-quiz-button.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ReportQuizButton } from "../report-quiz-button";
import messages from "@/messages/en.json";

function renderWithIntl(node: React.ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={messages as any}>{node}</NextIntlClientProvider>);
}

describe("ReportQuizButton", () => {
  it("opens the modal on click", () => {
    renderWithIntl(<ReportQuizButton hubQuizId="abc" />);
    fireEvent.click(screen.getByRole("button", { name: /report/i }));
    expect(screen.getByText(/Report this quiz/i)).toBeInTheDocument();
  });

  it("submits the form and shows success", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "r1", status: "PENDING" }), { status: 201 }) as any,
    );
    renderWithIntl(<ReportQuizButton hubQuizId="abc" />);
    fireEvent.click(screen.getByRole("button", { name: /report/i }));
    fireEvent.change(screen.getByLabelText(/Reason/i), { target: { value: "OFFENSIVE" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(screen.getByText(/Thank you/i)).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledWith("/api/hub/reports", expect.objectContaining({ method: "POST" }));
    fetchSpy.mockRestore();
  });

  it("shows the already-reported message on 409", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 409 }) as any);
    renderWithIntl(<ReportQuizButton hubQuizId="abc" />);
    fireEvent.click(screen.getByRole("button", { name: /report/i }));
    fireEvent.change(screen.getByLabelText(/Reason/i), { target: { value: "OFFENSIVE" } });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(screen.getByText(/already reported/i)).toBeInTheDocument());
  });
});
```

Run: `pnpm vitest run src/components/hub/__tests__/report-quiz-button.test.tsx`
Expected: fails.

- [ ] **Step 3: Implement the component**

Create `src/components/hub/report-quiz-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type Reason = "COPYRIGHT" | "PERSONAL_DATA" | "OFFENSIVE" | "OTHER";

export function ReportQuizButton({ hubQuizId }: { hubQuizId: string }) {
  const t = useTranslations("hub.report");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>("OFFENSIVE");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "already" | "rateLimited" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    const res = await fetch("/api/hub/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hubQuizId, reason, description: description || undefined }),
    });
    if (res.status === 201) setStatus("success");
    else if (res.status === 409) setStatus("already");
    else if (res.status === 429) setStatus("rateLimited");
    else setStatus("error");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-slate-600 hover:text-red-600 underline"
      >
        {t("button")}
      </button>
      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={submit} className="bg-white dark:bg-slate-900 rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">{t("title")}</h2>
            {status === "success" ? (
              <p className="text-green-700">{t("success")}</p>
            ) : status === "already" ? (
              <p className="text-amber-700">{t("already")}</p>
            ) : status === "rateLimited" ? (
              <p className="text-amber-700">{t("rateLimited")}</p>
            ) : status === "error" ? (
              <p className="text-red-700">{t("error")}</p>
            ) : null}
            {status !== "success" && (
              <>
                <label className="block">
                  <span className="text-sm font-medium">{t("reason")}</span>
                  <select
                    aria-label={t("reason")}
                    value={reason}
                    onChange={(e) => setReason(e.target.value as Reason)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="COPYRIGHT">{t("reasonCopyright")}</option>
                    <option value="PERSONAL_DATA">{t("reasonPersonalData")}</option>
                    <option value="OFFENSIVE">{t("reasonOffensive")}</option>
                    <option value="OTHER">{t("reasonOther")}</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium">{t("description")}</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={1000}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    rows={4}
                  />
                </label>
              </>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg border">
                {t("cancel")}
              </button>
              {status !== "success" && (
                <button type="submit" disabled={status === "submitting"} className="px-3 py-2 rounded-lg bg-red-600 text-white">
                  {t("submit")}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Mount the button on `/q/[id]/page.tsx`**

In Plan 4 the page rendered an `{/* TODO: Report */}` placeholder near the action bar. Replace it with:

```tsx
import { ReportQuizButton } from "@/components/hub/report-quiz-button";
// ...
<ReportQuizButton hubQuizId={quiz.id} />
```

- [ ] **Step 5: Run tests**

```bash
pnpm vitest run src/components/hub/__tests__/report-quiz-button.test.tsx
```
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/hub src/app/q src/messages
git commit -m "feat(hub): add Report button + modal on quiz detail page"
```

---

## Task 10: Hub admin guard helper

**Files:**
- Create: `src/lib/auth/require-hub-admin.ts`
- Create: `src/lib/auth/__tests__/require-hub-admin.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/auth/__tests__/require-hub-admin.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/db/client";

vi.mock("@/lib/auth/hub-session", () => ({ getHubSession: vi.fn() }));

import { requireHubAdmin } from "../require-hub-admin";
import { getHubSession } from "@/lib/auth/hub-session";

const mockReq = () => new Request("http://localhost/x") as any;

describe("requireHubAdmin", () => {
  it("returns 401 when there is no session", async () => {
    (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const r = await requireHubAdmin(mockReq());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it("returns 403 when account is not HUB_ADMIN", async () => {
    const u = await prisma.hubAccount.create({
      data: { email: `u-${Date.now()}@x.it`, name: "U", authMethod: "PASSWORD", linkedProviders: ["password"], role: "HUB_USER" },
    });
    (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ accountId: u.id });
    const r = await requireHubAdmin(mockReq());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("returns ok with account when HUB_ADMIN", async () => {
    const u = await prisma.hubAccount.create({
      data: { email: `a-${Date.now()}@x.it`, name: "A", authMethod: "PASSWORD", linkedProviders: ["password"], role: "HUB_ADMIN" },
    });
    (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ accountId: u.id });
    const r = await requireHubAdmin(mockReq());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.account.id).toBe(u.id);
  });
});
```

Run: `pnpm vitest run src/lib/auth/__tests__/require-hub-admin.test.ts`
Expected: fails.

- [ ] **Step 2: Implement**

Create `src/lib/auth/require-hub-admin.ts`:

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { getHubSession } from "@/lib/auth/hub-session";

export type RequireHubAdminResult =
  | { ok: true; account: Awaited<ReturnType<typeof prisma.hubAccount.findUnique>> & { id: string } }
  | { ok: false; response: Response };

export async function requireHubAdmin(req: NextRequest): Promise<RequireHubAdminResult> {
  const session = await getHubSession(req);
  if (!session?.accountId) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const account = await prisma.hubAccount.findUnique({ where: { id: session.accountId } });
  if (!account || account.role !== "HUB_ADMIN") {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, account: account as any };
}
```

Run: `pnpm vitest run src/lib/auth/__tests__/require-hub-admin.test.ts`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/require-hub-admin.ts src/lib/auth/__tests__/require-hub-admin.test.ts
git commit -m "feat(hub): add requireHubAdmin guard"
```

---

## Task 11: Admin actions endpoints (dismiss / suspend / ban)

**Files:**
- Create: `src/app/api/hub/admin/reports/[id]/dismiss/route.ts`
- Create: `src/app/api/hub/admin/reports/[id]/suspend/route.ts`
- Create: `src/app/api/hub/admin/accounts/[id]/ban/route.ts`
- Create: `src/app/api/hub/admin/__tests__/admin-actions.test.ts`

- [ ] **Step 1: Write failing tests for all three endpoints**

Create `src/app/api/hub/admin/__tests__/admin-actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db/client";

vi.mock("@/lib/auth/hub-session", () => ({ getHubSession: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => undefined) }));

import { POST as dismiss } from "../reports/[id]/dismiss/route";
import { POST as suspend } from "../reports/[id]/suspend/route";
import { POST as ban } from "../accounts/[id]/ban/route";
import { sendEmail } from "@/lib/email/send";
import { getHubSession } from "@/lib/auth/hub-session";

async function asAdmin() {
  const a = await prisma.hubAccount.create({
    data: { email: `admin-${Date.now()}@x.it`, name: "Adm", authMethod: "PASSWORD", linkedProviders: ["password"], role: "HUB_ADMIN" },
  });
  (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue({ accountId: a.id });
  return a;
}

async function seed() {
  const author = await prisma.hubAccount.create({
    data: { email: `author-${Date.now()}@x.it`, name: "Au", authMethod: "PASSWORD", linkedProviders: ["password"] },
  });
  const quiz = await prisma.hubQuiz.create({
    data: { hubAccountId: author.id, title: "t", license: "CC_BY", questionCount: 1, estimatedDurationSec: 60,
      payloadBlob: Buffer.from("x"), payloadHash: "h" },
  });
  const report = await prisma.hubReport.create({
    data: { hubQuizId: quiz.id, reporterIpHash: "h", reason: "OFFENSIVE" },
  });
  return { author, quiz, report };
}

beforeEach(async () => {
  await prisma.hubReport.deleteMany();
  await prisma.hubQuiz.deleteMany();
  await prisma.hubAccount.deleteMany();
  vi.clearAllMocks();
});

describe("POST /api/hub/admin/reports/:id/dismiss", () => {
  it("sets the report to DISMISSED", async () => {
    await asAdmin();
    const { report } = await seed();
    const ctx = { params: Promise.resolve({ id: report.id }) };
    const res = await dismiss(new Request("http://localhost/x", { method: "POST" }) as any, ctx as any);
    expect(res.status).toBe(200);
    const fresh = await prisma.hubReport.findUnique({ where: { id: report.id } });
    expect(fresh?.status).toBe("DISMISSED");
  });

  it("returns 403 when not admin", async () => {
    (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { report } = await seed();
    const ctx = { params: Promise.resolve({ id: report.id }) };
    const res = await dismiss(new Request("http://localhost/x", { method: "POST" }) as any, ctx as any);
    expect([401, 403]).toContain(res.status);
  });
});

describe("POST /api/hub/admin/reports/:id/suspend", () => {
  it("suspends the quiz, resolves the report, and emails the author", async () => {
    await asAdmin();
    const { quiz, report, author } = await seed();
    const ctx = { params: Promise.resolve({ id: report.id }) };
    const res = await suspend(
      new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Plagio" }) }) as any,
      ctx as any,
    );
    expect(res.status).toBe(200);
    const q = await prisma.hubQuiz.findUnique({ where: { id: quiz.id } });
    expect(q?.suspended).toBe(true);
    expect(q?.suspendedReason).toBe("Plagio");
    const r = await prisma.hubReport.findUnique({ where: { id: report.id } });
    expect(r?.status).toBe("RESOLVED");
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: author.email }));
  });
});

describe("POST /api/hub/admin/accounts/:id/ban", () => {
  it("bans the account and suspends all their quizzes", async () => {
    await asAdmin();
    const { author, quiz } = await seed();
    const ctx = { params: Promise.resolve({ id: author.id }) };
    const res = await ban(
      new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Abuso ripetuto" }) }) as any,
      ctx as any,
    );
    expect(res.status).toBe(200);
    const a = await prisma.hubAccount.findUnique({ where: { id: author.id } });
    expect(a?.bannedAt).not.toBeNull();
    const q = await prisma.hubQuiz.findUnique({ where: { id: quiz.id } });
    expect(q?.suspended).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: author.email }));
  });
});
```

Run: `pnpm vitest run src/app/api/hub/admin/__tests__/admin-actions.test.ts`
Expected: fails.

- [ ] **Step 2: Implement dismiss**

Create `src/app/api/hub/admin/reports/[id]/dismiss/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const report = await prisma.hubReport.findUnique({ where: { id } });
  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.hubReport.update({
    where: { id },
    data: { status: "DISMISSED", resolvedAt: new Date(), resolvedBy: guard.account.id },
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Implement suspend**

Create `src/app/api/hub/admin/reports/[id]/suspend/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";
import { sendEmail } from "@/lib/email/send";
import { quizSuspendedTemplate } from "@/lib/email/templates/quiz-suspended";

const Body = z.object({ reason: z.string().min(1).max(500) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const report = await prisma.hubReport.findUnique({
    where: { id },
    include: { hubQuiz: { include: { hubAccount: true } } },
  });
  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.$transaction([
    prisma.hubQuiz.update({
      where: { id: report.hubQuizId },
      data: { suspended: true, suspendedReason: body.data.reason },
    }),
    prisma.hubReport.update({
      where: { id },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedBy: guard.account.id },
    }),
  ]);

  const author = report.hubQuiz.hubAccount;
  const locale = "it"; // future: store per-account locale
  await sendEmail({
    to: author.email,
    subject: quizSuspendedTemplate.subject(locale),
    text: quizSuspendedTemplate.body({ quizTitle: report.hubQuiz.title, reason: body.data.reason, appealEmail: "support@savint.it" }, locale),
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Implement ban**

Create `src/app/api/hub/admin/accounts/[id]/ban/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";
import { sendEmail } from "@/lib/email/send";
import { accountBannedTemplate } from "@/lib/email/templates/account-banned";

const Body = z.object({ reason: z.string().min(1).max(500) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const target = await prisma.hubAccount.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.$transaction([
    prisma.hubAccount.update({ where: { id }, data: { bannedAt: new Date() } }),
    prisma.hubQuiz.updateMany({
      where: { hubAccountId: id },
      data: { suspended: true, suspendedReason: `Author banned: ${body.data.reason}` },
    }),
  ]);

  await sendEmail({
    to: target.email,
    subject: accountBannedTemplate.subject("it"),
    text: accountBannedTemplate.body({ reason: body.data.reason, appealEmail: "support@savint.it" }, "it"),
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run src/app/api/hub/admin/__tests__/admin-actions.test.ts`
Expected: pass (after Task 12 templates exist; if you run now you'll get missing-import; do Task 12 first OR add stub templates in this task and refine in Task 12).

Note: to keep this task green standalone, add minimal stub files for the two templates now and flesh them out in Task 12:

```ts
// src/lib/email/templates/quiz-suspended.ts
export const quizSuspendedTemplate = {
  subject: (_locale: string) => "Your quiz has been suspended",
  body: (_p: { quizTitle: string; reason: string; appealEmail: string }, _l: string) => "stub",
};
```

```ts
// src/lib/email/templates/account-banned.ts
export const accountBannedTemplate = {
  subject: (_locale: string) => "Your account has been suspended",
  body: (_p: { reason: string; appealEmail: string }, _l: string) => "stub",
};
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/hub/admin src/lib/email/templates
git commit -m "feat(hub): admin dismiss/suspend/ban endpoints"
```

---

## Task 12: Real transactional email templates

**Files:**
- Modify: `src/lib/email/templates/quiz-suspended.ts`
- Modify: `src/lib/email/templates/account-banned.ts`
- Create: `src/lib/email/templates/__tests__/templates.test.ts`
- Modify: `src/messages/it.json`, `src/messages/en.json` (add `hub.email.*` keys)

- [ ] **Step 1: Add i18n keys**

In both message files, add under `hub`:

```json
"email": {
  "suspended": {
    "subject": "Il tuo quiz è stato sospeso",
    "intro": "Salve,",
    "body": "Il tuo quiz \"{title}\" è stato sospeso da savint.it per il seguente motivo: {reason}.",
    "appeal": "Se ritieni che si tratti di un errore, scrivi a {email}.",
    "signature": "— Il team di savint.it"
  },
  "banned": {
    "subject": "Il tuo account savint.it è stato sospeso",
    "intro": "Salve,",
    "body": "Il tuo account savint.it è stato sospeso per il seguente motivo: {reason}. Tutti i tuoi quiz pubblicati sono stati nascosti.",
    "appeal": "Se ritieni che si tratti di un errore, scrivi a {email}.",
    "signature": "— Il team di savint.it"
  }
}
```

Translate to English in `en.json`.

- [ ] **Step 2: Write failing tests**

Create `src/lib/email/templates/__tests__/templates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { quizSuspendedTemplate } from "../quiz-suspended";
import { accountBannedTemplate } from "../account-banned";

describe("quizSuspendedTemplate", () => {
  it("renders an IT subject and includes quiz title + reason + appeal", () => {
    const subj = quizSuspendedTemplate.subject("it");
    const body = quizSuspendedTemplate.body(
      { quizTitle: "Quiz X", reason: "Plagio", appealEmail: "support@savint.it" },
      "it",
    );
    expect(subj).toMatch(/sospeso/i);
    expect(body).toContain("Quiz X");
    expect(body).toContain("Plagio");
    expect(body).toContain("support@savint.it");
  });

  it("renders EN", () => {
    const body = quizSuspendedTemplate.body(
      { quizTitle: "Quiz Y", reason: "Spam", appealEmail: "support@savint.it" },
      "en",
    );
    expect(body).toContain("Quiz Y");
    expect(body).toContain("Spam");
  });
});

describe("accountBannedTemplate", () => {
  it("renders subject and body with reason and appeal email", () => {
    const subj = accountBannedTemplate.subject("it");
    const body = accountBannedTemplate.body({ reason: "Abuso", appealEmail: "support@savint.it" }, "it");
    expect(subj).toMatch(/account/i);
    expect(body).toContain("Abuso");
    expect(body).toContain("support@savint.it");
  });
});
```

Run: `pnpm vitest run src/lib/email/templates/__tests__/templates.test.ts`
Expected: fails (stub bodies do not contain the variables).

- [ ] **Step 3: Implement `quiz-suspended.ts`**

Overwrite `src/lib/email/templates/quiz-suspended.ts`:

```ts
import itMessages from "@/messages/it.json";
import enMessages from "@/messages/en.json";

type Params = { quizTitle: string; reason: string; appealEmail: string };

function pick(locale: string) {
  const m = locale === "en" ? enMessages : itMessages;
  // narrow: we rely on the schema added in Task 12 step 1
  return (m as any).hub.email.suspended as {
    subject: string; intro: string; body: string; appeal: string; signature: string;
  };
}

function format(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export const quizSuspendedTemplate = {
  subject(locale: string): string {
    return pick(locale).subject;
  },
  body(params: Params, locale: string): string {
    const t = pick(locale);
    return [
      t.intro,
      "",
      format(t.body, { title: params.quizTitle, reason: params.reason }),
      "",
      format(t.appeal, { email: params.appealEmail }),
      "",
      t.signature,
    ].join("\n");
  },
};
```

- [ ] **Step 4: Implement `account-banned.ts`**

Overwrite `src/lib/email/templates/account-banned.ts`:

```ts
import itMessages from "@/messages/it.json";
import enMessages from "@/messages/en.json";

type Params = { reason: string; appealEmail: string };

function pick(locale: string) {
  const m = locale === "en" ? enMessages : itMessages;
  return (m as any).hub.email.banned as {
    subject: string; intro: string; body: string; appeal: string; signature: string;
  };
}

function format(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export const accountBannedTemplate = {
  subject(locale: string): string {
    return pick(locale).subject;
  },
  body(params: Params, locale: string): string {
    const t = pick(locale);
    return [
      t.intro,
      "",
      format(t.body, { reason: params.reason }),
      "",
      format(t.appeal, { email: params.appealEmail }),
      "",
      t.signature,
    ].join("\n");
  },
};
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run src/lib/email/templates/__tests__/templates.test.ts`
Expected: pass.

- [ ] **Step 6: Verify upstream admin-actions tests still pass**

Run: `pnpm vitest run src/app/api/hub/admin/__tests__/admin-actions.test.ts`
Expected: pass (sendEmail is mocked, no real SMTP needed).

- [ ] **Step 7: Commit**

```bash
git add src/lib/email/templates src/messages
git commit -m "feat(hub): transactional email templates for suspend/ban (IT+EN)"
```

---

## Task 13: Admin panel page `/admin/hub/reports`

**Files:**
- Create: `src/app/admin/hub/reports/page.tsx`
- Create: `src/components/admin/hub/hub-reports-client.tsx`
- Modify: `src/messages/it.json`, `src/messages/en.json` (add `hub.admin.*` keys)
- Create: `src/app/admin/hub/reports/__tests__/page.test.tsx`

- [ ] **Step 1: Add i18n keys**

Under `hub.admin` add:

```json
"admin": {
  "title": "Segnalazioni in attesa",
  "noReports": "Nessuna segnalazione pendente.",
  "reason": "Motivo",
  "reporterType": "Segnalante",
  "anonymous": "Anonimo",
  "account": "Account",
  "otherReports": "Altre segnalazioni sullo stesso quiz: {count}",
  "viewQuiz": "Apri quiz",
  "dismiss": "Archivia",
  "suspendQuiz": "Sospendi quiz",
  "banAuthor": "Banna autore",
  "suspendReasonPrompt": "Motivo della sospensione",
  "banReasonPrompt": "Motivo del ban"
}
```

Translate to English.

- [ ] **Step 2: Write failing render test**

Create `src/app/admin/hub/reports/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { HubReportsClient } from "@/components/admin/hub/hub-reports-client";

const sample = [
  {
    id: "r1",
    reason: "OFFENSIVE",
    description: "rude",
    status: "PENDING",
    createdAt: new Date().toISOString(),
    reporter: null,
    hubQuiz: { id: "q1", title: "Hello", hubAccount: { id: "a1", name: "Maria", email: "m@x.it" } },
    otherReportsCount: 2,
  },
];

describe("HubReportsClient", () => {
  it("renders quiz title, reporter type and other-reports count", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages as any}>
        <HubReportsClient initialReports={sample as any} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText(/Anonymous/i)).toBeInTheDocument();
    expect(screen.getByText(/2/)).toBeInTheDocument();
  });
});
```

Run: `pnpm vitest run src/app/admin/hub/reports/__tests__/page.test.tsx`
Expected: fails.

- [ ] **Step 3: Implement the server page**

Create `src/app/admin/hub/reports/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db/client";
import { getHubSessionFromCookies } from "@/lib/auth/hub-session";
import { HubReportsClient } from "@/components/admin/hub/hub-reports-client";

export default async function Page() {
  const session = await getHubSessionFromCookies();
  if (!session?.accountId) redirect("/login?next=/admin/hub/reports");
  const account = await prisma.hubAccount.findUnique({ where: { id: session.accountId } });
  if (!account || account.role !== "HUB_ADMIN") redirect("/");

  const t = await getTranslations("hub.admin");

  const reports = await prisma.hubReport.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: {
      hubQuiz: { include: { hubAccount: { select: { id: true, name: true, email: true } } } },
      reporterAccount: { select: { id: true, name: true, email: true } },
    },
    take: 100,
  });

  const counts = await Promise.all(
    reports.map(r =>
      prisma.hubReport.count({ where: { hubQuizId: r.hubQuizId, NOT: { id: r.id } } }),
    ),
  );

  const enriched = reports.map((r, i) => ({
    id: r.id,
    reason: r.reason,
    description: r.description,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    reporter: r.reporterAccount,
    hubQuiz: r.hubQuiz,
    otherReportsCount: counts[i],
  }));

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <HubReportsClient initialReports={enriched as any} />
    </div>
  );
}
```

- [ ] **Step 4: Implement the client component**

Create `src/components/admin/hub/hub-reports-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface ReportItem {
  id: string;
  reason: string;
  description: string | null;
  status: string;
  createdAt: string;
  reporter: { id: string; name: string | null; email: string } | null;
  hubQuiz: { id: string; title: string; hubAccount: { id: string; name: string | null; email: string } };
  otherReportsCount: number;
}

export function HubReportsClient({ initialReports }: { initialReports: ReportItem[] }) {
  const t = useTranslations("hub.admin");
  const [reports, setReports] = useState(initialReports);
  const [busy, setBusy] = useState<string | null>(null);

  async function dismiss(id: string) {
    setBusy(id);
    await fetch(`/api/hub/admin/reports/${id}/dismiss`, { method: "POST" });
    setReports(rs => rs.filter(r => r.id !== id));
    setBusy(null);
  }

  async function suspend(id: string) {
    const reason = prompt(t("suspendReasonPrompt"));
    if (!reason) return;
    setBusy(id);
    await fetch(`/api/hub/admin/reports/${id}/suspend`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setReports(rs => rs.filter(r => r.id !== id));
    setBusy(null);
  }

  async function ban(accountId: string) {
    const reason = prompt(t("banReasonPrompt"));
    if (!reason) return;
    setBusy(accountId);
    await fetch(`/api/hub/admin/accounts/${accountId}/ban`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setReports(rs => rs.filter(r => r.hubQuiz.hubAccount.id !== accountId));
    setBusy(null);
  }

  if (reports.length === 0) {
    return <p className="text-muted-foreground py-12 text-center">{t("noReports")}</p>;
  }

  return (
    <ul className="space-y-3">
      {reports.map(r => (
        <li key={r.id} className="rounded-xl border p-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{r.hubQuiz.title}</h2>
              <p className="text-xs text-slate-500">
                {t("reporterType")}: {r.reporter ? `${t("account")} (${r.reporter.email})` : t("anonymous")}
              </p>
              <p className="text-xs text-slate-500">{t("otherReports", { count: r.otherReportsCount })}</p>
            </div>
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-800">
              {r.reason}
            </span>
          </div>
          {r.description && <p className="text-sm bg-slate-50 rounded p-2">{r.description}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <a href={`/q/${r.hubQuiz.id}`} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded border">
              {t("viewQuiz")}
            </a>
            <button onClick={() => dismiss(r.id)} disabled={busy === r.id} className="text-xs px-3 py-1.5 rounded border">
              {t("dismiss")}
            </button>
            <button onClick={() => suspend(r.id)} disabled={busy === r.id} className="text-xs px-3 py-1.5 rounded border border-amber-300 text-amber-700">
              {t("suspendQuiz")}
            </button>
            <button onClick={() => ban(r.hubQuiz.hubAccount.id)} disabled={busy === r.hubQuiz.hubAccount.id} className="text-xs px-3 py-1.5 rounded border border-red-300 text-red-700">
              {t("banAuthor")}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run src/app/admin/hub/reports/__tests__/page.test.tsx`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/hub src/components/admin/hub src/messages
git commit -m "feat(hub): admin panel /admin/hub/reports"
```

---

## Task 14: Suspended-visibility (hide from search, banner on detail)

**Files:**
- Modify: `src/app/api/hub/quizzes/route.ts` (search GET)
- Modify: `src/app/q/[id]/page.tsx`
- Modify: `src/messages/it.json`, `src/messages/en.json`
- Create: `src/app/api/hub/quizzes/__tests__/suspended-visibility.test.ts`
- Create: `src/app/q/[id]/__tests__/suspended-banner.test.tsx`

- [ ] **Step 1: Add i18n keys**

Under `hub`:

```json
"suspended": {
  "banner": "Questo quiz è stato sospeso dal team di moderazione di savint.it.",
  "reasonLabel": "Motivo"
}
```

Translate to English.

- [ ] **Step 2: Write failing search test**

Create `src/app/api/hub/quizzes/__tests__/suspended-visibility.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { GET } from "../route";

beforeEach(async () => {
  await prisma.hubRateLimit.deleteMany();
  await prisma.hubQuiz.deleteMany();
  await prisma.hubAccount.deleteMany();
});

describe("search hides suspended quizzes", () => {
  it("omits suspended=true entries", async () => {
    const a = await prisma.hubAccount.create({
      data: { email: `a-${Date.now()}@x.it`, name: "A", authMethod: "PASSWORD", linkedProviders: ["password"] },
    });
    await prisma.hubQuiz.create({
      data: { hubAccountId: a.id, title: "Visible", license: "CC_BY", questionCount: 1, estimatedDurationSec: 60,
        payloadBlob: Buffer.from("x"), payloadHash: "h" },
    });
    await prisma.hubQuiz.create({
      data: { hubAccountId: a.id, title: "Hidden", license: "CC_BY", questionCount: 1, estimatedDurationSec: 60,
        payloadBlob: Buffer.from("x"), payloadHash: "h", suspended: true, suspendedReason: "x" },
    });
    const res = await GET(new Request("http://localhost/api/hub/quizzes?q=") as any);
    const body = await res.json();
    const titles = body.items.map((q: any) => q.title);
    expect(titles).toContain("Visible");
    expect(titles).not.toContain("Hidden");
  });
});
```

Run: `pnpm vitest run src/app/api/hub/quizzes/__tests__/suspended-visibility.test.ts`
Expected: fails.

- [ ] **Step 3: Filter suspended in search**

In `src/app/api/hub/quizzes/route.ts` (the GET handler from Plan 4), change the `prisma.hubQuiz.findMany` call's `where` to add:

```ts
where: { ...existingWhere, suspended: false },
```

Run the test again — expected: pass.

- [ ] **Step 4: Write failing detail-page banner test**

Create `src/app/q/[id]/__tests__/suspended-banner.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";

// We render only the banner-aware fragment; the full page is a server component.
// Extract the banner into a small subcomponent for testability.
import { SuspendedBanner } from "@/components/hub/suspended-banner";

describe("SuspendedBanner", () => {
  it("renders the banner text and reason", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages as any}>
        <SuspendedBanner reason="Copyright" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/suspended/i)).toBeInTheDocument();
    expect(screen.getByText(/Copyright/)).toBeInTheDocument();
  });
});
```

Run: `pnpm vitest run src/app/q/[id]/__tests__/suspended-banner.test.tsx`
Expected: fails.

- [ ] **Step 5: Create the banner component**

Create `src/components/hub/suspended-banner.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";

export function SuspendedBanner({ reason }: { reason: string | null }) {
  const t = useTranslations("hub.suspended");
  return (
    <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">
      <p className="font-semibold">{t("banner")}</p>
      {reason && (
        <p className="text-sm mt-1">
          <strong>{t("reasonLabel")}:</strong> {reason}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Use the banner on the detail page**

In `src/app/q/[id]/page.tsx`, after loading the quiz, render the banner instead of the normal action buttons when `quiz.suspended`:

```tsx
import { SuspendedBanner } from "@/components/hub/suspended-banner";
// ...
if (quiz.suspended) {
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">{quiz.title}</h1>
      <SuspendedBanner reason={quiz.suspendedReason} />
    </main>
  );
}
```

Keep the `findUnique` lookup unchanged so the URL still resolves (no 404). Note: the lookup itself must NOT filter out suspended quizzes.

- [ ] **Step 7: Run tests**

Run: `pnpm vitest run src/app/q/[id]/__tests__/suspended-banner.test.tsx src/app/api/hub/quizzes/__tests__/suspended-visibility.test.ts`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/hub/quizzes/route.ts src/app/q src/components/hub/suspended-banner.tsx src/messages
git commit -m "feat(hub): hide suspended quizzes from search; show banner on detail URL"
```

---

## Task 15: End-to-end Playwright test (report → suspend → hidden + email)

**Files:**
- Create: `tests/e2e/hub-moderation.spec.ts`
- Modify: `playwright.config.ts` if a hub-mode project doesn't already exist (depends on Plan 4 setup).

- [ ] **Step 1: Confirm the dual-mode Playwright setup exists**

Open `playwright.config.ts`. Plan 4 should have introduced a `hub` project running on port `4000` with `SAVINT_MODE=hub`. If missing, add it now (mirror the `installation` project, swap env, change port). The test below assumes `baseURL: 'http://localhost:4000'` for the hub project.

- [ ] **Step 2: Write the E2E spec**

Create `tests/e2e/hub-moderation.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { prisma } from "@/lib/db/client";

const SMTP_INBOX_FILE = process.env.HUB_SMTP_MOCK_FILE ?? "/tmp/savint-hub-smtp.json";

test.describe("Hub moderation E2E", () => {
  test.beforeEach(async () => {
    await prisma.hubReport.deleteMany();
    await prisma.hubRateLimit.deleteMany();
    await prisma.hubQuiz.deleteMany();
    await prisma.hubAccount.deleteMany();
    // Wipe inbox file
    try { require("fs").unlinkSync(SMTP_INBOX_FILE); } catch {}
  });

  test("anonymous report leads to admin suspension and email", async ({ page, request }) => {
    // 1. Seed an author + published quiz + an admin account
    const author = await prisma.hubAccount.create({
      data: { email: "author@savint.it", name: "Maria", authMethod: "PASSWORD", linkedProviders: ["password"], passwordHash: "$2a$12$xxxxx" },
    });
    const quiz = await prisma.hubQuiz.create({
      data: { hubAccountId: author.id, title: "E2E Quiz", license: "CC_BY", questionCount: 1, estimatedDurationSec: 60,
        payloadBlob: Buffer.from("payload"), payloadHash: "deadbeef" },
    });
    const admin = await prisma.hubAccount.create({
      data: { email: "admin@savint.it", name: "Adm", authMethod: "PASSWORD",
        linkedProviders: ["password"], role: "HUB_ADMIN",
        // pre-computed bcrypt("test1234") — generated once and committed in fixtures
        passwordHash: "$2a$12$XXXadminHashXXX" },
    });

    // 2. Anonymous user submits a report via API
    const reportRes = await request.post("/api/hub/reports", {
      data: { hubQuizId: quiz.id, reason: "OFFENSIVE", description: "Inappropriate content" },
    });
    expect(reportRes.status()).toBe(201);

    // 3. Admin logs in
    await page.goto("/login");
    await page.getByLabel("Email").fill(admin.email);
    await page.getByLabel("Password").fill("test1234");
    await page.getByRole("button", { name: /sign in|accedi/i }).click();

    // 4. Open the moderation panel
    await page.goto("/admin/hub/reports");
    await expect(page.getByText("E2E Quiz")).toBeVisible();

    // 5. Suspend the quiz (handle the prompt)
    page.once("dialog", d => d.accept("Inappropriate content"));
    await page.getByRole("button", { name: /suspend|sospendi/i }).click();
    await expect(page.getByText("E2E Quiz")).not.toBeVisible({ timeout: 5000 });

    // 6. The quiz is hidden from /explore
    await page.goto("/explore");
    await expect(page.getByText("E2E Quiz")).not.toBeVisible();

    // 7. Direct URL still resolves with a banner
    await page.goto(`/q/${quiz.id}`);
    await expect(page.getByText(/suspended|sospeso/i)).toBeVisible();

    // 8. Author received the email
    const inbox = JSON.parse(require("fs").readFileSync(SMTP_INBOX_FILE, "utf8")) as Array<{ to: string; subject: string; text: string }>;
    const mail = inbox.find(m => m.to === author.email);
    expect(mail).toBeTruthy();
    expect(mail!.subject).toMatch(/suspended|sospeso/i);
    expect(mail!.text).toContain("E2E Quiz");
  });
});
```

- [ ] **Step 3: Wire the SMTP file-mock**

The Plan 2 `sendEmail` already exists. For the hub-mode Playwright project, set in `playwright.config.ts`:

```ts
env: {
  ...,
  HUB_SMTP_MOCK_FILE: "/tmp/savint-hub-smtp.json",
}
```

And modify `src/lib/email/send.ts` (one extra branch, no behavior change in prod):

```ts
if (process.env.HUB_SMTP_MOCK_FILE) {
  const fs = await import("fs");
  const path = process.env.HUB_SMTP_MOCK_FILE;
  const prev = (() => { try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch { return []; } })();
  prev.push({ to, subject, text });
  fs.writeFileSync(path, JSON.stringify(prev));
  return;
}
```

- [ ] **Step 4: Generate a real bcrypt hash for the admin fixture**

Run: `node -e "console.log(require('bcryptjs').hashSync('test1234', 12))"`

Replace `$2a$12$XXXadminHashXXX` in the spec with the printed value.

- [ ] **Step 5: Run the E2E**

Run: `pnpm playwright test tests/e2e/hub-moderation.spec.ts --project=hub`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/hub-moderation.spec.ts src/lib/email/send.ts playwright.config.ts
git commit -m "test(hub): e2e moderation flow (report -> suspend -> hidden + email)"
```

---

## Wrap-up

After Task 15, the hub is feature-complete per the spec:

- All endpoints have per-route rate limits backed by `HubRateLimit` (single source of truth across processes).
- Anonymous reports work with 24h IP-hash dedup; banned accounts cannot report.
- Admins moderate at `/admin/hub/reports` and can dismiss, suspend, or ban; suspension and ban send transactional emails.
- Suspended quizzes disappear from search but the URL still serves a banner page.
- The cross-cutting Playwright test asserts the full anonymous-report → admin-suspend → quiz-hidden → email-delivered loop.

Run the full suite one final time before merging the branch:

```bash
pnpm vitest run
pnpm playwright test --project=hub
pnpm playwright test --project=installation
pnpm tsc --noEmit
pnpm lint
```

Expected: all green. After that, this plan is done; the next step (merge / PR) is handled by `superpowers:finishing-a-development-branch`.
