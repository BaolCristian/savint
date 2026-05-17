# SAVINT Hub — Plan 2: Hub Bootstrap (Mode + Accounts)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **READ FIRST:** [`2026-05-17-savint-hub-00-integration-contract.md`](./2026-05-17-savint-hub-00-integration-contract.md). Most relevant overrides for this plan: (a) export `hubRateLimit({ key, windowSeconds, max })` instead of `consume(...)`; (b) rename hub pages to `/hub-login`, `/hub-register`, `/hub-account`, `/hub-forgot-password`, `/hub-reset-password`, `/hub-verify-email` to avoid colliding with the installation's `/login`; (c) add `src/lib/auth/hub-session.ts` exporting `getHubSession(req)` and `getHubSessionFromCookies()`.

**Goal:** Enable a SAVINT instance to run as the central hub at savint.it, accepting user registration and login via Google OAuth or email/password, with email verification.

**Architecture:** A single env var `SAVINT_MODE=hub|installation` toggles features. New Prisma models `HubAccount` and `EmailVerificationToken` coexist in the unified schema. NextAuth v5 is extended with a `CredentialsProvider` and a separate `HubAccount` adapter. A new route group `src/app/(hub)/` holds `/login`, `/register`, `/forgot-password`, `/account`. Hub-only routes are guarded by a middleware that 404s when `SAVINT_MODE !== "hub"`.

**Tech Stack:** Prisma 6, NextAuth v5 (with new `CredentialsProvider`), Next.js 16 App Router, bcryptjs, nodemailer (for verification emails), Zod 4, next-intl 4, Vitest 3.

**Reference spec:** `docs/superpowers/specs/2026-05-17-online-quiz-repository-design.md` (Sections 2, 3 — HubAccount + EmailVerificationToken only, 6, 9 — auth rate limits)

**Assumed already done by Plan 1:** nullable `schoolLevel`, `subject`, `language`, `ageMin`, `ageMax`, `hubPublishedId`, `hubLastPublishedAt`, `hubAccountId`, `clonedFromHubId`, `clonedFromHubVersion`, `clonedFromHubAuthor` columns on `Quiz`. The controlled vocabulary file `src/lib/quiz-subjects.ts`. The `SchoolLevel` enum.

---

## File Structure

**Create:**

- `src/lib/config/savint-mode.ts` — exports `getSavintMode()` returning `"hub" | "installation"`.
- `src/lib/auth/password.ts` — `hashPassword(plain)` / `verifyPassword(plain, hash)` using bcryptjs cost 12.
- `src/lib/email/mailer-config.ts` — builds a singleton `nodemailer` transport from env vars.
- `src/lib/email/send.ts` — `sendVerificationEmail({to, link, locale})` and `sendPasswordResetEmail({to, link, locale})`.
- `src/lib/auth/verification-token.ts` — `issueToken(hubAccountId, purpose)` and `consumeToken(plainToken, purpose)`.
- `src/lib/auth/hub-credentials.ts` — `verifyHubCredentials(email, password)` Credentials authorize function for hub mode.
- `src/lib/auth/hub-adapter.ts` — NextAuth adapter targeting `HubAccount` (used only in hub mode).
- `src/lib/rate-limit/hub-rate-limit.ts` — in-memory sliding-window limiter with `consume(key, limit, windowMs)`.
- `src/middleware.ts` — global middleware that 404s hub-only routes when `SAVINT_MODE !== "hub"`.
- `src/app/(hub)/register/page.tsx` — registration form page.
- `src/app/(hub)/register/actions.ts` — server action `registerHubAccount`.
- `src/app/(hub)/login/page.tsx` — hub login page (Google + email/password).
- `src/app/(hub)/login/actions.ts` — server action `loginWithPassword`.
- `src/app/(hub)/forgot-password/page.tsx` — request reset form.
- `src/app/(hub)/forgot-password/actions.ts` — server action `requestPasswordReset`.
- `src/app/(hub)/reset-password/page.tsx` — set-new-password form, takes `?token=`.
- `src/app/(hub)/reset-password/actions.ts` — server action `resetPassword`.
- `src/app/(hub)/account/page.tsx` — `/account` profile page (name, affiliation, password change, linked providers).
- `src/app/(hub)/account/actions.ts` — server actions: `updateProfile`, `changePassword`, `unlinkProvider`.
- `src/app/(hub)/verify-email-sent/page.tsx` — informational "check your inbox".
- `src/app/api/hub/auth/verify/route.ts` — `GET /api/hub/auth/verify?token=...` consumes email verification token.
- `scripts/promote-hub-admin.ts` — CLI to set `HubAccount.role = HUB_ADMIN` by email.
- Tests:
  - `src/lib/config/__tests__/savint-mode.test.ts`
  - `src/lib/auth/__tests__/password.test.ts`
  - `src/lib/email/__tests__/send.test.ts`
  - `src/lib/auth/__tests__/verification-token.test.ts`
  - `src/lib/auth/__tests__/hub-credentials.test.ts`
  - `src/lib/rate-limit/__tests__/hub-rate-limit.test.ts`
  - `tests/unit/hub/middleware.test.ts`
  - `tests/unit/hub/register-action.test.ts`
  - `tests/unit/hub/login-page.test.tsx`
  - `tests/unit/hub/verify-route.test.ts`
  - `tests/unit/hub/forgot-password-action.test.ts`
  - `tests/unit/hub/reset-password-action.test.ts`
  - `tests/unit/hub/account-actions.test.ts`
  - `tests/unit/hub/promote-admin.test.ts`

**Modify:**

- `package.json` — add `bcryptjs`, `@types/bcryptjs`, `nodemailer`, `@types/nodemailer`.
- `prisma/schema.prisma` — add `HubAccountRole`, `HubAuthMethod`, `VerificationPurpose` enums and `HubAccount`, `EmailVerificationToken` models.
- `src/lib/auth/config.ts` — register the hub Credentials provider when `SAVINT_MODE=hub`; swap adapter in hub mode.
- `src/messages/it.json` and `src/messages/en.json` — add the new `hubAuth`, `hubAccount`, `hubEmail` namespaces.
- `.env.example` — add `SAVINT_MODE`, `HUB_EMAIL_FROM`, `HUB_SMTP_HOST`, `HUB_SMTP_PORT`, `HUB_SMTP_USER`, `HUB_SMTP_PASS`, `HUB_SMTP_SECURE`, `HUB_IP_HASH_SECRET`, `HUB_BASE_URL`.

Each task below is self-contained, TDD-oriented, and ends in a commit.

---

## Task 1: `SAVINT_MODE` env-var helper

**Files:**
- Create: `src/lib/config/savint-mode.ts`
- Create: `src/lib/config/__tests__/savint-mode.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/config/__tests__/savint-mode.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getSavintMode, isHubMode, isInstallationMode } from "../savint-mode";

const ORIGINAL = process.env.SAVINT_MODE;

describe("savint-mode", () => {
  beforeEach(() => {
    delete process.env.SAVINT_MODE;
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SAVINT_MODE;
    else process.env.SAVINT_MODE = ORIGINAL;
  });

  it("defaults to installation when unset", () => {
    expect(getSavintMode()).toBe("installation");
    expect(isInstallationMode()).toBe(true);
    expect(isHubMode()).toBe(false);
  });

  it("returns hub when set to hub", () => {
    process.env.SAVINT_MODE = "hub";
    expect(getSavintMode()).toBe("hub");
    expect(isHubMode()).toBe(true);
    expect(isInstallationMode()).toBe(false);
  });

  it("returns installation for explicit installation value", () => {
    process.env.SAVINT_MODE = "installation";
    expect(getSavintMode()).toBe("installation");
  });

  it("falls back to installation for unknown value", () => {
    process.env.SAVINT_MODE = "weird";
    expect(getSavintMode()).toBe("installation");
  });
});
```

- [ ] **Step 2: Run the test and confirm failure**

```bash
npx vitest run src/lib/config/__tests__/savint-mode.test.ts
```

Expected output includes: `Error: Cannot find module '../savint-mode'`.

- [ ] **Step 3: Implement**

Create `src/lib/config/savint-mode.ts`:

```ts
export type SavintMode = "hub" | "installation";

export function getSavintMode(): SavintMode {
  return process.env.SAVINT_MODE === "hub" ? "hub" : "installation";
}

export function isHubMode(): boolean {
  return getSavintMode() === "hub";
}

export function isInstallationMode(): boolean {
  return getSavintMode() === "installation";
}
```

- [ ] **Step 4: Run the test and confirm pass**

```bash
npx vitest run src/lib/config/__tests__/savint-mode.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/config/savint-mode.ts src/lib/config/__tests__/savint-mode.test.ts
git commit -m "feat(config): add SAVINT_MODE env helper"
```

---

## Task 2: Install runtime dependencies

**Files:**
- Modify: `package.json` (and `package-lock.json` generated by npm)

- [ ] **Step 1: Install bcryptjs and nodemailer with types**

```bash
npm install bcryptjs nodemailer
npm install --save-dev @types/bcryptjs @types/nodemailer
```

Expected: `package.json` gains four entries. No errors.

- [ ] **Step 2: Verify TypeScript can resolve imports**

```bash
cat > /tmp/__savint_dep_check.ts <<'EOF'
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
const _h: typeof bcrypt.hash = bcrypt.hash;
const _t: typeof nodemailer.createTransport = nodemailer.createTransport;
void _h; void _t;
EOF
npx tsc --noEmit --esModuleInterop /tmp/__savint_dep_check.ts
rm /tmp/__savint_dep_check.ts
```

Expected: exit code 0, no output.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add bcryptjs and nodemailer dependencies for hub auth"
```

---

## Task 3: Prisma models `HubAccount` and `EmailVerificationToken`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_hub_accounts/migration.sql` (generated)

- [ ] **Step 1: Add enums and models to schema**

In `prisma/schema.prisma`, after the existing `enum ReportStatus { ... }` block (before `model User`), add:

```prisma
enum HubAccountRole {
  HUB_USER
  HUB_ADMIN
}

enum HubAuthMethod {
  GOOGLE
  PASSWORD
}

enum VerificationPurpose {
  VERIFY_EMAIL
  RESET_PASSWORD
}
```

At the end of the file, append:

```prisma
model HubAccount {
  id              String          @id @default(cuid())
  email           String          @unique
  name            String?
  image           String?
  authMethod      HubAuthMethod
  passwordHash    String?
  emailVerified   DateTime?
  affiliation     String?
  role            HubAccountRole  @default(HUB_USER)
  linkedProviders String[]        @default([])
  bannedAt        DateTime?
  createdAt       DateTime        @default(now())

  verificationTokens EmailVerificationToken[]

  @@index([role])
  @@map("hub_account")
}

model EmailVerificationToken {
  id           String              @id @default(cuid())
  hubAccountId String
  tokenHash    String              @unique
  purpose      VerificationPurpose
  expiresAt    DateTime
  usedAt       DateTime?
  createdAt    DateTime            @default(now())

  hubAccount HubAccount @relation(fields: [hubAccountId], references: [id], onDelete: Cascade)

  @@index([hubAccountId, purpose])
  @@map("email_verification_token")
}
```

