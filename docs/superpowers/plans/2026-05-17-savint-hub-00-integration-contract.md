# SAVINT Hub — Integration Contract (read FIRST)

> **For agentic workers:** This document pins the exact names, signatures, and file paths shared across Plans 1–5. When an individual plan disagrees with this contract, **this contract wins** — adjust the implementation to match what you find here.

It exists because Plans 1–5 were drafted in parallel and minor divergences crept in (different rate-limit signatures, slightly different vocabulary exports, a wrong import path). Rather than re-edit every reference across ~12k plan lines, the implementer reads this first and uses these names everywhere.

---

## 1. Subject vocabulary — `src/lib/quiz-subjects.ts` (from Plan 1)

```ts
export interface QuizSubject {
  slug: string;
  label_it: string;
  label_en: string;
}

export const QUIZ_SUBJECTS: readonly QuizSubject[] = [/* … */];

export const SUBJECT_SLUGS: ReadonlySet<string> = new Set(
  QUIZ_SUBJECTS.map((s) => s.slug),
);

export function isValidSubject(slug: unknown): slug is string;

export function getSubjectLabel(slug: string, locale: "it" | "en"): string | null;
```

**Callers must use:**

- `SUBJECT_SLUGS.has(slug)` — **not** `SUBJECT_SLUGS.includes(...)` (it's a `Set`, not an array).
- `QUIZ_SUBJECTS` when they need the full `{ slug, label_it, label_en }[]` (e.g. dropdown options).
- `isValidSubject(...)` inside Zod refinements.
- `getSubjectLabel(...)` for rendering.

Plan 3's note about a missing `SUBJECT_SLUGS` export is obsolete — it exists.

Plan 4's `SCHOOL_LEVELS, SUBJECTS` import is wrong. Replace with `QUIZ_SUBJECTS` and the Prisma enum `SchoolLevel`:

```ts
import { QUIZ_SUBJECTS } from "@/lib/quiz-subjects";
import { SchoolLevel } from "@prisma/client";

const SCHOOL_LEVELS = Object.values(SchoolLevel); // PRIMARIA, SECONDARIA_I, …
```

---

## 2. School level — Prisma enum (from Plan 1)

`SchoolLevel` is a Prisma enum, imported as `import { SchoolLevel } from "@prisma/client"`.

Values: `PRIMARIA | SECONDARIA_I | SECONDARIA_II | UNIVERSITA | ALTRO`.

i18n labels live in `src/messages/{it,en}.json` under `quizMetadata.schoolLevel.<value>`.

---

## 3. Rate limiter — `src/lib/rate-limit/hub-rate-limit.ts`

**Single, authoritative signature** (used by Plans 2, 3, 4, 5):

```ts
export interface HubRateLimitArgs {
  key: string;            // composite identifier, e.g. "publish:tok_abc123"
  windowSeconds: number;  // sliding window length
  max: number;            // max events allowed in the window
}

export interface HubRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;  // present iff !allowed
}

export async function hubRateLimit(args: HubRateLimitArgs): Promise<HubRateLimitResult>;
```

**Plan 2** implements `hubRateLimit` in-memory.
**Plan 5** swaps the implementation to delegate to `checkRateLimit` (DB-backed, `src/lib/rate-limit/db-rate-limit.ts`) **without changing the signature or call sites**.

**Callers (Plans 2, 3, 4) must use this exact form**:

```ts
import { hubRateLimit } from "@/lib/rate-limit/hub-rate-limit";

const rl = await hubRateLimit({ key: `publish:${tokenId}`, windowSeconds: 3600, max: 10 });
if (!rl.allowed) {
  return new Response("Too Many Requests", {
    status: 429,
    headers: rl.retryAfterSeconds ? { "Retry-After": String(rl.retryAfterSeconds) } : {},
  });
}
```

**Disregard alternative names in the plans:** `consume(...)`, `enforceHubRateLimit(...)`, `checkRateLimit(...)` (the last one *does* exist in Plan 5 but is internal to `db-rate-limit.ts`).

**Wrong path correction:** Plan 4 imports from `@/lib/hub/rate-limit`. The correct path is `@/lib/rate-limit/hub-rate-limit`. Apply this substitution wherever Plan 4 has the wrong path.

---

## 4. Mode detection — `src/lib/config/savint-mode.ts` (from Plan 2)

```ts
export type SavintMode = "hub" | "installation";

export function getSavintMode(): SavintMode;  // reads SAVINT_MODE, defaults to "installation"
export function isHubMode(): boolean;
export function isInstallationMode(): boolean;
export function getHubUrl(): string;          // SAVINT_HUB_URL (installation mode); throws if unset there
export function getHubBaseUrl(): string;      // canonical own origin in hub mode (HUB_BASE_URL); throws if unset there
```

Plan 4 occasionally writes `getSavintMode()` — that's the canonical name.

---

## 5. Hub authentication — Plan 2 exports

`src/lib/auth/password.ts`:

```ts
export async function hashPassword(plain: string): Promise<string>;
export async function verifyPassword(plain: string, hash: string): Promise<boolean>;
```

`src/lib/auth/verification-token.ts`:

```ts
export type VerificationPurpose = "VERIFY_EMAIL" | "RESET_PASSWORD";

export async function issueVerificationToken(
  hubAccountId: string,
  purpose: VerificationPurpose,
): Promise<string /* plain token, send via email */>;

export async function consumeVerificationToken(
  plainToken: string,
  purpose: VerificationPurpose,
): Promise<{ hubAccountId: string } | null>;
```

`src/lib/auth/hub-session.ts` (NEW — required for Plan 5; Plan 2 must add it):

```ts
import type { NextRequest } from "next/server";
import type { HubAccount } from "@prisma/client";

export async function getHubSession(req: NextRequest): Promise<HubAccount | null>;
export async function getHubSessionFromCookies(): Promise<HubAccount | null>;
```

The two helpers wrap NextAuth's `getServerSession` and additionally hydrate the `HubAccount` row. If Plan 2 ships its session helpers under different names, rename them to match.

`src/lib/auth/require-hub-admin.ts` (Plan 5):

```ts
export async function requireHubAdmin(req: NextRequest): Promise<HubAccount>;
// throws 403 Response when not admin (or 401 when not authenticated)
```

---

## 6. Email — Plan 2 + Plan 5

`src/lib/email/send.ts` (Plan 2):

```ts
export interface SendEmailArgs {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(args: SendEmailArgs): Promise<void>;
```

Plan 5 templates (e.g. `quiz-suspended.ts`) must call `sendEmail({ to, subject, text, html })`.

---

## 7. Hub OAuth — Plan 3 exports

`src/lib/hub/hub-client.ts` (installation-side):

```ts
export interface FetchWithTokenRefreshArgs {
  userId: string;     // local installation User.id
  url: string;        // absolute URL to the hub
  init?: RequestInit;
  scope: "publish" | "clone";
}

export async function fetchWithTokenRefresh(args: FetchWithTokenRefreshArgs): Promise<Response>;

export function getAuthorizeUrl(args: {
  userId: string;
  scopes: ("publish" | "clone")[];
  state: string;
  codeChallenge: string;
}): string;
```

`src/lib/hub/access-token.ts` (hub-side):

```ts
export interface IssueAccessTokenArgs {
  hubAccountId: string;
  installationId: string;
  scopes: ("publish" | "clone")[];
}

export async function issueHubAccessToken(args: IssueAccessTokenArgs): Promise<{
  accessToken: string;    // plain, return to caller; only the hash is persisted
  refreshToken: string;   // plain, return to caller
  expiresIn: number;
}>;

export async function requireHubAccessToken(
  req: NextRequest,
  scope: "publish" | "clone",
): Promise<{ tokenId: string; hubAccountId: string; installationId: string }>;
// throws 401 / 403 Response
```

Plans 4 and 5 import these by these exact names. If Plan 3 introduces variants (e.g. `requireBearerToken`), rename to match the contract.

---

## 8. HubAccount relations on hub-only models

When Plan 3 introduces `HubQuiz`, `HubAccessToken`, `EmailVerificationToken`, etc., it must add the corresponding back-relations on `HubAccount`:

```prisma
model HubAccount {
  // … fields from Plan 2 …
  quizzes              HubQuiz[]
  accessTokens         HubAccessToken[]
  verificationTokens   EmailVerificationToken[]
  reportsMade          HubReport[]            @relation("hubReportsMade")
  reportsResolved      HubReport[]            @relation("hubReportsResolved")
}
```

Plan 4's note about a missing `HubAccount.quizzes` relation is resolved this way — Plan 3 adds it when it creates `HubQuiz`.

---

## 9. Route group strategy — Plan 2 hub pages

Plan 2 puts hub-only pages under `src/app/(hub)/login/`, `src/app/(hub)/register/`, etc. Next.js route groups don't affect URL paths, so both `(auth)/login/page.tsx` (installation) and `(hub)/login/page.tsx` (hub) would resolve to `/login` — Next.js will error at build time.

**Fix:** Plan 2 must rename the hub pages to avoid the collision. Use:

- `src/app/(hub)/hub-login/page.tsx` → `/hub-login`
- `src/app/(hub)/hub-register/page.tsx` → `/hub-register`
- `src/app/(hub)/hub-account/page.tsx` → `/hub-account`
- `src/app/(hub)/hub-forgot-password/page.tsx` → `/hub-forgot-password`
- `src/app/(hub)/hub-reset-password/page.tsx` → `/hub-reset-password`
- `src/app/(hub)/hub-verify-email/page.tsx` → `/hub-verify-email`

Then the middleware from Plan 2 step on the `(hub)` group (or by URL prefix `/hub-*`).

Update Plan 3/4/5 references accordingly (e.g. `/account` → `/hub-account` for hub-side links, OAuth `redirect_uri` paths). Spec Section 6 mentioned `/login`, `/register`, `/account` — that text in the spec is fine, but the implementation paths follow this contract.

Alternative (cleaner long-term but more invasive): Move the installation login to a different path (e.g. `/sign-in`) so the hub can keep `/login`. Skip this for v1 to avoid breaking existing installations' user habits.

---

## 10. Pre-Plan-5 stubs in Plan 4 endpoints

Plan 4 lists rate limits for catalog/practice endpoints but Plan 2's in-memory limiter only knows about auth/register/forgot-password keys. While executing Plan 4, wire `hubRateLimit({ ... })` calls into every catalog/practice endpoint immediately — Plan 2's in-memory implementation handles arbitrary keys, so no Plan-5 changes are required for it to work end-to-end. Plan 5 only swaps the storage layer.

---

## 11. Resolved diff summary — what each plan should change

| Plan | Override |
|---|---|
| Plan 2 | Rename hub pages to `/hub-*` (see §9). Export `hubRateLimit({ key, windowSeconds, max })` instead of `consume(key, limit, windowMs)`. Add `src/lib/auth/hub-session.ts` (§5). |
| Plan 3 | Use `hubRateLimit({ ... })` everywhere (drop `enforceHubRateLimit`). Use `SUBJECT_SLUGS.has(s)` not `.includes(s)`. Add `HubAccount` back-relations when introducing `HubQuiz`/`HubAccessToken` (§8). Use `/hub-account/hub-link` (or move the page to installation side at `/account/hub-link` — installation routes are not affected). |
| Plan 4 | Replace `import { SCHOOL_LEVELS, SUBJECTS } from "@/lib/quiz-subjects"` with `import { QUIZ_SUBJECTS } from "@/lib/quiz-subjects"; import { SchoolLevel } from "@prisma/client";` (§1). Change rate-limit import path from `@/lib/hub/rate-limit` to `@/lib/rate-limit/hub-rate-limit` and the signature to `{ key, windowSeconds, max }` (§3). |
| Plan 5 | Plan 5's `hubRateLimit` already uses the contract signature. Make sure `checkRateLimit` stays internal to `db-rate-limit.ts` (not re-exported from `hub-rate-limit.ts`). |