- [ ] **Step 2: Generate the migration**

```bash
npx prisma migrate dev --name add_hub_accounts
```

Expected: a new migration directory `prisma/migrations/<timestamp>_add_hub_accounts/` is created and applied. `npx prisma generate` runs implicitly.

- [ ] **Step 3: Write a smoke test against the new client**

Create `src/lib/auth/__tests__/hub-account-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";

describe("HubAccount schema", () => {
  it("exposes hubAccount and emailVerificationToken delegates", () => {
    const prisma = new PrismaClient();
    expect(typeof prisma.hubAccount.create).toBe("function");
    expect(typeof prisma.emailVerificationToken.create).toBe("function");
    expect(typeof prisma.hubAccount.findUnique).toBe("function");
  });

  it("exposes HubAccountRole / HubAuthMethod / VerificationPurpose enums", async () => {
    const enums = await import("@prisma/client");
    expect(enums.HubAccountRole.HUB_ADMIN).toBe("HUB_ADMIN");
    expect(enums.HubAccountRole.HUB_USER).toBe("HUB_USER");
    expect(enums.HubAuthMethod.GOOGLE).toBe("GOOGLE");
    expect(enums.HubAuthMethod.PASSWORD).toBe("PASSWORD");
    expect(enums.VerificationPurpose.VERIFY_EMAIL).toBe("VERIFY_EMAIL");
    expect(enums.VerificationPurpose.RESET_PASSWORD).toBe("RESET_PASSWORD");
  });
});
```

- [ ] **Step 4: Run the test**

```bash
npx vitest run src/lib/auth/__tests__/hub-account-schema.test.ts
```

Expected: 2 passing tests.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/auth/__tests__/hub-account-schema.test.ts
git commit -m "feat(db): add HubAccount and EmailVerificationToken models"
```

---

## Task 4: Password utility module

**Files:**
- Create: `src/lib/auth/password.ts`
- Create: `src/lib/auth/__tests__/password.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/auth/__tests__/password.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, BCRYPT_COST } from "../password";

describe("hashPassword / verifyPassword", () => {
  it("uses bcrypt cost 12", () => {
    expect(BCRYPT_COST).toBe(12);
  });

  it("hashes a password into a bcrypt-format string", async () => {
    const hash = await hashPassword("hunter2-correct-horse");
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(hash.length).toBeGreaterThan(50);
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("hunter2-correct-horse");
    await expect(verifyPassword("hunter2-correct-horse", hash)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("hunter2-correct-horse");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("rejects empty / null hash safely", async () => {
    await expect(verifyPassword("anything", "")).resolves.toBe(false);
    await expect(verifyPassword("anything", null as unknown as string)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run src/lib/auth/__tests__/password.test.ts
```

Expected: module not found error.

- [ ] **Step 3: Implement**

Create `src/lib/auth/password.ts`:

```ts
import bcrypt from "bcryptjs";

export const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 8) {
    throw new Error("password must be at least 8 characters");
  }
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash || typeof hash !== "string" || hash.length === 0) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run and confirm pass**

```bash
npx vitest run src/lib/auth/__tests__/password.test.ts
```

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/password.ts src/lib/auth/__tests__/password.test.ts
git commit -m "feat(auth): add password hashing utility (bcryptjs cost 12)"
```

---

## Task 5: Email-sending module

**Files:**
- Create: `src/lib/email/mailer-config.ts`
- Create: `src/lib/email/send.ts`
- Create: `src/lib/email/__tests__/send.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/email/__tests__/send.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMail = vi.fn().mockResolvedValue({ messageId: "fake" });
const createTransport = vi.fn(() => ({ sendMail }));

vi.mock("nodemailer", () => ({
  default: { createTransport },
  createTransport,
}));

const ENV_KEYS = [
  "HUB_EMAIL_FROM",
  "HUB_SMTP_HOST",
  "HUB_SMTP_PORT",
  "HUB_SMTP_USER",
  "HUB_SMTP_PASS",
  "HUB_SMTP_SECURE",
];

describe("email/send", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
    }
    process.env.HUB_EMAIL_FROM = "noreply@savint.it";
    process.env.HUB_SMTP_HOST = "mailhog";
    process.env.HUB_SMTP_PORT = "1025";
    process.env.HUB_SMTP_USER = "smtp-user";
    process.env.HUB_SMTP_PASS = "smtp-pass";
    process.env.HUB_SMTP_SECURE = "false";
    sendMail.mockClear();
    createTransport.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
  });

  it("sends a verification email with link and locale 'it'", async () => {
    const { sendVerificationEmail } = await import("../send");
    await sendVerificationEmail({
      to: "user@example.com",
      link: "https://savint.it/savint/api/hub/auth/verify?token=xyz",
      locale: "it",
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const args = sendMail.mock.calls[0][0];
    expect(args.from).toBe("noreply@savint.it");
    expect(args.to).toBe("user@example.com");
    expect(args.subject).toMatch(/Conferma/i);
    expect(args.html).toContain("https://savint.it/savint/api/hub/auth/verify?token=xyz");
    expect(args.text).toContain("https://savint.it/savint/api/hub/auth/verify?token=xyz");
  });

  it("sends a verification email in English", async () => {
    const { sendVerificationEmail } = await import("../send");
    await sendVerificationEmail({ to: "user@example.com", link: "https://x/v", locale: "en" });
    const args = sendMail.mock.calls[0][0];
    expect(args.subject).toMatch(/Confirm/i);
  });

  it("sends a password reset email", async () => {
    const { sendPasswordResetEmail } = await import("../send");
    await sendPasswordResetEmail({ to: "user@example.com", link: "https://x/r", locale: "it" });
    const args = sendMail.mock.calls[0][0];
    expect(args.subject).toMatch(/password/i);
    expect(args.html).toContain("https://x/r");
  });

  it("creates the SMTP transport using env vars", async () => {
    const { sendVerificationEmail } = await import("../send");
    await sendVerificationEmail({ to: "u@e.com", link: "x", locale: "it" });
    expect(createTransport).toHaveBeenCalledTimes(1);
    const cfg = createTransport.mock.calls[0][0];
    expect(cfg.host).toBe("mailhog");
    expect(cfg.port).toBe(1025);
    expect(cfg.secure).toBe(false);
    expect(cfg.auth).toEqual({ user: "smtp-user", pass: "smtp-pass" });
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run src/lib/email/__tests__/send.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement transport**

Create `src/lib/email/mailer-config.ts`:

```ts
import nodemailer, { type Transporter } from "nodemailer";

let cached: Transporter | null = null;

export function getMailerTransport(): Transporter {
  if (cached) return cached;
  const host = process.env.HUB_SMTP_HOST;
  if (!host) {
    throw new Error("HUB_SMTP_HOST is not set; cannot send email in hub mode");
  }
  const port = Number(process.env.HUB_SMTP_PORT ?? 587);
  const secure = (process.env.HUB_SMTP_SECURE ?? "false").toLowerCase() === "true";
  const user = process.env.HUB_SMTP_USER;
  const pass = process.env.HUB_SMTP_PASS;
  cached = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });
  return cached;
}

// Test seam: reset cache between vi.resetModules() calls.
export function resetMailerCacheForTests() {
  cached = null;
}
```

- [ ] **Step 4: Implement sender**

Create `src/lib/email/send.ts`:

```ts
import { getMailerTransport } from "./mailer-config";

type Locale = "it" | "en";

interface SendArgs {
  to: string;
  link: string;
  locale: Locale;
}

const VERIFY_SUBJECTS: Record<Locale, string> = {
  it: "Conferma il tuo indirizzo email su savint.it",
  en: "Confirm your email address on savint.it",
};

const VERIFY_BODY_INTRO: Record<Locale, string> = {
  it: "Benvenuto su savint.it. Conferma il tuo indirizzo email cliccando sul link qui sotto (scade entro 24 ore):",
  en: "Welcome to savint.it. Confirm your email address by clicking the link below (expires in 24 hours):",
};

const RESET_SUBJECTS: Record<Locale, string> = {
  it: "Reimposta la tua password su savint.it",
  en: "Reset your password on savint.it",
};

const RESET_BODY_INTRO: Record<Locale, string> = {
  it: "Hai richiesto di reimpostare la password. Clicca sul link qui sotto entro 24 ore:",
  en: "You requested a password reset. Click the link below within 24 hours:",
};

function getFrom(): string {
  const from = process.env.HUB_EMAIL_FROM;
  if (!from) throw new Error("HUB_EMAIL_FROM is not set");
  return from;
}

function htmlTemplate(intro: string, link: string, locale: Locale): string {
  const linkLabel = locale === "it" ? "Apri il link" : "Open link";
  return `<!doctype html><html><body style="font-family:sans-serif;line-height:1.5">
<p>${intro}</p>
<p><a href="${link}" style="background:#1d4ed8;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${linkLabel}</a></p>
<p style="color:#666;font-size:12px">${link}</p>
</body></html>`;
}

export async function sendVerificationEmail({ to, link, locale }: SendArgs) {
  const transport = getMailerTransport();
  await transport.sendMail({
    from: getFrom(),
    to,
    subject: VERIFY_SUBJECTS[locale],
    text: `${VERIFY_BODY_INTRO[locale]}\n\n${link}\n`,
    html: htmlTemplate(VERIFY_BODY_INTRO[locale], link, locale),
  });
}

export async function sendPasswordResetEmail({ to, link, locale }: SendArgs) {
  const transport = getMailerTransport();
  await transport.sendMail({
    from: getFrom(),
    to,
    subject: RESET_SUBJECTS[locale],
    text: `${RESET_BODY_INTRO[locale]}\n\n${link}\n`,
    html: htmlTemplate(RESET_BODY_INTRO[locale], link, locale),
  });
}
```

- [ ] **Step 5: Run and confirm pass**

```bash
npx vitest run src/lib/email/__tests__/send.test.ts
```

Expected: 4 passing tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email src/lib/email/__tests__
git commit -m "feat(email): add nodemailer transport and verification/reset templates"
```

---

## Task 6: Email verification token module

**Files:**
- Create: `src/lib/auth/verification-token.ts`
- Create: `src/lib/auth/__tests__/verification-token.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/auth/__tests__/verification-token.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { VerificationPurpose } from "@prisma/client";

const mockToken = {
  create: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
};

vi.mock("@/lib/db/client", () => ({
  prisma: {
    emailVerificationToken: mockToken,
  },
}));

beforeEach(() => {
  mockToken.create.mockReset();
  mockToken.findUnique.mockReset();
  mockToken.update.mockReset();
});

describe("issueToken", () => {
  it("returns a plain token and stores its SHA-256 hash with 24h TTL", async () => {
    mockToken.create.mockResolvedValue({ id: "tok-1" });
    const { issueToken, TOKEN_TTL_MS } = await import("../verification-token");
    const before = Date.now();
    const { plainToken, expiresAt } = await issueToken("acct-1", VerificationPurpose.VERIFY_EMAIL);
    expect(plainToken).toMatch(/^[a-f0-9]{64}$/);
    expect(mockToken.create).toHaveBeenCalledTimes(1);
    const data = mockToken.create.mock.calls[0][0].data;
    expect(data.hubAccountId).toBe("acct-1");
    expect(data.purpose).toBe(VerificationPurpose.VERIFY_EMAIL);
    expect(data.tokenHash).not.toBe(plainToken);
    expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(TOKEN_TTL_MS - 1000);
    expect(expiresAt.getTime() - before).toBeLessThanOrEqual(TOKEN_TTL_MS + 1000);
  });
});

describe("consumeToken", () => {
  it("returns the hubAccountId for a valid unused token and marks it used", async () => {
    mockToken.findUnique.mockResolvedValue({
      id: "tok-1",
      hubAccountId: "acct-1",
      purpose: VerificationPurpose.VERIFY_EMAIL,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });
    mockToken.update.mockResolvedValue({});
    const { consumeToken } = await import("../verification-token");
    const plain = "a".repeat(64);
    const result = await consumeToken(plain, VerificationPurpose.VERIFY_EMAIL);
    expect(result).toEqual({ hubAccountId: "acct-1" });
    expect(mockToken.update).toHaveBeenCalledTimes(1);
    expect(mockToken.update.mock.calls[0][0].data.usedAt).toBeInstanceOf(Date);
  });

  it("returns null when the token does not exist", async () => {
    mockToken.findUnique.mockResolvedValue(null);
    const { consumeToken } = await import("../verification-token");
    const result = await consumeToken("a".repeat(64), VerificationPurpose.VERIFY_EMAIL);
    expect(result).toBeNull();
  });

  it("returns null for an expired token (does not mark used)", async () => {
    mockToken.findUnique.mockResolvedValue({
      id: "tok-1",
      hubAccountId: "acct-1",
      purpose: VerificationPurpose.VERIFY_EMAIL,
      expiresAt: new Date(Date.now() - 60_000),
      usedAt: null,
    });
    const { consumeToken } = await import("../verification-token");
    const result = await consumeToken("a".repeat(64), VerificationPurpose.VERIFY_EMAIL);
    expect(result).toBeNull();
    expect(mockToken.update).not.toHaveBeenCalled();
  });

  it("returns null when the token has already been used", async () => {
    mockToken.findUnique.mockResolvedValue({
      id: "tok-1",
      hubAccountId: "acct-1",
      purpose: VerificationPurpose.VERIFY_EMAIL,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(Date.now() - 1_000),
    });
    const { consumeToken } = await import("../verification-token");
    const result = await consumeToken("a".repeat(64), VerificationPurpose.VERIFY_EMAIL);
    expect(result).toBeNull();
    expect(mockToken.update).not.toHaveBeenCalled();
  });

  it("returns null when the token purpose does not match", async () => {
    mockToken.findUnique.mockResolvedValue({
      id: "tok-1",
      hubAccountId: "acct-1",
      purpose: VerificationPurpose.RESET_PASSWORD,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });
    const { consumeToken } = await import("../verification-token");
    const result = await consumeToken("a".repeat(64), VerificationPurpose.VERIFY_EMAIL);
    expect(result).toBeNull();
    expect(mockToken.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run src/lib/auth/__tests__/verification-token.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement**

Create `src/lib/auth/verification-token.ts`:

```ts
import { createHash, randomBytes } from "crypto";
import { VerificationPurpose } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function issueToken(
  hubAccountId: string,
  purpose: VerificationPurpose,
): Promise<{ plainToken: string; expiresAt: Date }> {
  const plainToken = randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(plainToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await prisma.emailVerificationToken.create({
    data: { hubAccountId, tokenHash, purpose, expiresAt },
  });
  return { plainToken, expiresAt };
}

export async function consumeToken(
  plainToken: string,
  purpose: VerificationPurpose,
): Promise<{ hubAccountId: string } | null> {
  if (!plainToken || plainToken.length < 32) return null;
  const tokenHash = sha256Hex(plainToken);
  const row = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
  if (!row) return null;
  if (row.purpose !== purpose) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  await prisma.emailVerificationToken.update({
    where: { tokenHash },
    data: { usedAt: new Date() },
  });
  return { hubAccountId: row.hubAccountId };
}
```

- [ ] **Step 4: Run and confirm pass**

```bash
npx vitest run src/lib/auth/__tests__/verification-token.test.ts
```

Expected: 6 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/verification-token.ts src/lib/auth/__tests__/verification-token.test.ts
git commit -m "feat(auth): add email verification token issue/consume"
```

---

## Task 7: Hub Credentials provider + adapter, wire into NextAuth

**Files:**
- Create: `src/lib/auth/hub-credentials.ts`
- Create: `src/lib/auth/hub-adapter.ts`
- Modify: `src/lib/auth/config.ts`
- Create: `src/lib/auth/__tests__/hub-credentials.test.ts`

- [ ] **Step 1: Write failing test for credential authorize fn**

Create `src/lib/auth/__tests__/hub-credentials.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockHub = {
  findUnique: vi.fn(),
};

vi.mock("@/lib/db/client", () => ({
  prisma: { hubAccount: mockHub },
}));

beforeEach(() => {
  mockHub.findUnique.mockReset();
});

describe("verifyHubCredentials", () => {
  it("returns null when email is missing", async () => {
    const { verifyHubCredentials } = await import("../hub-credentials");
    expect(await verifyHubCredentials("", "x")).toBeNull();
  });

  it("returns null when account does not exist", async () => {
    mockHub.findUnique.mockResolvedValue(null);
    const { verifyHubCredentials } = await import("../hub-credentials");
    expect(await verifyHubCredentials("x@y.z", "password1")).toBeNull();
  });

  it("returns null when authMethod is GOOGLE (no password set)", async () => {
    mockHub.findUnique.mockResolvedValue({
      id: "a", email: "x@y.z", name: "X", image: null,
      authMethod: "GOOGLE", passwordHash: null, emailVerified: new Date(), bannedAt: null,
    });
    const { verifyHubCredentials } = await import("../hub-credentials");
    expect(await verifyHubCredentials("x@y.z", "password1")).toBeNull();
  });

  it("returns null when email is not verified", async () => {
    const { hashPassword } = await import("../password");
    const hash = await hashPassword("password1");
    mockHub.findUnique.mockResolvedValue({
      id: "a", email: "x@y.z", name: "X", image: null,
      authMethod: "PASSWORD", passwordHash: hash, emailVerified: null, bannedAt: null,
    });
    const { verifyHubCredentials } = await import("../hub-credentials");
    expect(await verifyHubCredentials("x@y.z", "password1")).toBeNull();
  });

  it("returns null when account is banned", async () => {
    const { hashPassword } = await import("../password");
    const hash = await hashPassword("password1");
    mockHub.findUnique.mockResolvedValue({
      id: "a", email: "x@y.z", name: "X", image: null,
      authMethod: "PASSWORD", passwordHash: hash, emailVerified: new Date(), bannedAt: new Date(),
    });
    const { verifyHubCredentials } = await import("../hub-credentials");
    expect(await verifyHubCredentials("x@y.z", "password1")).toBeNull();
  });

  it("returns null when password is wrong", async () => {
    const { hashPassword } = await import("../password");
    const hash = await hashPassword("password1");
    mockHub.findUnique.mockResolvedValue({
      id: "a", email: "x@y.z", name: "X", image: null,
      authMethod: "PASSWORD", passwordHash: hash, emailVerified: new Date(), bannedAt: null,
    });
    const { verifyHubCredentials } = await import("../hub-credentials");
    expect(await verifyHubCredentials("x@y.z", "wrong-password")).toBeNull();
  });

  it("returns a user-shaped object on success", async () => {
    const { hashPassword } = await import("../password");
    const hash = await hashPassword("password1");
    mockHub.findUnique.mockResolvedValue({
      id: "a-id", email: "x@y.z", name: "X", image: null,
      authMethod: "PASSWORD", passwordHash: hash, emailVerified: new Date(), bannedAt: null,
    });
    const { verifyHubCredentials } = await import("../hub-credentials");
    const user = await verifyHubCredentials("x@y.z", "password1");
    expect(user).toEqual({ id: "a-id", email: "x@y.z", name: "X", image: null });
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run src/lib/auth/__tests__/hub-credentials.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement the credentials helper**

Create `src/lib/auth/hub-credentials.ts`:

```ts
import { prisma } from "@/lib/db/client";
import { verifyPassword } from "./password";

export interface HubUserPayload {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

export async function verifyHubCredentials(
  email: string,
  password: string,
): Promise<HubUserPayload | null> {
  if (!email || !password) return null;
  const acct = await prisma.hubAccount.findUnique({ where: { email: email.toLowerCase() } });
  if (!acct) return null;
  if (acct.authMethod !== "PASSWORD") return null;
  if (!acct.emailVerified) return null;
  if (acct.bannedAt) return null;
  const ok = await verifyPassword(password, acct.passwordHash);
  if (!ok) return null;
  return { id: acct.id, email: acct.email, name: acct.name, image: acct.image };
}
```

- [ ] **Step 4: Create hub adapter (CRUD against `HubAccount`)**

Create `src/lib/auth/hub-adapter.ts`:

```ts
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { prisma } from "@/lib/db/client";

/**
 * NextAuth adapter that stores users in `HubAccount` (instead of the default `User`).
 * Sessions are JWT-only in hub mode, so we omit session-related methods.
 * Used only when SAVINT_MODE=hub.
 */
export function hubAccountAdapter(): Adapter {
  return {
    async createUser(data) {
      const created = await prisma.hubAccount.create({
        data: {
          email: data.email.toLowerCase(),
          name: data.name ?? null,
          image: data.image ?? null,
          authMethod: "GOOGLE",
          emailVerified: data.emailVerified ?? new Date(),
          linkedProviders: ["google"],
        },
      });
      return mapHubToAdapter(created);
    },
    async getUser(id) {
      const row = await prisma.hubAccount.findUnique({ where: { id } });
      return row ? mapHubToAdapter(row) : null;
    },
    async getUserByEmail(email) {
      const row = await prisma.hubAccount.findUnique({ where: { email: email.toLowerCase() } });
      return row ? mapHubToAdapter(row) : null;
    },
    async getUserByAccount() {
      // Google account linkage is collapsed into HubAccount.linkedProviders.
      // Returning null is acceptable because allowDangerousEmailAccountLinking
      // routes to getUserByEmail.
      return null;
    },
    async updateUser(data) {
      const updated = await prisma.hubAccount.update({
        where: { id: data.id! },
        data: {
          name: data.name ?? undefined,
          email: data.email ? data.email.toLowerCase() : undefined,
          image: data.image ?? undefined,
          emailVerified: data.emailVerified ?? undefined,
        },
      });
      return mapHubToAdapter(updated);
    },
    async deleteUser(id) {
      await prisma.hubAccount.delete({ where: { id } });
    },
    async linkAccount() {
      // No-op: we don't store Account rows for hub. The provider is
      // tracked via HubAccount.linkedProviders.
      return undefined;
    },
    async unlinkAccount() {
      return undefined;
    },
    async createVerificationToken() {
      // Email verification is handled by our own EmailVerificationToken model.
      return null;
    },
    async useVerificationToken() {
      return null;
    },
  };
}

function mapHubToAdapter(row: {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: Date | null;
}): AdapterUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
    emailVerified: row.emailVerified ?? new Date(0),
  };
}
```

- [ ] **Step 5: Wire NextAuth config to hub mode**

Modify `src/lib/auth/config.ts`. Replace the entire file with:

```ts
import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@/lib/db/client";
import { isHubMode } from "@/lib/config/savint-mode";
import { verifyHubCredentials } from "@/lib/auth/hub-credentials";
import { hubAccountAdapter } from "@/lib/auth/hub-adapter";

const hub = isHubMode();

const providers: Provider[] = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    authorization: { params: { prompt: "select_account" } },
    // All OAuth checks (pkce, state, nonce) rely on cookies which fail
    // behind the reverse proxy with basePath. Disabled until nginx cookie
    // forwarding is fixed. TODO: re-enable once proxy is configured.
    checks: [],
    // Allow linking Google account to existing user with same email.
    // Safe because Google is the only OAuth provider.
    allowDangerousEmailAccountLinking: true,
  }),
];

if (hub) {
  // Hub mode: real email/password Credentials.
  providers.push(
    Credentials({
      id: "hub-credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined) ?? "";
        const password = (credentials?.password as string | undefined) ?? "";
        return verifyHubCredentials(email, password);
      },
    }),
  );
}

// Dev/demo: login with email, no password needed
if (
  !hub &&
  (process.env.NODE_ENV === "development" || process.env.DEMO_MODE === "true")
) {
  providers.push(
    Credentials({
      name: "Dev Login",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "docente@scuola.it" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        if (!email) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        return user;
      },
    }),
  );
}

let adapter: Adapter;

if (hub) {
  adapter = hubAccountAdapter();
} else {
  // Installation mode: original adapter that bridges PrismaAdapter to AuthSession.
  const baseAdapter = PrismaAdapter(prisma) as Adapter;
  adapter = {
    ...baseAdapter,
    async createSession(session) {
      const created = await prisma.authSession.create({ data: session });
      return created;
    },
    async getSessionAndUser(sessionToken) {
      const row = await prisma.authSession.findUnique({
        where: { sessionToken },
        include: { user: true },
      });
      if (!row) return null;
      const { user, ...session } = row;
      return { session, user };
    },
    async updateSession({ sessionToken, ...data }) {
      const updated = await prisma.authSession.update({
        where: { sessionToken },
        data,
      });
      return updated;
    },
    async deleteSession(sessionToken) {
      await prisma.authSession.delete({ where: { sessionToken } });
    },
  };
}

const sessionStrategy: "jwt" | "database" =
  hub ||
  process.env.NODE_ENV === "development" ||
  process.env.DEMO_MODE === "true"
    ? "jwt"
    : "database";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter,
  providers,
  basePath: "/savint/api/auth",
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: { strategy: sessionStrategy },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        if (hub) {
          const acct = await prisma.hubAccount.findUnique({
            where: { id: user.id },
            select: { role: true },
          });
          token.role = acct?.role ?? "HUB_USER";
        } else {
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { role: true },
          });
          token.role = dbUser?.role ?? "TEACHER";
        }
      }
      return token;
    },
    async session({ session, user, token }) {
      if (session.user) {
        session.user.id = user?.id ?? token?.sub ?? "";
        if (hub) {
          session.user.role =
            ((token?.role as "HUB_USER" | "HUB_ADMIN" | undefined) ?? "HUB_USER") as never;
        } else if (user) {
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { role: true },
          });
          session.user.role = (dbUser?.role as "TEACHER" | "ADMIN") ?? "TEACHER";
        } else {
          session.user.role = (token.role as "TEACHER" | "ADMIN") ?? "TEACHER";
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
```

- [ ] **Step 6: Run all auth tests and confirm pass**

```bash
npx vitest run src/lib/auth
```

Expected: all tests under `src/lib/auth/__tests__` pass, including the 7 new ones.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/hub-credentials.ts src/lib/auth/hub-adapter.ts src/lib/auth/config.ts src/lib/auth/__tests__/hub-credentials.test.ts
git commit -m "feat(auth): wire hub Credentials provider and HubAccount adapter"
```

---

## Task 8: Global middleware that 404s hub-only routes in installation mode

**Files:**
- Create: `src/middleware.ts`
- Create: `tests/unit/hub/middleware.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/hub/middleware.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const ORIGINAL = process.env.SAVINT_MODE;

async function importMiddleware() {
  return (await import("@/middleware")).middleware;
}

describe("hub middleware", () => {
  beforeEach(() => { delete process.env.SAVINT_MODE; });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SAVINT_MODE;
    else process.env.SAVINT_MODE = ORIGINAL;
  });

  it("returns 404 for /register when SAVINT_MODE is installation", async () => {
    const middleware = await importMiddleware();
    const req = new NextRequest("http://localhost/register");
    const res = await middleware(req);
    expect(res?.status).toBe(404);
  });

  it("returns 404 for /forgot-password in installation mode", async () => {
    const middleware = await importMiddleware();
    const req = new NextRequest("http://localhost/forgot-password");
    const res = await middleware(req);
    expect(res?.status).toBe(404);
  });

  it("returns 404 for /reset-password in installation mode", async () => {
    const middleware = await importMiddleware();
    const req = new NextRequest("http://localhost/reset-password");
    const res = await middleware(req);
    expect(res?.status).toBe(404);
  });

  it("returns 404 for /account in installation mode", async () => {
    const middleware = await importMiddleware();
    const req = new NextRequest("http://localhost/account");
    const res = await middleware(req);
    expect(res?.status).toBe(404);
  });

  it("returns 404 for /api/hub/* in installation mode", async () => {
    const middleware = await importMiddleware();
    const req = new NextRequest("http://localhost/api/hub/auth/verify?token=x");
    const res = await middleware(req);
    expect(res?.status).toBe(404);
  });

  it("passes through unrelated routes in installation mode", async () => {
    const middleware = await importMiddleware();
    const req = new NextRequest("http://localhost/dashboard");
    const res = await middleware(req);
    expect(res?.status).not.toBe(404);
  });

  it("passes through hub routes when SAVINT_MODE=hub", async () => {
    process.env.SAVINT_MODE = "hub";
    const middleware = await importMiddleware();
    const req = new NextRequest("http://localhost/register");
    const res = await middleware(req);
    expect(res?.status).not.toBe(404);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run tests/unit/hub/middleware.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement**

Create `src/middleware.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { isHubMode } from "@/lib/config/savint-mode";

const HUB_ONLY_PREFIXES = [
  "/register",
  "/forgot-password",
  "/reset-password",
  "/account",
  "/verify-email-sent",
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
    "/register/:path*",
    "/forgot-password/:path*",
    "/reset-password/:path*",
    "/account/:path*",
    "/verify-email-sent/:path*",
    "/api/hub/:path*",
  ],
};
```

- [ ] **Step 4: Run and confirm pass**

```bash
npx vitest run tests/unit/hub/middleware.test.ts
```

Expected: 7 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts tests/unit/hub/middleware.test.ts
git commit -m "feat(hub): 404 hub-only routes when SAVINT_MODE is not hub"
```

---

## Task 9: Register page + server action

**Files:**
- Create: `src/app/(hub)/register/actions.ts`
- Create: `src/app/(hub)/register/page.tsx`
- Create: `src/app/(hub)/verify-email-sent/page.tsx`
- Create: `tests/unit/hub/register-action.test.ts`

- [ ] **Step 1: Write failing test for `registerHubAccount`**

Create `tests/unit/hub/register-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const hub = {
  findUnique: vi.fn(),
  create: vi.fn(),
};
const sendVerificationEmail = vi.fn().mockResolvedValue(undefined);
const issueToken = vi.fn().mockResolvedValue({
  plainToken: "tok-plain",
  expiresAt: new Date(Date.now() + 1000),
});

vi.mock("@/lib/db/client", () => ({ prisma: { hubAccount: hub } }));
vi.mock("@/lib/email/send", () => ({ sendVerificationEmail }));
vi.mock("@/lib/auth/verification-token", () => ({ issueToken }));

beforeEach(() => {
  hub.findUnique.mockReset();
  hub.create.mockReset();
  sendVerificationEmail.mockClear();
  issueToken.mockClear();
  process.env.HUB_BASE_URL = "https://savint.it";
});

describe("registerHubAccount", () => {
  it("rejects invalid email", async () => {
    const { registerHubAccount } = await import("@/app/(hub)/register/actions");
    const out = await registerHubAccount({ email: "not-an-email", password: "password1", name: "X", locale: "it" });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("invalid_email");
  });

  it("rejects short password", async () => {
    const { registerHubAccount } = await import("@/app/(hub)/register/actions");
    const out = await registerHubAccount({ email: "u@x.com", password: "short", name: "X", locale: "it" });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("weak_password");
  });

  it("rejects when email already registered with password (returns ok-shaped to avoid enumeration)", async () => {
    hub.findUnique.mockResolvedValue({ id: "a", email: "u@x.com", authMethod: "PASSWORD" });
    const { registerHubAccount } = await import("@/app/(hub)/register/actions");
    const out = await registerHubAccount({ email: "u@x.com", password: "password1", name: "X", locale: "it" });
    expect(out.ok).toBe(true);
    expect(hub.create).not.toHaveBeenCalled();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("creates a HubAccount with PASSWORD method and sends verification email", async () => {
    hub.findUnique.mockResolvedValue(null);
    hub.create.mockResolvedValue({ id: "new-id", email: "u@x.com" });
    const { registerHubAccount } = await import("@/app/(hub)/register/actions");
    const out = await registerHubAccount({ email: "U@X.com", password: "password1", name: "Tina", locale: "it" });
    expect(out.ok).toBe(true);
    expect(hub.create).toHaveBeenCalledTimes(1);
    const data = hub.create.mock.calls[0][0].data;
    expect(data.email).toBe("u@x.com");
    expect(data.name).toBe("Tina");
    expect(data.authMethod).toBe("PASSWORD");
    expect(data.linkedProviders).toEqual(["password"]);
    expect(data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(issueToken).toHaveBeenCalledWith("new-id", "VERIFY_EMAIL");
    expect(sendVerificationEmail).toHaveBeenCalledWith({
      to: "u@x.com",
      link: expect.stringContaining("https://savint.it/savint/api/hub/auth/verify?token=tok-plain"),
      locale: "it",
    });
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run tests/unit/hub/register-action.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement server action**

Create `src/app/(hub)/register/actions.ts`:

```ts
"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { issueToken } from "@/lib/auth/verification-token";
import { sendVerificationEmail } from "@/lib/email/send";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(120),
  locale: z.enum(["it", "en"]).default("it"),
});

export type RegisterInput = z.infer<typeof schema>;
export type RegisterResult =
  | { ok: true }
  | { ok: false; error: "invalid_email" | "weak_password" | "invalid_name" | "internal_error" };

function hubBaseUrl(): string {
  const base = process.env.HUB_BASE_URL ?? "https://savint.it";
  return base.replace(/\/$/, "");
}

export async function registerHubAccount(input: RegisterInput): Promise<RegisterResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === "email") return { ok: false, error: "invalid_email" };
    if (issue?.path[0] === "password") return { ok: false, error: "weak_password" };
    if (issue?.path[0] === "name") return { ok: false, error: "invalid_name" };
    return { ok: false, error: "internal_error" };
  }
  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.hubAccount.findUnique({ where: { email } });
  if (existing) {
    // Do not reveal that the email is already taken (prevents enumeration).
    // Real users who already have a password account will go to /login and use
    // /forgot-password if needed.
    return { ok: true };
  }
  const passwordHash = await hashPassword(parsed.data.password);
  const created = await prisma.hubAccount.create({
    data: {
      email,
      name: parsed.data.name,
      authMethod: "PASSWORD",
      passwordHash,
      linkedProviders: ["password"],
    },
  });
  const { plainToken } = await issueToken(created.id, "VERIFY_EMAIL");
  const link = `${hubBaseUrl()}/savint/api/hub/auth/verify?token=${plainToken}`;
  await sendVerificationEmail({ to: email, link, locale: parsed.data.locale });
  return { ok: true };
}
```

- [ ] **Step 4: Implement the page**

Create `src/app/(hub)/register/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { registerHubAccount } from "./actions";
import { isHubMode } from "@/lib/config/savint-mode";

export default async function RegisterPage() {
  if (!isHubMode()) {
    redirect("/login");
  }
  const t = await getTranslations("hubAuth");

  async function action(formData: FormData) {
    "use server";
    const locale = (await getLocale()) as "it" | "en";
    const out = await registerHubAccount({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      name: String(formData.get("name") ?? ""),
      locale: locale === "en" ? "en" : "it",
    });
    if (!out.ok) {
      redirect(`/register?error=${out.error}`);
    }
    redirect("/verify-email-sent");
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800 p-4">
      <form action={action} className="w-full max-w-sm space-y-3 rounded-xl bg-white p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-gray-900">{t("registerTitle")}</h1>
        <label className="block text-sm">
          <span className="text-gray-700">{t("nameLabel")}</span>
          <input name="name" required minLength={1} maxLength={120} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-700">{t("emailLabel")}</span>
          <input name="email" type="email" required className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-700">{t("passwordLabel")}</span>
          <input name="password" type="password" required minLength={8} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <button type="submit" className="w-full rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">
          {t("registerSubmit")}
        </button>
        <p className="pt-2 text-center text-sm text-gray-600">
          <a href="/login" className="text-blue-700 underline">{t("hasAccountLogin")}</a>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Implement "check your inbox" page**

Create `src/app/(hub)/verify-email-sent/page.tsx`:

```tsx
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { isHubMode } from "@/lib/config/savint-mode";

export default async function VerifyEmailSentPage() {
  if (!isHubMode()) redirect("/login");
  const t = await getTranslations("hubAuth");
  return (
    <div className="flex h-dvh items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
        <h1 className="text-xl font-semibold text-gray-900">{t("checkInboxTitle")}</h1>
        <p className="mt-3 text-sm text-gray-700">{t("checkInboxBody")}</p>
        <p className="mt-4">
          <a href="/login" className="text-blue-700 underline">{t("backToLogin")}</a>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run and confirm pass**

```bash
npx vitest run tests/unit/hub/register-action.test.ts
```

Expected: 4 passing tests.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(hub)/register" "src/app/(hub)/verify-email-sent" tests/unit/hub/register-action.test.ts
git commit -m "feat(hub): /register page with email verification"
```

---

## Task 10: Hub login page (Google + password)

**Files:**
- Create: `src/app/(hub)/login/actions.ts`
- Create: `src/app/(hub)/login/page.tsx`
- Create: `tests/unit/hub/login-page.test.tsx`

- [ ] **Step 1: Write failing test**

Create `tests/unit/hub/login-page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import HubLoginPage from "@/app/(hub)/login/page";
import messages from "@/messages/en.json";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

beforeEach(() => {
  process.env.NEXT_PUBLIC_SAVINT_MODE = "hub";
});

describe("HubLoginPage", () => {
  it("renders both Google and email/password fields", () => {
    const { getByText, getByLabelText } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <HubLoginPage />
      </NextIntlClientProvider>,
    );
    expect(getByText(/sign in with google/i)).toBeTruthy();
    expect(getByLabelText(/email/i)).toBeTruthy();
    expect(getByLabelText(/password/i)).toBeTruthy();
  });

  it("links to /register and /forgot-password", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <HubLoginPage />
      </NextIntlClientProvider>,
    );
    const links = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(links).toContain("/register");
    expect(links).toContain("/forgot-password");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run tests/unit/hub/login-page.test.tsx
```

Expected: module not found.

- [ ] **Step 3: Implement page (client component)**

Create `src/app/(hub)/login/page.tsx`:

```tsx
"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { withBasePath } from "@/lib/base-path";

export default function HubLoginPage() {
  const t = useTranslations("hubAuth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await signIn("hub-credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/savint/account",
    });
    setSubmitting(false);
    if (res?.error) {
      setError(t("invalidCredentials"));
      return;
    }
    if (res?.url) window.location.href = res.url;
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <img src={withBasePath("/logo_savint.png")} alt="SAVINT" className="mx-auto h-16 w-16 object-contain" />
        <button
          onClick={() => signIn("google", { callbackUrl: "/savint/account" })}
          className="w-full rounded bg-white px-4 py-2 font-semibold text-blue-800 ring-1 ring-blue-300 hover:bg-blue-50"
          type="button"
        >
          {t("loginWithGoogle")}
        </button>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="h-px flex-1 bg-gray-200" />
          <span>{t("or")}</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-700">{t("emailLabel")}</span>
            <input
              aria-label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">{t("passwordLabel")}</span>
            <input
              aria-label="Password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {submitting ? t("submitting") : t("loginSubmit")}
          </button>
        </form>
        <div className="flex justify-between text-sm">
          <a href="/forgot-password" className="text-blue-700 underline">{t("forgotPasswordLink")}</a>
          <a href="/register" className="text-blue-700 underline">{t("registerLink")}</a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create placeholder action file (used in later tasks)**

Create `src/app/(hub)/login/actions.ts`:

```ts
"use server";

// Reserved for server-side login workflows (e.g. resending verification).
// Credentials login is handled directly by NextAuth (`signIn("hub-credentials")`).
export async function noop() {
  return { ok: true } as const;
}
```

- [ ] **Step 5: Add i18n keys (placeholder)**

The full i18n strings are added in Task 16. For now temporarily add the minimum needed for the render test by editing `src/messages/en.json` to include in `hubAuth`: `loginWithGoogle`, `or`, `emailLabel`, `passwordLabel`, `loginSubmit`, `submitting`, `forgotPasswordLink`, `registerLink`, `invalidCredentials`. (See Task 16 for the full final set; values here can be the same.)

- [ ] **Step 6: Run and confirm pass**

```bash
npx vitest run tests/unit/hub/login-page.test.tsx
```

Expected: 2 passing tests.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(hub)/login" tests/unit/hub/login-page.test.tsx src/messages/en.json src/messages/it.json
git commit -m "feat(hub): /login page with Google and email/password"
```

---

## Task 11: Email verification API endpoint

**Files:**
- Create: `src/app/api/hub/auth/verify/route.ts`
- Create: `tests/unit/hub/verify-route.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/hub/verify-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const consumeToken = vi.fn();
const hubUpdate = vi.fn();

vi.mock("@/lib/auth/verification-token", () => ({ consumeToken }));
vi.mock("@/lib/db/client", () => ({
  prisma: { hubAccount: { update: hubUpdate } },
}));

beforeEach(() => {
  consumeToken.mockReset();
  hubUpdate.mockReset();
});

describe("GET /api/hub/auth/verify", () => {
  it("redirects to /login?verified=1 on success and sets emailVerified", async () => {
    consumeToken.mockResolvedValue({ hubAccountId: "acct-1" });
    hubUpdate.mockResolvedValue({});
    const { GET } = await import("@/app/api/hub/auth/verify/route");
    const res = await GET(new Request("http://localhost/savint/api/hub/auth/verify?token=abc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?verified=1");
    expect(consumeToken).toHaveBeenCalledWith("abc", "VERIFY_EMAIL");
    expect(hubUpdate).toHaveBeenCalledWith({
      where: { id: "acct-1" },
      data: { emailVerified: expect.any(Date) },
    });
  });

  it("redirects to /login?verified=0 on invalid/expired token", async () => {
    consumeToken.mockResolvedValue(null);
    const { GET } = await import("@/app/api/hub/auth/verify/route");
    const res = await GET(new Request("http://localhost/savint/api/hub/auth/verify?token=bad"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?verified=0");
    expect(hubUpdate).not.toHaveBeenCalled();
  });

  it("redirects to /login?verified=0 when token query param is missing", async () => {
    const { GET } = await import("@/app/api/hub/auth/verify/route");
    const res = await GET(new Request("http://localhost/savint/api/hub/auth/verify"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?verified=0");
    expect(consumeToken).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run tests/unit/hub/verify-route.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement**

Create `src/app/api/hub/auth/verify/route.ts`:

```ts
import { NextResponse } from "next/server";
import { consumeToken } from "@/lib/auth/verification-token";
import { prisma } from "@/lib/db/client";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const base = url.origin;
  if (!token) {
    return NextResponse.redirect(`${base}/savint/login?verified=0`);
  }
  const result = await consumeToken(token, "VERIFY_EMAIL");
  if (!result) {
    return NextResponse.redirect(`${base}/savint/login?verified=0`);
  }
  await prisma.hubAccount.update({
    where: { id: result.hubAccountId },
    data: { emailVerified: new Date() },
  });
  return NextResponse.redirect(`${base}/savint/login?verified=1`);
}
```

- [ ] **Step 4: Run and confirm pass**

```bash
npx vitest run tests/unit/hub/verify-route.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/hub/auth/verify" tests/unit/hub/verify-route.test.ts
git commit -m "feat(hub): email verification endpoint"
```

---

## Task 12: Forgot-password + reset-password flow

**Files:**
- Create: `src/app/(hub)/forgot-password/page.tsx`
- Create: `src/app/(hub)/forgot-password/actions.ts`
- Create: `src/app/(hub)/reset-password/page.tsx`
- Create: `src/app/(hub)/reset-password/actions.ts`
- Create: `tests/unit/hub/forgot-password-action.test.ts`
- Create: `tests/unit/hub/reset-password-action.test.ts`

- [ ] **Step 1: Write failing test for forgot-password action**

Create `tests/unit/hub/forgot-password-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const hub = { findUnique: vi.fn() };
const issueToken = vi.fn().mockResolvedValue({
  plainToken: "tok-reset",
  expiresAt: new Date(Date.now() + 1000),
});
const sendPasswordResetEmail = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/db/client", () => ({ prisma: { hubAccount: hub } }));
vi.mock("@/lib/auth/verification-token", () => ({ issueToken }));
vi.mock("@/lib/email/send", () => ({ sendPasswordResetEmail }));

beforeEach(() => {
  hub.findUnique.mockReset();
  sendPasswordResetEmail.mockClear();
  issueToken.mockClear();
  process.env.HUB_BASE_URL = "https://savint.it";
});

describe("requestPasswordReset", () => {
  it("returns ok and sends an email when the account exists with PASSWORD method", async () => {
    hub.findUnique.mockResolvedValue({ id: "acct-1", email: "u@x.com", authMethod: "PASSWORD" });
    const { requestPasswordReset } = await import("@/app/(hub)/forgot-password/actions");
    const out = await requestPasswordReset({ email: "u@x.com", locale: "it" });
    expect(out.ok).toBe(true);
    expect(issueToken).toHaveBeenCalledWith("acct-1", "RESET_PASSWORD");
    expect(sendPasswordResetEmail).toHaveBeenCalledWith({
      to: "u@x.com",
      link: expect.stringContaining("https://savint.it/savint/reset-password?token=tok-reset"),
      locale: "it",
    });
  });

  it("returns ok but does NOT send an email when account does not exist (no enumeration)", async () => {
    hub.findUnique.mockResolvedValue(null);
    const { requestPasswordReset } = await import("@/app/(hub)/forgot-password/actions");
    const out = await requestPasswordReset({ email: "absent@x.com", locale: "it" });
    expect(out.ok).toBe(true);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("returns ok but does NOT send when authMethod is GOOGLE", async () => {
    hub.findUnique.mockResolvedValue({ id: "acct-2", email: "g@x.com", authMethod: "GOOGLE" });
    const { requestPasswordReset } = await import("@/app/(hub)/forgot-password/actions");
    const out = await requestPasswordReset({ email: "g@x.com", locale: "it" });
    expect(out.ok).toBe(true);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write failing test for reset-password action**

Create `tests/unit/hub/reset-password-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const consumeToken = vi.fn();
const hubUpdate = vi.fn();

vi.mock("@/lib/auth/verification-token", () => ({ consumeToken }));
vi.mock("@/lib/db/client", () => ({ prisma: { hubAccount: { update: hubUpdate } } }));

beforeEach(() => {
  consumeToken.mockReset();
  hubUpdate.mockReset();
});

describe("resetPassword", () => {
  it("returns invalid_token when token is rejected", async () => {
    consumeToken.mockResolvedValue(null);
    const { resetPassword } = await import("@/app/(hub)/reset-password/actions");
    const out = await resetPassword({ token: "x", newPassword: "password1" });
    expect(out).toEqual({ ok: false, error: "invalid_token" });
    expect(hubUpdate).not.toHaveBeenCalled();
  });

  it("returns weak_password for short passwords", async () => {
    const { resetPassword } = await import("@/app/(hub)/reset-password/actions");
    const out = await resetPassword({ token: "x".repeat(40), newPassword: "short" });
    expect(out).toEqual({ ok: false, error: "weak_password" });
    expect(consumeToken).not.toHaveBeenCalled();
  });

  it("updates the account password on success", async () => {
    consumeToken.mockResolvedValue({ hubAccountId: "acct-1" });
    hubUpdate.mockResolvedValue({});
    const { resetPassword } = await import("@/app/(hub)/reset-password/actions");
    const out = await resetPassword({ token: "x".repeat(40), newPassword: "newpassword1" });
    expect(out).toEqual({ ok: true });
    expect(hubUpdate).toHaveBeenCalledTimes(1);
    const data = hubUpdate.mock.calls[0][0].data;
    expect(data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });
});
```

- [ ] **Step 3: Run both tests, confirm failure**

```bash
npx vitest run tests/unit/hub/forgot-password-action.test.ts tests/unit/hub/reset-password-action.test.ts
```

Expected: module not found.

- [ ] **Step 4: Implement forgot-password action**

Create `src/app/(hub)/forgot-password/actions.ts`:

```ts
"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { issueToken } from "@/lib/auth/verification-token";
import { sendPasswordResetEmail } from "@/lib/email/send";

const schema = z.object({
  email: z.string().email(),
  locale: z.enum(["it", "en"]).default("it"),
});

function hubBaseUrl(): string {
  return (process.env.HUB_BASE_URL ?? "https://savint.it").replace(/\/$/, "");
}

export async function requestPasswordReset(input: z.input<typeof schema>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: true } as const; // do not leak
  const email = parsed.data.email.toLowerCase();
  const acct = await prisma.hubAccount.findUnique({ where: { email } });
  // Always return ok to avoid enumeration. Only send when a PASSWORD-method account exists.
  if (!acct || acct.authMethod !== "PASSWORD") {
    return { ok: true } as const;
  }
  const { plainToken } = await issueToken(acct.id, "RESET_PASSWORD");
  const link = `${hubBaseUrl()}/savint/reset-password?token=${plainToken}`;
  await sendPasswordResetEmail({ to: email, link, locale: parsed.data.locale });
  return { ok: true } as const;
}
```

- [ ] **Step 5: Implement reset-password action**

Create `src/app/(hub)/reset-password/actions.ts`:

```ts
"use server";

import { z } from "zod";
import { consumeToken } from "@/lib/auth/verification-token";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";

const schema = z.object({
  token: z.string().min(32),
  newPassword: z.string().min(8),
});

export type ResetResult =
  | { ok: true }
  | { ok: false; error: "invalid_token" | "weak_password" };

export async function resetPassword(input: z.input<typeof schema>): Promise<ResetResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === "newPassword") return { ok: false, error: "weak_password" };
    return { ok: false, error: "invalid_token" };
  }
  const result = await consumeToken(parsed.data.token, "RESET_PASSWORD");
  if (!result) return { ok: false, error: "invalid_token" };
  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.hubAccount.update({
    where: { id: result.hubAccountId },
    data: { passwordHash },
  });
  return { ok: true };
}
```

- [ ] **Step 6: Implement forgot-password page**

Create `src/app/(hub)/forgot-password/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { isHubMode } from "@/lib/config/savint-mode";
import { requestPasswordReset } from "./actions";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  if (!isHubMode()) redirect("/login");
  const t = await getTranslations("hubAuth");
  const { sent } = await searchParams;

  async function action(formData: FormData) {
    "use server";
    const locale = (await getLocale()) as "it" | "en";
    await requestPasswordReset({
      email: String(formData.get("email") ?? ""),
      locale: locale === "en" ? "en" : "it",
    });
    redirect("/forgot-password?sent=1");
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800 p-4">
      <form action={action} className="w-full max-w-sm space-y-3 rounded-xl bg-white p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-gray-900">{t("forgotTitle")}</h1>
        <p className="text-sm text-gray-700">{t("forgotIntro")}</p>
        {sent === "1" && <p className="rounded bg-green-50 p-2 text-sm text-green-800">{t("forgotSent")}</p>}
        <label className="block text-sm">
          <span className="text-gray-700">{t("emailLabel")}</span>
          <input name="email" type="email" required className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <button type="submit" className="w-full rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">
          {t("forgotSubmit")}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 7: Implement reset-password page**

Create `src/app/(hub)/reset-password/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isHubMode } from "@/lib/config/savint-mode";
import { resetPassword } from "./actions";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  if (!isHubMode()) redirect("/login");
  const t = await getTranslations("hubAuth");
  const { token, error } = await searchParams;

  if (!token) {
    return (
      <div className="flex h-dvh items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800 p-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
          <p className="text-sm text-red-700">{t("resetInvalidToken")}</p>
        </div>
      </div>
    );
  }

  async function action(formData: FormData) {
    "use server";
    const out = await resetPassword({
      token: String(formData.get("token") ?? ""),
      newPassword: String(formData.get("newPassword") ?? ""),
    });
    if (!out.ok) {
      redirect(`/reset-password?token=${encodeURIComponent(String(formData.get("token") ?? ""))}&error=${out.error}`);
    }
    redirect("/login?reset=1");
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800 p-4">
      <form action={action} className="w-full max-w-sm space-y-3 rounded-xl bg-white p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-gray-900">{t("resetTitle")}</h1>
        <input type="hidden" name="token" value={token} />
        {error === "weak_password" && <p className="text-sm text-red-600">{t("weakPassword")}</p>}
        {error === "invalid_token" && <p className="text-sm text-red-600">{t("resetInvalidToken")}</p>}
        <label className="block text-sm">
          <span className="text-gray-700">{t("newPasswordLabel")}</span>
          <input name="newPassword" type="password" required minLength={8} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <button type="submit" className="w-full rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">
          {t("resetSubmit")}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 8: Run both tests and confirm pass**

```bash
npx vitest run tests/unit/hub/forgot-password-action.test.ts tests/unit/hub/reset-password-action.test.ts
```

Expected: 3 + 3 passing tests.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(hub)/forgot-password" "src/app/(hub)/reset-password" tests/unit/hub/forgot-password-action.test.ts tests/unit/hub/reset-password-action.test.ts
git commit -m "feat(hub): forgot-password and reset-password flow"
```

---

## Task 13: `/account` page (profile, password change, providers)

**Files:**
- Create: `src/app/(hub)/account/actions.ts`
- Create: `src/app/(hub)/account/page.tsx`
- Create: `tests/unit/hub/account-actions.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/hub/account-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const hub = {
  findUnique: vi.fn(),
  update: vi.fn(),
};
const authFn = vi.fn();

vi.mock("@/lib/db/client", () => ({ prisma: { hubAccount: hub } }));
vi.mock("@/lib/auth/config", () => ({ auth: authFn }));

beforeEach(() => {
  hub.findUnique.mockReset();
  hub.update.mockReset();
  authFn.mockReset();
});

describe("account actions: updateProfile", () => {
  it("rejects when unauthenticated", async () => {
    authFn.mockResolvedValue(null);
    const { updateProfile } = await import("@/app/(hub)/account/actions");
    const out = await updateProfile({ name: "New", affiliation: "Liceo Galilei" });
    expect(out).toEqual({ ok: false, error: "unauthorized" });
  });

  it("updates name and affiliation for the current account", async () => {
    authFn.mockResolvedValue({ user: { id: "acct-1" } });
    hub.update.mockResolvedValue({});
    const { updateProfile } = await import("@/app/(hub)/account/actions");
    const out = await updateProfile({ name: "Tina B.", affiliation: "Liceo Galilei, Padova" });
    expect(out).toEqual({ ok: true });
    expect(hub.update).toHaveBeenCalledWith({
      where: { id: "acct-1" },
      data: { name: "Tina B.", affiliation: "Liceo Galilei, Padova" },
    });
  });
});

describe("account actions: changePassword", () => {
  it("rejects when unauthenticated", async () => {
    authFn.mockResolvedValue(null);
    const { changePassword } = await import("@/app/(hub)/account/actions");
    const out = await changePassword({ currentPassword: "x", newPassword: "newpassword1" });
    expect(out).toEqual({ ok: false, error: "unauthorized" });
  });

  it("returns wrong_password when current does not match", async () => {
    const { hashPassword } = await import("@/lib/auth/password");
    const realHash = await hashPassword("password1");
    authFn.mockResolvedValue({ user: { id: "acct-1" } });
    hub.findUnique.mockResolvedValue({ id: "acct-1", authMethod: "PASSWORD", passwordHash: realHash });
    const { changePassword } = await import("@/app/(hub)/account/actions");
    const out = await changePassword({ currentPassword: "wrong", newPassword: "newpassword1" });
    expect(out).toEqual({ ok: false, error: "wrong_password" });
    expect(hub.update).not.toHaveBeenCalled();
  });

  it("updates password on success", async () => {
    const { hashPassword } = await import("@/lib/auth/password");
    const realHash = await hashPassword("password1");
    authFn.mockResolvedValue({ user: { id: "acct-1" } });
    hub.findUnique.mockResolvedValue({ id: "acct-1", authMethod: "PASSWORD", passwordHash: realHash });
    hub.update.mockResolvedValue({});
    const { changePassword } = await import("@/app/(hub)/account/actions");
    const out = await changePassword({ currentPassword: "password1", newPassword: "newpassword1" });
    expect(out).toEqual({ ok: true });
    expect(hub.update).toHaveBeenCalledTimes(1);
    const data = hub.update.mock.calls[0][0].data;
    expect(data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("rejects when authMethod is GOOGLE-only (no password to change)", async () => {
    authFn.mockResolvedValue({ user: { id: "acct-1" } });
    hub.findUnique.mockResolvedValue({ id: "acct-1", authMethod: "GOOGLE", passwordHash: null });
    const { changePassword } = await import("@/app/(hub)/account/actions");
    const out = await changePassword({ currentPassword: "anything", newPassword: "newpassword1" });
    expect(out).toEqual({ ok: false, error: "not_password_account" });
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run tests/unit/hub/account-actions.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement server actions**

Create `src/app/(hub)/account/actions.ts`:

```ts
"use server";

import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

const profileSchema = z.object({
  name: z.string().min(1).max(120),
  affiliation: z.string().max(200).optional().nullable(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

type UpdateProfileResult = { ok: true } | { ok: false; error: "unauthorized" | "invalid" };
type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: "unauthorized" | "wrong_password" | "weak_password" | "not_password_account" };

export async function updateProfile(input: z.input<typeof profileSchema>): Promise<UpdateProfileResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "unauthorized" };
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await prisma.hubAccount.update({
    where: { id: session.user.id },
    data: {
      name: parsed.data.name,
      affiliation: parsed.data.affiliation ?? null,
    },
  });
  return { ok: true };
}

export async function changePassword(input: z.input<typeof passwordSchema>): Promise<ChangePasswordResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "unauthorized" };
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "weak_password" };
  const acct = await prisma.hubAccount.findUnique({ where: { id: session.user.id } });
  if (!acct || acct.authMethod !== "PASSWORD" || !acct.passwordHash) {
    return { ok: false, error: "not_password_account" };
  }
  const ok = await verifyPassword(parsed.data.currentPassword, acct.passwordHash);
  if (!ok) return { ok: false, error: "wrong_password" };
  const newHash = await hashPassword(parsed.data.newPassword);
  await prisma.hubAccount.update({
    where: { id: acct.id },
    data: { passwordHash: newHash },
  });
  return { ok: true };
}
```

- [ ] **Step 4: Implement the page**

Create `src/app/(hub)/account/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isHubMode } from "@/lib/config/savint-mode";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { updateProfile, changePassword } from "./actions";

export default async function AccountPage() {
  if (!isHubMode()) redirect("/login");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const t = await getTranslations("hubAccount");
  const acct = await prisma.hubAccount.findUnique({ where: { id: session.user.id } });
  if (!acct) redirect("/login");

  async function profileAction(formData: FormData) {
    "use server";
    await updateProfile({
      name: String(formData.get("name") ?? ""),
      affiliation: String(formData.get("affiliation") ?? "") || null,
    });
  }
  async function passwordAction(formData: FormData) {
    "use server";
    await changePassword({
      currentPassword: String(formData.get("currentPassword") ?? ""),
      newPassword: String(formData.get("newPassword") ?? ""),
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold text-gray-900">{t("title")}</h1>

      <section className="space-y-3 rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold">{t("profileSection")}</h2>
        <form action={profileAction} className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-700">{t("nameLabel")}</span>
            <input name="name" defaultValue={acct.name ?? ""} required className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">{t("affiliationLabel")}</span>
            <input
              name="affiliation"
              defaultValue={acct.affiliation ?? ""}
              maxLength={200}
              placeholder={t("affiliationPlaceholder")}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </label>
          <button type="submit" className="rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">
            {t("saveProfile")}
          </button>
        </form>
      </section>

      <section className="space-y-3 rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold">{t("providersSection")}</h2>
        <ul className="list-inside list-disc text-sm text-gray-700">
          {acct.linkedProviders.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>

      {acct.authMethod === "PASSWORD" && (
        <section className="space-y-3 rounded-xl bg-white p-6 shadow">
          <h2 className="text-lg font-semibold">{t("passwordSection")}</h2>
          <form action={passwordAction} className="space-y-3">
            <label className="block text-sm">
              <span className="text-gray-700">{t("currentPasswordLabel")}</span>
              <input name="currentPassword" type="password" required className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">{t("newPasswordLabel")}</span>
              <input name="newPassword" type="password" required minLength={8} className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            <button type="submit" className="rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">
              {t("changePasswordSubmit")}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run and confirm pass**

```bash
npx vitest run tests/unit/hub/account-actions.test.ts
```

Expected: 6 passing tests.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(hub)/account" tests/unit/hub/account-actions.test.ts
git commit -m "feat(hub): /account page with profile and password change"
```

---

## Task 14: Rate-limit helper (in-memory sliding window)

**Files:**
- Create: `src/lib/rate-limit/hub-rate-limit.ts`
- Create: `src/lib/rate-limit/__tests__/hub-rate-limit.test.ts`
- Modify: `src/app/(hub)/register/actions.ts` (apply limit)
- Modify: `src/app/(hub)/forgot-password/actions.ts` (apply limit)

- [ ] **Step 1: Write failing test**

Create `src/lib/rate-limit/__tests__/hub-rate-limit.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { consume, _resetForTests } from "../hub-rate-limit";

beforeEach(() => {
  _resetForTests();
});

describe("hub-rate-limit consume", () => {
  it("allows up to `limit` calls within window", () => {
    for (let i = 0; i < 3; i++) {
      expect(consume({ key: "k", limit: 3, windowMs: 1_000 }).allowed).toBe(true);
    }
    expect(consume({ key: "k", limit: 3, windowMs: 1_000 }).allowed).toBe(false);
  });

  it("resets after the window expires", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(0));
      for (let i = 0; i < 3; i++) consume({ key: "k", limit: 3, windowMs: 1_000 });
      expect(consume({ key: "k", limit: 3, windowMs: 1_000 }).allowed).toBe(false);
      vi.setSystemTime(new Date(2_000));
      expect(consume({ key: "k", limit: 3, windowMs: 1_000 }).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keys are independent", () => {
    expect(consume({ key: "a", limit: 1, windowMs: 1_000 }).allowed).toBe(true);
    expect(consume({ key: "b", limit: 1, windowMs: 1_000 }).allowed).toBe(true);
    expect(consume({ key: "a", limit: 1, windowMs: 1_000 }).allowed).toBe(false);
  });

  it("reports remaining and retryAfterMs", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(0));
      const r1 = consume({ key: "k", limit: 2, windowMs: 1_000 });
      expect(r1).toMatchObject({ allowed: true, remaining: 1 });
      const r2 = consume({ key: "k", limit: 2, windowMs: 1_000 });
      expect(r2).toMatchObject({ allowed: true, remaining: 0 });
      const r3 = consume({ key: "k", limit: 2, windowMs: 1_000 });
      expect(r3.allowed).toBe(false);
      expect(r3.retryAfterMs).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run src/lib/rate-limit/__tests__/hub-rate-limit.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement**

Create `src/lib/rate-limit/hub-rate-limit.ts`:

```ts
/**
 * In-memory sliding-window rate limiter.
 *
 * NOTE: Plan 5 replaces this with a Postgres-backed implementation
 * (the HubRateLimit table from spec Section 9). The interface stays the same.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface ConsumeArgs {
  key: string;
  limit: number;
  windowMs: number;
}

export interface ConsumeResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function consume({ key, limit, windowMs }: ConsumeArgs): ConsumeResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }
  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: windowMs - (now - bucket.windowStart),
    };
  }
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfterMs: 0 };
}

export function _resetForTests() {
  buckets.clear();
}

// Limits from spec Section 9.
export const HUB_LIMITS = {
  REGISTER: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5/hour
  LOGIN_PASSWORD: { limit: 10, windowMs: 60 * 60 * 1000 }, // 10/hour
  FORGOT_PASSWORD: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5/hour
} as const;
```

- [ ] **Step 4: Apply the limit to the register action**

In `src/app/(hub)/register/actions.ts`, add at the top after imports:

```ts
import { headers } from "next/headers";
import { consume, HUB_LIMITS } from "@/lib/rate-limit/hub-rate-limit";
```

Add to `RegisterResult`:

```ts
  | { ok: false; error: "invalid_email" | "weak_password" | "invalid_name" | "internal_error" | "rate_limited" };
```

At the start of `registerHubAccount`, before the `safeParse`:

```ts
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
  const rl = consume({ key: `register:${ip}`, ...HUB_LIMITS.REGISTER });
  if (!rl.allowed) return { ok: false, error: "rate_limited" };
```

- [ ] **Step 5: Apply the limit to the forgot-password action**

In `src/app/(hub)/forgot-password/actions.ts`, add at the top after imports:

```ts
import { headers } from "next/headers";
import { consume, HUB_LIMITS } from "@/lib/rate-limit/hub-rate-limit";
```

At the start of `requestPasswordReset`, before the `safeParse`:

```ts
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
  const rl = consume({ key: `forgot:${ip}`, ...HUB_LIMITS.FORGOT_PASSWORD });
  if (!rl.allowed) return { ok: true } as const; // silently swallow
```

- [ ] **Step 6: Run the limiter test and confirm pass**

```bash
npx vitest run src/lib/rate-limit/__tests__/hub-rate-limit.test.ts
```

Expected: 4 passing tests.

- [ ] **Step 7: Update the existing register-action test to mock `headers()`**

Add at the top of `tests/unit/hub/register-action.test.ts` (after the existing `vi.mock(...)` calls):

```ts
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-real-ip", "127.0.0.1"]]) as unknown as Headers,
}));

// Reset the limiter between tests so the 5-per-hour cap doesn't bleed across tests.
const { _resetForTests } = await import("@/lib/rate-limit/hub-rate-limit");
beforeEach(() => { _resetForTests(); });
```

Move that import to the top of the file (alongside the other test imports). Same change in `tests/unit/hub/forgot-password-action.test.ts` (with `"forgot:..."` key). The headers mock can be shared; just import once.

- [ ] **Step 8: Run all impacted tests**

```bash
npx vitest run tests/unit/hub/register-action.test.ts tests/unit/hub/forgot-password-action.test.ts src/lib/rate-limit
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/rate-limit "src/app/(hub)/register/actions.ts" "src/app/(hub)/forgot-password/actions.ts" tests/unit/hub/register-action.test.ts tests/unit/hub/forgot-password-action.test.ts
git commit -m "feat(hub): in-memory rate limit for register and forgot-password"
```

---

## Task 15: `.env.example` entries for hub mode

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Append hub-mode block**

Append the following at the end of `.env.example`:

```
# ── SAVINT Hub mode ────────────────────────────────────────────────────────
# Set to "hub" to run this instance as the central savint.it hub.
# Default (or any other value) keeps this instance in installation mode.
# SAVINT_MODE=installation

# Public base URL for hub-generated links (e.g. email verification).
# Required when SAVINT_MODE=hub.
# HUB_BASE_URL=https://savint.it

# Email sender for hub transactional emails. Required when SAVINT_MODE=hub.
# HUB_EMAIL_FROM=noreply@savint.it

# SMTP configuration for nodemailer. Required when SAVINT_MODE=hub.
# HUB_SMTP_HOST=smtp.mailgun.org
# HUB_SMTP_PORT=587
# HUB_SMTP_SECURE=false
# HUB_SMTP_USER=postmaster@mg.savint.it
# HUB_SMTP_PASS=<secret>

# Salt for one-way IP hashing (PracticeRun.ipHash, HubReport.reporterIpHash).
# Required when SAVINT_MODE=hub. Generate with: openssl rand -base64 32
# HUB_IP_HASH_SECRET=generate-with-openssl-rand-base64-32
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): document SAVINT_MODE and hub SMTP/email vars"
```

---

## Task 16: i18n strings for `hubAuth`, `hubAccount`, `hubEmail`

**Files:**
- Modify: `src/messages/it.json`
- Modify: `src/messages/en.json`

- [ ] **Step 1: Add to `src/messages/en.json`**

Add the following three top-level namespaces (alongside `login`, `dashboard`, etc.):

```json
"hubAuth": {
  "registerTitle": "Create your savint.it account",
  "registerSubmit": "Create account",
  "loginTitle": "Sign in to savint.it",
  "loginSubmit": "Sign in",
  "submitting": "Signing in…",
  "loginWithGoogle": "Sign in with Google",
  "or": "or",
  "emailLabel": "Email",
  "passwordLabel": "Password",
  "nameLabel": "Full name",
  "forgotPasswordLink": "Forgot password?",
  "registerLink": "Create account",
  "hasAccountLogin": "Already have an account? Sign in",
  "invalidCredentials": "Invalid email or password.",
  "checkInboxTitle": "Check your inbox",
  "checkInboxBody": "We sent you an email with a confirmation link. The link expires in 24 hours.",
  "backToLogin": "Back to sign in",
  "forgotTitle": "Reset your password",
  "forgotIntro": "Enter the email of your savint.it account. We'll send you a link to set a new password.",
  "forgotSubmit": "Send reset link",
  "forgotSent": "If an account exists for that email, a reset link has been sent.",
  "resetTitle": "Set a new password",
  "resetSubmit": "Save new password",
  "newPasswordLabel": "New password",
  "weakPassword": "Password must be at least 8 characters.",
  "resetInvalidToken": "This link is invalid or has expired. Please request a new one."
},
"hubAccount": {
  "title": "Account",
  "profileSection": "Profile",
  "nameLabel": "Display name",
  "affiliationLabel": "Affiliation (school, university)",
  "affiliationPlaceholder": "e.g. Liceo Galilei, Padua",
  "saveProfile": "Save profile",
  "providersSection": "Sign-in methods",
  "passwordSection": "Change password",
  "currentPasswordLabel": "Current password",
  "newPasswordLabel": "New password",
  "changePasswordSubmit": "Update password"
},
"hubEmail": {
  "verifySubject": "Confirm your email address on savint.it",
  "resetSubject": "Reset your password on savint.it"
}
```

- [ ] **Step 2: Add to `src/messages/it.json` (Italian)**

```json
"hubAuth": {
  "registerTitle": "Crea il tuo account savint.it",
  "registerSubmit": "Crea account",
  "loginTitle": "Accedi a savint.it",
  "loginSubmit": "Accedi",
  "submitting": "Accesso in corso…",
  "loginWithGoogle": "Accedi con Google",
  "or": "oppure",
  "emailLabel": "Email",
  "passwordLabel": "Password",
  "nameLabel": "Nome e cognome",
  "forgotPasswordLink": "Password dimenticata?",
  "registerLink": "Crea account",
  "hasAccountLogin": "Hai già un account? Accedi",
  "invalidCredentials": "Email o password non valide.",
  "checkInboxTitle": "Controlla la posta",
  "checkInboxBody": "Ti abbiamo inviato un'email con un link di conferma. Il link scade tra 24 ore.",
  "backToLogin": "Torna all'accesso",
  "forgotTitle": "Reimposta la password",
  "forgotIntro": "Inserisci l'email del tuo account savint.it. Ti invieremo un link per impostare una nuova password.",
  "forgotSubmit": "Invia il link",
  "forgotSent": "Se esiste un account per questa email, abbiamo inviato un link di reset.",
  "resetTitle": "Imposta una nuova password",
  "resetSubmit": "Salva la nuova password",
  "newPasswordLabel": "Nuova password",
  "weakPassword": "La password deve avere almeno 8 caratteri.",
  "resetInvalidToken": "Questo link non è valido o è scaduto. Richiedi un nuovo link."
},
"hubAccount": {
  "title": "Account",
  "profileSection": "Profilo",
  "nameLabel": "Nome visualizzato",
  "affiliationLabel": "Affiliazione (scuola, università)",
  "affiliationPlaceholder": "es. Liceo Galilei, Padova",
  "saveProfile": "Salva profilo",
  "providersSection": "Metodi di accesso",
  "passwordSection": "Cambia password",
  "currentPasswordLabel": "Password attuale",
  "newPasswordLabel": "Nuova password",
  "changePasswordSubmit": "Aggiorna password"
},
"hubEmail": {
  "verifySubject": "Conferma il tuo indirizzo email su savint.it",
  "resetSubject": "Reimposta la tua password su savint.it"
}
```

- [ ] **Step 3: Validate JSON parses**

```bash
node -e "JSON.parse(require('fs').readFileSync('src/messages/en.json','utf8'));JSON.parse(require('fs').readFileSync('src/messages/it.json','utf8'));console.log('OK')"
```

Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add src/messages/it.json src/messages/en.json
git commit -m "i18n(hub): add hubAuth / hubAccount / hubEmail strings (it+en)"
```

---

## Task 17: `scripts/promote-hub-admin.ts`

**Files:**
- Create: `scripts/promote-hub-admin.ts`
- Create: `tests/unit/hub/promote-admin.test.ts`

- [ ] **Step 1: Write failing test (logic-only — script extracted into a helper)**

Create `tests/unit/hub/promote-admin.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const hub = {
  update: vi.fn(),
  findUnique: vi.fn(),
};

vi.mock("@/lib/db/client", () => ({ prisma: { hubAccount: hub } }));

beforeEach(() => {
  hub.update.mockReset();
  hub.findUnique.mockReset();
});

describe("promoteHubAdmin", () => {
  it("throws when email is missing", async () => {
    const { promoteHubAdmin } = await import("../../../scripts/promote-hub-admin");
    await expect(promoteHubAdmin("")).rejects.toThrow(/email/i);
  });

  it("throws when account does not exist", async () => {
    hub.findUnique.mockResolvedValue(null);
    const { promoteHubAdmin } = await import("../../../scripts/promote-hub-admin");
    await expect(promoteHubAdmin("none@x.com")).rejects.toThrow(/no hubaccount/i);
  });

  it("updates role to HUB_ADMIN for the matching email", async () => {
    hub.findUnique.mockResolvedValue({ id: "a-1", email: "x@y.z", role: "HUB_USER" });
    hub.update.mockResolvedValue({ id: "a-1", email: "x@y.z", role: "HUB_ADMIN" });
    const { promoteHubAdmin } = await import("../../../scripts/promote-hub-admin");
    const out = await promoteHubAdmin("X@Y.Z");
    expect(out).toEqual({ id: "a-1", email: "x@y.z", role: "HUB_ADMIN" });
    expect(hub.update).toHaveBeenCalledWith({
      where: { email: "x@y.z" },
      data: { role: "HUB_ADMIN" },
    });
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run tests/unit/hub/promote-admin.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement script**

Create `scripts/promote-hub-admin.ts`:

```ts
import { prisma } from "@/lib/db/client";

/**
 * Promote a HubAccount to HUB_ADMIN by email.
 * Usage: npx tsx scripts/promote-hub-admin.ts <email>
 */
export async function promoteHubAdmin(rawEmail: string) {
  if (!rawEmail) throw new Error("email argument is required");
  const email = rawEmail.toLowerCase();
  const acct = await prisma.hubAccount.findUnique({ where: { email } });
  if (!acct) throw new Error(`No HubAccount found for ${email}`);
  const updated = await prisma.hubAccount.update({
    where: { email },
    data: { role: "HUB_ADMIN" },
  });
  return updated;
}

async function main() {
  const email = process.argv[2];
  const updated = await promoteHubAdmin(email);
  // eslint-disable-next-line no-console
  console.log(`Promoted ${updated.email} to HUB_ADMIN (id=${updated.id})`);
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run and confirm pass**

```bash
npx vitest run tests/unit/hub/promote-admin.test.ts
```

Expected: 3 passing tests.

- [ ] **Step 5: Smoke-check the script can be invoked**

```bash
npx tsx scripts/promote-hub-admin.ts 2>&1 | head -1
```

Expected: error line containing `email argument is required` (because no email was supplied).

- [ ] **Step 6: Commit**

```bash
git add scripts/promote-hub-admin.ts tests/unit/hub/promote-admin.test.ts
git commit -m "feat(hub): scripts/promote-hub-admin.ts to set HUB_ADMIN role"
```

---

## Final verification

Run the entire unit-test suite once to confirm nothing regressed:

```bash
npm run test:run
```

Expected: existing tests + all new tests from this plan pass; no failures.

Also run the linter:

```bash
npm run lint
```

Expected: no new errors introduced by this plan.

---

## Completion checklist

- [ ] All 17 tasks above committed in order.
- [ ] `SAVINT_MODE=hub npm run dev` boots a hub-mode instance.
- [ ] `SAVINT_MODE=installation npm run dev` keeps current behavior (404s on /register, /account etc.).
- [ ] A user can register at `/register`, receive a verification email (visible in mailhog if `HUB_SMTP_HOST=mailhog`), click the link, then sign in at `/login` with email/password.
- [ ] A user can also sign in with Google (creates a HubAccount with `authMethod=GOOGLE`).
- [ ] `/account` shows profile editor, lists `linkedProviders`, and (for PASSWORD accounts) offers a password change form.
- [ ] `/forgot-password` issues a reset link; `/reset-password?token=...` accepts it.
- [ ] `scripts/promote-hub-admin.ts <email>` flips the role to `HUB_ADMIN`.
- [ ] Rate-limit returns `rate_limited`/silent-ok after 5 register attempts / 5 forgot-password attempts per IP per hour.

Plan 3 (publish flow, installation-side `HubLink`, OAuth provider endpoints) starts after this is merged.
