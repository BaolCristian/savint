# SAVINT Hub — Plan 3: Publish Flow (OAuth + Publish API)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **READ FIRST:** [`2026-05-17-savint-hub-00-integration-contract.md`](./2026-05-17-savint-hub-00-integration-contract.md). Most relevant overrides for this plan: (a) use `hubRateLimit({ key, windowSeconds, max })` everywhere (drop `enforceHubRateLimit(key, limit, windowSeconds)`); (b) `SUBJECT_SLUGS` is a `ReadonlySet<string>` — use `.has(s)`, not `.includes(s)`; (c) add `HubAccount` back-relations (`quizzes`, `accessTokens`, `verificationTokens`) when introducing `HubQuiz`/`HubAccessToken`; (d) the installation `/account/hub-link` page is unaffected by the hub `/hub-*` renaming.

**Goal:** Allow a teacher to link their hub account from their SAVINT installation via OAuth and publish/update a quiz to savint.it, reusing the existing `.qlz` format as transport.

**Architecture:** OAuth 2.0 Authorization Code flow with PKCE. The hub exposes `/oauth/authorize` and `/api/hub/oauth/token`. The installation stores per-user `HubLink` rows with encrypted access/refresh tokens. Publish is a `POST /api/hub/quizzes` accepting `{ metadata, qlzBase64, payloadHash }`; the hub recomputes the SHA-256 hash, validates scopes, and writes `HubQuiz` + `HubQuizVersion`. Re-publish uses `If-Match: <hubQuizId>` to increment version. Tokens are opaque strings (not JWT), stored hashed (SHA-256) server-side and AES-encrypted client-side.

**Tech Stack:** Prisma 6, NextAuth v5 (existing), Next.js 16 App Router, Zod 4, Node `crypto` for hashing/encryption, Vitest 3, Playwright for multi-server E2E.

---

## Dependencies on previous plans

- **Plan 1**: `Quiz.hubPublishedId`, `Quiz.hubLastPublishedAt`, `Quiz.hubAccountId`, `Quiz.schoolLevel`, `Quiz.subject`, `Quiz.language`, `Quiz.ageMin`, `Quiz.ageMax`, `SchoolLevel` enum, `src/lib/quiz-subjects.ts`.
- **Plan 2**: `HubAccount` + `EmailVerificationToken` models, `src/lib/config/savint-mode.ts` (`isHubMode()`, `isInstallationMode()`, `getHubUrl()`), `src/lib/auth/password.ts`, `src/lib/rate-limit/hub-rate-limit.ts` (`enforceHubRateLimit(key, limit, windowSeconds)`), NextAuth credentials provider on `SAVINT_MODE=hub`, `/login` page on the hub.

## File Structure

### Created files (installation side)

- `src/lib/hub/token-crypto.ts` — AES-256-GCM encrypt/decrypt for `HubLink` tokens at rest.
- `src/lib/hub/pkce.ts` — PKCE code verifier/challenge (S256) generator.
- `src/lib/hub/oauth-config.ts` — env-var reader (`HUB_OAUTH_CLIENT_ID`, `HUB_OAUTH_CLIENT_SECRET`, `SAVINT_HUB_URL`) with validation.
- `src/lib/hub/hub-client.ts` — typed client: `getAuthorizeUrl`, `fetchWithTokenRefresh`, `publishQuiz`, `unpublishQuiz`.
- `src/app/api/hub/oauth/start/route.ts` — GET: issues PKCE verifier, stores it in a one-time `OAuthFlowState` row, redirects to hub `/oauth/authorize`.
- `src/app/api/hub/oauth/callback/route.ts` — GET: exchanges code for tokens, encrypts, persists `HubLink`, closes tab.
- `src/app/api/hub/oauth/link/route.ts` — DELETE: revoke local link (and call hub revoke endpoint).
- `src/app/api/hub/quiz/[id]/publish/route.ts` — POST/DELETE: thin proxy that builds the `.qlz` and forwards to the hub with the right Bearer token.
- `src/components/hub/publish-modal.tsx` — full modal with three states.
- `src/components/hub/publish-button.tsx` — button rendered in the editor when `SAVINT_HUB_URL` is configured.
- `src/app/(app)/account/hub-link/page.tsx` — link management UI.

### Created files (hub side)

- `src/lib/hub/token-hash.ts` — SHA-256 hashing of opaque tokens, server-side.
- `src/app/(hub)/oauth/authorize/page.tsx` — consent screen.
- `src/app/(hub)/oauth/authorize/action.ts` — server action that issues the authorization code.
- `src/app/api/hub/oauth/token/route.ts` — POST: code exchange + refresh with rotation/replay detection.
- `src/app/api/hub/oauth/revoke/route.ts` — POST: hub-side revoke endpoint.
- `src/app/api/hub/quizzes/route.ts` — POST: create/publish (Plan 4 will add GET).
- `src/app/api/hub/quizzes/[id]/route.ts` — DELETE: unpublish.
- `src/app/(hub)/q/[id]/page.tsx` — minimal placeholder detail page.

### Modified files

- `prisma/schema.prisma` — adds `HubLink`, `OAuthFlowState`, `OAuthAuthorizationCode`, `Installation`, `HubAccessToken`, `HubQuiz`, `HubQuizVersion`.
- `src/components/quiz/quiz-editor.tsx` — adds `<PublishButton />` next to Share/Test/Play.
- `src/messages/en.json`, `src/messages/it.json` — i18n keys under `hub.publish.*`, `hub.oauth.*`, `hub.link.*`.
- `.env.example` — documents new env vars.

### Test files

- `src/lib/hub/__tests__/token-crypto.test.ts`
- `src/lib/hub/__tests__/token-hash.test.ts`
- `src/lib/hub/__tests__/pkce.test.ts`
- `src/lib/hub/__tests__/oauth-config.test.ts`
- `src/lib/hub/__tests__/hub-client.test.ts`
- `src/app/api/hub/oauth/start/__tests__/route.test.ts`
- `src/app/api/hub/oauth/callback/__tests__/route.test.ts`
- `src/app/api/hub/oauth/token/__tests__/route.test.ts`
- `src/app/api/hub/oauth/revoke/__tests__/route.test.ts`
- `src/app/api/hub/quizzes/__tests__/publish.test.ts`
- `src/app/api/hub/quizzes/__tests__/unpublish.test.ts`
- `src/app/api/hub/quiz/[id]/publish/__tests__/route.test.ts`
- `src/app/(hub)/oauth/authorize/__tests__/page.test.tsx`
- `src/app/(hub)/q/[id]/__tests__/page.test.tsx`
- `src/components/hub/__tests__/publish-modal.test.tsx`
- `src/components/quiz/__tests__/quiz-editor.publish-button.test.tsx`
- `tests/e2e/hub-publish.spec.ts` — multi-server Playwright test.

---

## Tasks

### Task 1 — Prisma models & migration

**Files**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/2026XXXXXXXXXX_hub_publish/migration.sql` (generated by `prisma migrate dev`)
- Create: `src/lib/db/__tests__/hub-publish-schema.test.ts`

**Steps**

- [ ] 1.1 Append new enums and models to `prisma/schema.prisma` (additive only, no edits to existing models from Plan 1/2 except already-applied changes):

  ```prisma
  enum HubInstallationStatus {
    ACTIVE
    DISABLED
  }

  // INSTALLATION SIDE -------------------------------------------------------

  model HubLink {
    id                    String    @id @default(cuid())
    userId                String    @unique
    hubAccountId          String
    hubAccountEmail       String
    accessTokenCiphertext String
    refreshTokenCiphertext String
    accessTokenExpiresAt  DateTime
    scopes                String[]
    createdAt             DateTime  @default(now())
    lastUsedAt            DateTime  @default(now())
    revokedAt             DateTime?

    user User @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@index([hubAccountId])
  }

  model OAuthFlowState {
    id              String   @id @default(cuid())
    userId          String
    codeVerifier    String
    state           String   @unique
    quizId          String?
    scopes          String[]
    createdAt       DateTime @default(now())
    expiresAt       DateTime

    @@index([userId])
    @@index([expiresAt])
  }

  // HUB SIDE ----------------------------------------------------------------

  model Installation {
    id                String                @id @default(cuid())
    name              String
    contactEmail      String
    clientId          String                @unique
    clientSecretHash  String
    status            HubInstallationStatus @default(ACTIVE)
    createdAt         DateTime              @default(now())
    lastSeenAt        DateTime              @default(now())

    accessTokens      HubAccessToken[]
    authorizationCodes OAuthAuthorizationCode[]
  }

  model OAuthAuthorizationCode {
    id                  String   @id @default(cuid())
    codeHash            String   @unique
    installationId      String
    hubAccountId        String
    redirectUri         String
    scopes              String[]
    codeChallenge       String
    codeChallengeMethod String
    state               String
    expiresAt           DateTime
    usedAt              DateTime?
    createdAt           DateTime @default(now())

    installation Installation @relation(fields: [installationId], references: [id], onDelete: Cascade)

    @@index([hubAccountId])
    @@index([expiresAt])
  }

  model HubAccessToken {
    id                     String    @id @default(cuid())
    hubAccountId           String
    installationId         String
    accessTokenHash        String    @unique
    refreshTokenHash       String    @unique
    accessTokenExpiresAt   DateTime
    refreshTokenExpiresAt  DateTime
    scopes                 String[]
    rotationCount          Int       @default(0)
    parentTokenId          String?
    revokedAt              DateTime?
    revokedReason          String?
    createdAt              DateTime  @default(now())
    lastUsedAt             DateTime  @default(now())

    installation Installation @relation(fields: [installationId], references: [id], onDelete: Cascade)

    @@index([hubAccountId, installationId])
    @@index([refreshTokenHash])
  }

  model HubQuiz {
    id                   String    @id @default(cuid())
    hubAccountId         String
    title                String
    description          String?
    license              QuizLicense @default(CC_BY)
    tags                 String[]    @default([])
    schoolLevel          SchoolLevel
    subject              String
    language             String
    ageMin               Int?
    ageMax               Int?
    questionCount        Int
    estimatedDurationSec Int
    payloadBlob          Bytes
    payloadHash          String
    payloadSize          Int
    version              Int       @default(1)
    publishedAt          DateTime  @default(now())
    updatedAt            DateTime  @updatedAt
    unpublishedAt        DateTime?
    suspended            Boolean   @default(false)
    suspendedReason      String?
    downloadsCount       Int       @default(0)
    playsCount           Int       @default(0)

    versions HubQuizVersion[]

    @@index([hubAccountId])
    @@index([subject])
    @@index([schoolLevel])
  }

  model HubQuizVersion {
    id           String   @id @default(cuid())
    hubQuizId    String
    version      Int
    payloadBlob  Bytes
    payloadHash  String
    payloadSize  Int
    publishedAt  DateTime @default(now())

    hubQuiz HubQuiz @relation(fields: [hubQuizId], references: [id], onDelete: Cascade)

    @@unique([hubQuizId, version])
  }
  ```

- [ ] 1.2 Add the back-reference to `User`:

  ```prisma
  model User {
    // ...existing fields
    hubLink HubLink?
  }
  ```

- [ ] 1.3 Run `npx prisma format` then `npx prisma migrate dev --name hub_publish`. Expected: a new migration directory is created, `prisma generate` finishes without errors.

- [ ] 1.4 Write `src/lib/db/__tests__/hub-publish-schema.test.ts`:

  ```ts
  import { describe, it, expect, beforeAll, afterAll } from "vitest";
  import { prisma } from "@/lib/db/client";

  describe("hub publish schema", () => {
    let userId: string;
    let installationId: string;

    beforeAll(async () => {
      const u = await prisma.user.create({ data: { email: `t-${Date.now()}@x` } });
      userId = u.id;
      const inst = await prisma.installation.create({
        data: { name: "Test Inst", contactEmail: "a@b", clientId: `c-${Date.now()}`, clientSecretHash: "hash" },
      });
      installationId = inst.id;
    });

    afterAll(async () => {
      await prisma.hubLink.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
      await prisma.installation.delete({ where: { id: installationId } });
    });

    it("creates a HubLink", async () => {
      const link = await prisma.hubLink.create({
        data: {
          userId,
          hubAccountId: "ha1",
          hubAccountEmail: "x@y",
          accessTokenCiphertext: "ct1",
          refreshTokenCiphertext: "ct2",
          accessTokenExpiresAt: new Date(Date.now() + 60_000),
          scopes: ["publish", "clone"],
        },
      });
      expect(link.id).toBeTruthy();
    });

    it("creates a HubAccessToken & enforces unique hash", async () => {
      const t = await prisma.hubAccessToken.create({
        data: {
          hubAccountId: "ha1",
          installationId,
          accessTokenHash: `at-${Date.now()}`,
          refreshTokenHash: `rt-${Date.now()}`,
          accessTokenExpiresAt: new Date(Date.now() + 900_000),
          refreshTokenExpiresAt: new Date(Date.now() + 90 * 86400_000),
          scopes: ["publish"],
        },
      });
      expect(t.rotationCount).toBe(0);
      await expect(
        prisma.hubAccessToken.create({
          data: { ...t, id: undefined, refreshTokenHash: `other-${Date.now()}` },
        }),
      ).rejects.toThrow();
    });
  });
  ```

- [ ] 1.5 Run `npx vitest run src/lib/db/__tests__/hub-publish-schema.test.ts`. Expected: 2 passed.

- [ ] 1.6 Commit: `git add prisma src/lib/db/__tests__/hub-publish-schema.test.ts && git commit -m "feat(hub): prisma models for OAuth + publish (HubLink, Installation, HubAccessToken, HubQuiz, HubQuizVersion)"`.

---

### Task 2 — Token encryption at rest (installation side)

**Files**
- Create: `src/lib/hub/token-crypto.ts`
- Create: `src/lib/hub/__tests__/token-crypto.test.ts`

**Steps**

- [ ] 2.1 **TEST FIRST.** Write `src/lib/hub/__tests__/token-crypto.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import { encryptToken, decryptToken } from "@/lib/hub/token-crypto";

  describe("token-crypto", () => {
    const secret = "test-secret-please-change-me-32-chars";

    it("round-trips a plaintext", () => {
      const ct = encryptToken("hello-token", secret);
      expect(ct).not.toContain("hello-token");
      expect(decryptToken(ct, secret)).toBe("hello-token");
    });

    it("produces different ciphertexts for same plaintext (random IV)", () => {
      const a = encryptToken("x", secret);
      const b = encryptToken("x", secret);
      expect(a).not.toBe(b);
    });

    it("throws on tampered ciphertext", () => {
      const ct = encryptToken("safe", secret);
      const tampered = ct.slice(0, -2) + "AA";
      expect(() => decryptToken(tampered, secret)).toThrow();
    });

    it("throws on wrong key", () => {
      const ct = encryptToken("safe", secret);
      expect(() => decryptToken(ct, "another-secret-of-sufficient-length-xx")).toThrow();
    });
  });
  ```

- [ ] 2.2 Run `npx vitest run src/lib/hub/__tests__/token-crypto.test.ts`. Expected: failures (module not found).

- [ ] 2.3 Create `src/lib/hub/token-crypto.ts`:

  ```ts
  import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

  const ALGO = "aes-256-gcm";
  const IV_LEN = 12;
  const TAG_LEN = 16;
  const SALT = Buffer.from("savint.hub.tokens.v1");

  function deriveKey(secret: string): Buffer {
    return scryptSync(secret, SALT, 32);
  }

  /**
   * Encrypts `plaintext` with AES-256-GCM. Output is base64 of:
   * [iv(12)][authTag(16)][ciphertext(...)].
   */
  export function encryptToken(plaintext: string, secret: string): string {
    if (!secret || secret.length < 16) throw new Error("encrypt secret too short");
    const key = deriveKey(secret);
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]).toString("base64");
  }

  export function decryptToken(payload: string, secret: string): string {
    if (!secret || secret.length < 16) throw new Error("decrypt secret too short");
    const buf = Buffer.from(payload, "base64");
    if (buf.length < IV_LEN + TAG_LEN) throw new Error("ciphertext too short");
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = buf.subarray(IV_LEN + TAG_LEN);
    const key = deriveKey(secret);
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  }
  ```

- [ ] 2.4 Run tests. Expected: 4 passed.

- [ ] 2.5 Commit: `git add src/lib/hub/token-crypto.ts src/lib/hub/__tests__/token-crypto.test.ts && git commit -m "feat(hub): AES-256-GCM encryption for installation-side OAuth tokens"`.

---

### Task 3 — Token hashing (hub side)

**Files**
- Create: `src/lib/hub/token-hash.ts`
- Create: `src/lib/hub/__tests__/token-hash.test.ts`

**Steps**

- [ ] 3.1 **TEST FIRST.**

  ```ts
  import { describe, it, expect } from "vitest";
  import { generateOpaqueToken, hashToken } from "@/lib/hub/token-hash";

  describe("token-hash", () => {
    it("generates ~base64url tokens of expected entropy", () => {
      const t = generateOpaqueToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    });

    it("produces a stable 64-char hex hash", () => {
      expect(hashToken("abc")).toBe(hashToken("abc"));
      expect(hashToken("abc")).toMatch(/^[a-f0-9]{64}$/);
    });

    it("hashes are unique per input", () => {
      expect(hashToken("a")).not.toBe(hashToken("b"));
    });
  });
  ```

- [ ] 3.2 Run; expect failures.

- [ ] 3.3 Create `src/lib/hub/token-hash.ts`:

  ```ts
  import { createHash, randomBytes } from "crypto";

  /** 32 bytes ~= 256 bits encoded base64url (43 chars, no padding). */
  export function generateOpaqueToken(): string {
    return randomBytes(32).toString("base64url");
  }

  export function hashToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }
  ```

- [ ] 3.4 Run tests. Expected: 3 passed.

- [ ] 3.5 Commit: `git add src/lib/hub/token-hash.ts src/lib/hub/__tests__/token-hash.test.ts && git commit -m "feat(hub): opaque token generation and SHA-256 server-side hashing"`.

---

### Task 4 — PKCE helper

**Files**
- Create: `src/lib/hub/pkce.ts`
- Create: `src/lib/hub/__tests__/pkce.test.ts`

**Steps**

- [ ] 4.1 **TEST FIRST.**

  ```ts
  import { describe, it, expect } from "vitest";
  import { generatePkcePair, verifyPkce } from "@/lib/hub/pkce";

  describe("pkce", () => {
    it("generates verifier 43-128 chars and S256 challenge", () => {
      const { verifier, challenge, method } = generatePkcePair();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
      expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(method).toBe("S256");
    });

    it("verifyPkce accepts the matching verifier", () => {
      const { verifier, challenge } = generatePkcePair();
      expect(verifyPkce(verifier, challenge)).toBe(true);
    });

    it("rejects a tampered verifier", () => {
      const { challenge } = generatePkcePair();
      expect(verifyPkce("wrongverifier".padEnd(43, "x"), challenge)).toBe(false);
    });

    it("rejects unsupported method explicitly", () => {
      expect(verifyPkce("v", "c", "plain" as never)).toBe(false);
    });
  });
  ```

- [ ] 4.2 Run; expect failures.

- [ ] 4.3 Create `src/lib/hub/pkce.ts`:

  ```ts
  import { createHash, randomBytes } from "crypto";

  export type PkcePair = { verifier: string; challenge: string; method: "S256" };

  export function generatePkcePair(): PkcePair {
    const verifier = randomBytes(48).toString("base64url"); // 64 chars
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    return { verifier, challenge, method: "S256" };
  }

  export function verifyPkce(
    verifier: string,
    challenge: string,
    method: "S256" = "S256",
  ): boolean {
    if (method !== "S256") return false;
    const computed = createHash("sha256").update(verifier).digest("base64url");
    return computed === challenge;
  }
  ```

- [ ] 4.4 Run tests. Expected: 4 passed.

- [ ] 4.5 Commit: `git add src/lib/hub/pkce.ts src/lib/hub/__tests__/pkce.test.ts && git commit -m "feat(hub): PKCE verifier/challenge helpers (S256)"`.

---

### Task 5 — OAuth config reader (installation side)

**Files**
- Create: `src/lib/hub/oauth-config.ts`
- Create: `src/lib/hub/__tests__/oauth-config.test.ts`
- Modify: `.env.example`

**Steps**

- [ ] 5.1 **TEST FIRST.**

  ```ts
  import { describe, it, expect, beforeEach } from "vitest";
  import { getHubOAuthConfig, hasHubOAuthConfig } from "@/lib/hub/oauth-config";

  describe("oauth-config", () => {
    const saved = { ...process.env };
    beforeEach(() => {
      delete process.env.HUB_OAUTH_CLIENT_ID;
      delete process.env.HUB_OAUTH_CLIENT_SECRET;
      delete process.env.SAVINT_HUB_URL;
    });

    afterAll = () => { Object.assign(process.env, saved); };

    it("returns null helpers when not configured", () => {
      expect(hasHubOAuthConfig()).toBe(false);
      expect(() => getHubOAuthConfig()).toThrow(/HUB_OAUTH_CLIENT_ID/);
    });

    it("returns full config when all three vars are set", () => {
      process.env.HUB_OAUTH_CLIENT_ID = "cid";
      process.env.HUB_OAUTH_CLIENT_SECRET = "sec";
      process.env.SAVINT_HUB_URL = "https://savint.it";
      expect(hasHubOAuthConfig()).toBe(true);
      const c = getHubOAuthConfig();
      expect(c.clientId).toBe("cid");
      expect(c.hubUrl).toBe("https://savint.it");
    });

    it("rejects a malformed hub URL", () => {
      process.env.HUB_OAUTH_CLIENT_ID = "cid";
      process.env.HUB_OAUTH_CLIENT_SECRET = "sec";
      process.env.SAVINT_HUB_URL = "not a url";
      expect(() => getHubOAuthConfig()).toThrow();
    });
  });
  ```

- [ ] 5.2 Run; expect failures.

- [ ] 5.3 Create `src/lib/hub/oauth-config.ts`:

  ```ts
  export type HubOAuthConfig = {
    clientId: string;
    clientSecret: string;
    hubUrl: string;
  };

  export function hasHubOAuthConfig(): boolean {
    return Boolean(
      process.env.HUB_OAUTH_CLIENT_ID &&
        process.env.HUB_OAUTH_CLIENT_SECRET &&
        process.env.SAVINT_HUB_URL,
    );
  }

  export function getHubOAuthConfig(): HubOAuthConfig {
    const clientId = process.env.HUB_OAUTH_CLIENT_ID;
    const clientSecret = process.env.HUB_OAUTH_CLIENT_SECRET;
    const hubUrl = process.env.SAVINT_HUB_URL;
    if (!clientId) throw new Error("HUB_OAUTH_CLIENT_ID is not set");
    if (!clientSecret) throw new Error("HUB_OAUTH_CLIENT_SECRET is not set");
    if (!hubUrl) throw new Error("SAVINT_HUB_URL is not set");
    try {
      const u = new URL(hubUrl);
      if (!u.protocol.startsWith("http")) throw new Error("bad protocol");
    } catch {
      throw new Error(`SAVINT_HUB_URL is malformed: ${hubUrl}`);
    }
    return { clientId, clientSecret, hubUrl: hubUrl.replace(/\/+$/, "") };
  }
  ```

- [ ] 5.4 Update `.env.example` (append):

  ```
  # Hub integration (installation mode)
  SAVINT_HUB_URL=https://savint.it
  HUB_OAUTH_CLIENT_ID=
  HUB_OAUTH_CLIENT_SECRET=
  # Hub limits (hub mode)
  HUB_MAX_QUIZ_SIZE_MB=50
  HUB_PUBLIC_QUIZZES_PER_ACCOUNT_MAX=200
  ```

- [ ] 5.5 Run tests. Expected: 3 passed.

- [ ] 5.6 Commit: `git add src/lib/hub/oauth-config.ts src/lib/hub/__tests__/oauth-config.test.ts .env.example && git commit -m "feat(hub): OAuth config reader for installation side"`.

---

### Task 6 — Hub `/oauth/authorize` consent screen

**Files**
- Create: `src/app/(hub)/oauth/authorize/page.tsx`
- Create: `src/app/(hub)/oauth/authorize/action.ts`
- Create: `src/app/(hub)/oauth/authorize/__tests__/page.test.tsx`
- Modify: `src/messages/en.json`, `src/messages/it.json`

**Steps**

- [ ] 6.1 Add i18n keys (en):

  ```json
  "hub": {
    "oauth": {
      "title": "Authorize {installation}",
      "subtitle": "{installation} wants to publish quizzes on your behalf on savint.it.",
      "scopes": {
        "publish": "Publish and update your quizzes on savint.it",
        "clone": "Browse the catalog and clone quizzes into your installation"
      },
      "accept": "Allow",
      "deny": "Cancel",
      "needLogin": "Please log in to authorize this app.",
      "invalidClient": "Unknown installation.",
      "invalidRedirect": "Invalid redirect URI for this installation."
    }
  }
  ```

  Mirror in `it.json` with Italian strings.

- [ ] 6.2 **TEST FIRST** — `src/app/(hub)/oauth/authorize/__tests__/page.test.tsx`:

  ```ts
  import { describe, it, expect, vi } from "vitest";
  import { render, screen } from "@testing-library/react";
  import AuthorizePage from "@/app/(hub)/oauth/authorize/page";

  vi.mock("@/lib/auth/config", () => ({
    auth: vi.fn(async () => ({ user: { id: "ha1", email: "u@x" } })),
  }));
  vi.mock("@/lib/db/client", () => ({
    prisma: {
      installation: {
        findUnique: vi.fn(async ({ where }: { where: { clientId: string } }) =>
          where.clientId === "good"
            ? { id: "i1", name: "Liceo Galilei", clientId: "good", status: "ACTIVE" }
            : null,
        ),
      },
    },
  }));

  describe("oauth authorize page", () => {
    it("renders consent for a valid installation", async () => {
      const params = new URLSearchParams({
        client_id: "good",
        redirect_uri: "https://school.example/api/hub/oauth/callback",
        scope: "publish clone",
        state: "s",
        code_challenge: "c".repeat(43),
        code_challenge_method: "S256",
      });
      const ui = await AuthorizePage({ searchParams: Promise.resolve(Object.fromEntries(params)) });
      render(ui);
      expect(screen.getByText(/Liceo Galilei/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Allow/i })).toBeInTheDocument();
    });

    it("rejects an unknown client_id", async () => {
      const ui = await AuthorizePage({
        searchParams: Promise.resolve({
          client_id: "nope",
          redirect_uri: "x",
          scope: "publish",
          state: "s",
          code_challenge: "c",
          code_challenge_method: "S256",
        }),
      });
      render(ui);
      expect(screen.getByText(/Unknown installation/)).toBeInTheDocument();
    });
  });
  ```

- [ ] 6.3 Run; expect failures.

- [ ] 6.4 Create `src/app/(hub)/oauth/authorize/action.ts`:

  ```ts
  "use server";

  import { redirect } from "next/navigation";
  import { auth } from "@/lib/auth/config";
  import { prisma } from "@/lib/db/client";
  import { generateOpaqueToken, hashToken } from "@/lib/hub/token-hash";
  import { enforceHubRateLimit } from "@/lib/rate-limit/hub-rate-limit";
  import { headers } from "next/headers";

  export async function approveAuthorization(formData: FormData) {
    const session = await auth();
    if (!session?.user?.id) throw new Error("not_authenticated");

    const clientId = String(formData.get("client_id") ?? "");
    const redirectUri = String(formData.get("redirect_uri") ?? "");
    const scope = String(formData.get("scope") ?? "");
    const state = String(formData.get("state") ?? "");
    const codeChallenge = String(formData.get("code_challenge") ?? "");
    const codeChallengeMethod = String(formData.get("code_challenge_method") ?? "S256");

    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await enforceHubRateLimit(`oauth_authorize:${ip}`, 20, 3600);

    const installation = await prisma.installation.findUnique({
      where: { clientId },
    });
    if (!installation || installation.status !== "ACTIVE") {
      throw new Error("invalid_client");
    }

    const code = generateOpaqueToken();
    await prisma.oAuthAuthorizationCode.create({
      data: {
        codeHash: hashToken(code),
        installationId: installation.id,
        hubAccountId: session.user.id,
        redirectUri,
        scopes: scope.split(/[\s,]+/).filter(Boolean),
        codeChallenge,
        codeChallengeMethod,
        state,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });

    const u = new URL(redirectUri);
    u.searchParams.set("code", code);
    u.searchParams.set("state", state);
    redirect(u.toString());
  }
  ```

- [ ] 6.5 Create `src/app/(hub)/oauth/authorize/page.tsx`:

  ```tsx
  import { auth } from "@/lib/auth/config";
  import { prisma } from "@/lib/db/client";
  import { getTranslations } from "next-intl/server";
  import { redirect } from "next/navigation";
  import { approveAuthorization } from "./action";

  type SP = {
    client_id?: string;
    redirect_uri?: string;
    scope?: string;
    state?: string;
    code_challenge?: string;
    code_challenge_method?: string;
  };

  export default async function AuthorizePage({
    searchParams,
  }: {
    searchParams: Promise<SP>;
  }) {
    const sp = await searchParams;
    const t = await getTranslations("hub.oauth");
    const session = await auth();
    if (!session?.user?.id) {
      const back = encodeURIComponent(
        `/oauth/authorize?${new URLSearchParams(sp as Record<string, string>).toString()}`,
      );
      redirect(`/login?callbackUrl=${back}`);
    }

    if (!sp.client_id || !sp.redirect_uri || !sp.code_challenge) {
      return <p>Missing parameters</p>;
    }

    const installation = await prisma.installation.findUnique({
      where: { clientId: sp.client_id },
    });
    if (!installation || installation.status !== "ACTIVE") {
      return <p>{t("invalidClient")}</p>;
    }

    const scopeList = (sp.scope ?? "").split(/[\s,]+/).filter(Boolean);

    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-semibold">
          {t("title", { installation: installation.name })}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {t("subtitle", { installation: installation.name })}
        </p>
        <ul className="mt-4 list-disc pl-6 text-sm">
          {scopeList.includes("publish") && <li>{t("scopes.publish")}</li>}
          {scopeList.includes("clone") && <li>{t("scopes.clone")}</li>}
        </ul>
        <form action={approveAuthorization} className="mt-6 flex gap-2">
          <input type="hidden" name="client_id" value={sp.client_id} />
          <input type="hidden" name="redirect_uri" value={sp.redirect_uri} />
          <input type="hidden" name="scope" value={sp.scope ?? ""} />
          <input type="hidden" name="state" value={sp.state ?? ""} />
          <input type="hidden" name="code_challenge" value={sp.code_challenge} />
          <input
            type="hidden"
            name="code_challenge_method"
            value={sp.code_challenge_method ?? "S256"}
          />
          <button
            type="submit"
            className="rounded bg-emerald-600 px-4 py-2 text-white"
          >
            {t("accept")}
          </button>
          <a href={sp.redirect_uri} className="rounded border px-4 py-2">
            {t("deny")}
          </a>
        </form>
      </main>
    );
  }
  ```

- [ ] 6.6 Run tests. Expected: 2 passed (page render + invalid client).

- [ ] 6.7 Commit: `git add src/app/\(hub\)/oauth/authorize src/messages/en.json src/messages/it.json && git commit -m "feat(hub): /oauth/authorize consent screen + authorization code issuance"`.

---

### Task 7 — Hub `POST /api/hub/oauth/token`

**Files**
- Create: `src/app/api/hub/oauth/token/route.ts`
- Create: `src/app/api/hub/oauth/token/__tests__/route.test.ts`

**Steps**

- [ ] 7.1 **TEST FIRST.**

  ```ts
  import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
  import { POST } from "@/app/api/hub/oauth/token/route";
  import { prisma } from "@/lib/db/client";
  import { hashToken } from "@/lib/hub/token-hash";
  import { generatePkcePair } from "@/lib/hub/pkce";
  import { hashPassword, verifyPassword } from "@/lib/auth/password";

  // helper: build a Request with form-encoded body
  const req = (form: Record<string, string>) =>
    new Request("http://h/api/hub/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    });

  describe("POST /api/hub/oauth/token", () => {
    let installationId: string;
    let clientId: string;
    let clientSecret: string;

    beforeAll(async () => {
      clientId = `c-${Date.now()}`;
      clientSecret = "secret";
      const i = await prisma.installation.create({
        data: {
          name: "T",
          contactEmail: "a@b",
          clientId,
          clientSecretHash: await hashPassword(clientSecret),
        },
      });
      installationId = i.id;
    });

    afterAll(async () => {
      await prisma.hubAccessToken.deleteMany({ where: { installationId } });
      await prisma.oAuthAuthorizationCode.deleteMany({ where: { installationId } });
      await prisma.installation.delete({ where: { id: installationId } });
    });

    it("exchanges code for tokens with PKCE", async () => {
      const code = "auth-code-1";
      const pkce = generatePkcePair();
      await prisma.oAuthAuthorizationCode.create({
        data: {
          codeHash: hashToken(code),
          installationId,
          hubAccountId: "ha1",
          redirectUri: "https://x/cb",
          scopes: ["publish"],
          codeChallenge: pkce.challenge,
          codeChallengeMethod: "S256",
          state: "s",
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      const res = await POST(req({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: "https://x/cb",
        code_verifier: pkce.verifier,
      }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.access_token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(body.refresh_token).toBeTruthy();
      expect(body.token_type).toBe("Bearer");
      expect(body.expires_in).toBeGreaterThan(0);
    });

    it("rejects a reused code", async () => {
      const code = "auth-code-2";
      const pkce = generatePkcePair();
      await prisma.oAuthAuthorizationCode.create({
        data: {
          codeHash: hashToken(code),
          installationId,
          hubAccountId: "ha1",
          redirectUri: "https://x/cb",
          scopes: ["publish"],
          codeChallenge: pkce.challenge,
          codeChallengeMethod: "S256",
          state: "s",
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      const form = {
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: "https://x/cb",
        code_verifier: pkce.verifier,
      };
      const ok = await POST(req(form));
      expect(ok.status).toBe(200);
      const replay = await POST(req(form));
      expect(replay.status).toBe(400);
    });

    it("rejects wrong PKCE verifier", async () => {
      const code = "auth-code-3";
      const pkce = generatePkcePair();
      await prisma.oAuthAuthorizationCode.create({
        data: {
          codeHash: hashToken(code),
          installationId,
          hubAccountId: "ha1",
          redirectUri: "https://x/cb",
          scopes: ["publish"],
          codeChallenge: pkce.challenge,
          codeChallengeMethod: "S256",
          state: "s",
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      const res = await POST(req({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: "https://x/cb",
        code_verifier: "wrong-verifier".padEnd(43, "x"),
      }));
      expect(res.status).toBe(400);
    });

    it("rejects expired code", async () => {
      const code = "auth-code-4";
      const pkce = generatePkcePair();
      await prisma.oAuthAuthorizationCode.create({
        data: {
          codeHash: hashToken(code),
          installationId,
          hubAccountId: "ha1",
          redirectUri: "https://x/cb",
          scopes: ["publish"],
          codeChallenge: pkce.challenge,
          codeChallengeMethod: "S256",
          state: "s",
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      const res = await POST(req({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: "https://x/cb",
        code_verifier: pkce.verifier,
      }));
      expect(res.status).toBe(400);
    });
  });
  ```

- [ ] 7.2 Run; expect failures.

- [ ] 7.3 Create `src/app/api/hub/oauth/token/route.ts`:

  ```ts
  import { NextRequest, NextResponse } from "next/server";
  import { prisma } from "@/lib/db/client";
  import { generateOpaqueToken, hashToken } from "@/lib/hub/token-hash";
  import { verifyPkce } from "@/lib/hub/pkce";
  import { verifyPassword } from "@/lib/auth/password";

  const ACCESS_TTL_S = 15 * 60;
  const REFRESH_TTL_S = 90 * 24 * 3600;

  function err(code: string, status = 400) {
    return NextResponse.json({ error: code }, { status });
  }

  export async function POST(req: NextRequest) {
    const ct = req.headers.get("content-type") ?? "";
    const params = ct.includes("application/json")
      ? new URLSearchParams(Object.entries((await req.json()) ?? {}).map(([k, v]) => [k, String(v)]))
      : new URLSearchParams(await req.text());

    const grant = params.get("grant_type");
    const clientId = params.get("client_id");
    const clientSecret = params.get("client_secret");
    if (!clientId || !clientSecret) return err("invalid_client", 401);

    const installation = await prisma.installation.findUnique({ where: { clientId } });
    if (!installation || installation.status !== "ACTIVE") return err("invalid_client", 401);
    if (!(await verifyPassword(clientSecret, installation.clientSecretHash))) {
      return err("invalid_client", 401);
    }

    if (grant === "authorization_code") {
      const code = params.get("code");
      const redirectUri = params.get("redirect_uri");
      const codeVerifier = params.get("code_verifier");
      if (!code || !redirectUri || !codeVerifier) return err("invalid_request");

      const row = await prisma.oAuthAuthorizationCode.findUnique({
        where: { codeHash: hashToken(code) },
      });
      if (!row) return err("invalid_grant");
      if (row.installationId !== installation.id) return err("invalid_grant");
      if (row.usedAt) return err("invalid_grant");
      if (row.expiresAt < new Date()) return err("invalid_grant");
      if (row.redirectUri !== redirectUri) return err("invalid_grant");
      if (!verifyPkce(codeVerifier, row.codeChallenge, row.codeChallengeMethod as "S256")) {
        return err("invalid_grant");
      }

      const accessToken = generateOpaqueToken();
      const refreshToken = generateOpaqueToken();
      const now = new Date();

      await prisma.$transaction([
        prisma.oAuthAuthorizationCode.update({
          where: { id: row.id },
          data: { usedAt: now },
        }),
        prisma.hubAccessToken.create({
          data: {
            hubAccountId: row.hubAccountId,
            installationId: installation.id,
            accessTokenHash: hashToken(accessToken),
            refreshTokenHash: hashToken(refreshToken),
            accessTokenExpiresAt: new Date(now.getTime() + ACCESS_TTL_S * 1000),
            refreshTokenExpiresAt: new Date(now.getTime() + REFRESH_TTL_S * 1000),
            scopes: row.scopes,
          },
        }),
        prisma.installation.update({
          where: { id: installation.id },
          data: { lastSeenAt: now },
        }),
      ]);

      return NextResponse.json({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: ACCESS_TTL_S,
        scope: row.scopes.join(" "),
      });
    }

    if (grant === "refresh_token") {
      const refresh = params.get("refresh_token");
      if (!refresh) return err("invalid_request");
      const row = await prisma.hubAccessToken.findUnique({
        where: { refreshTokenHash: hashToken(refresh) },
      });
      if (!row || row.installationId !== installation.id) return err("invalid_grant");

      if (row.revokedAt) {
        // Replay: revoke the entire chain from the root.
        await prisma.hubAccessToken.updateMany({
          where: {
            OR: [
              { id: row.id },
              { parentTokenId: row.id },
            ],
            revokedAt: null,
          },
          data: { revokedAt: new Date(), revokedReason: "refresh_replay" },
        });
        return err("invalid_grant");
      }

      if (row.refreshTokenExpiresAt < new Date()) return err("invalid_grant");

      const newAccess = generateOpaqueToken();
      const newRefresh = generateOpaqueToken();
      const now = new Date();

      const created = await prisma.$transaction(async (tx) => {
        const rotated = await tx.hubAccessToken.create({
          data: {
            hubAccountId: row.hubAccountId,
            installationId: installation.id,
            accessTokenHash: hashToken(newAccess),
            refreshTokenHash: hashToken(newRefresh),
            accessTokenExpiresAt: new Date(now.getTime() + ACCESS_TTL_S * 1000),
            refreshTokenExpiresAt: new Date(now.getTime() + REFRESH_TTL_S * 1000),
            scopes: row.scopes,
            rotationCount: row.rotationCount + 1,
            parentTokenId: row.id,
          },
        });
        await tx.hubAccessToken.update({
          where: { id: row.id },
          data: { revokedAt: now, revokedReason: "rotated" },
        });
        return rotated;
      });

      return NextResponse.json({
        access_token: newAccess,
        refresh_token: newRefresh,
        token_type: "Bearer",
        expires_in: ACCESS_TTL_S,
        scope: created.scopes.join(" "),
      });
    }

    return err("unsupported_grant_type");
  }
  ```

- [ ] 7.4 Run tests. Expected: 4 passed.

- [ ] 7.5 Commit: `git add src/app/api/hub/oauth/token && git commit -m "feat(hub): POST /api/hub/oauth/token with PKCE + refresh rotation + replay detection"`.

---

### Task 8 — Installation OAuth start route

**Files**
- Create: `src/app/api/hub/oauth/start/route.ts`
- Create: `src/app/api/hub/oauth/start/__tests__/route.test.ts`

**Steps**

- [ ] 8.1 **TEST FIRST.**

  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { GET } from "@/app/api/hub/oauth/start/route";
  import { prisma } from "@/lib/db/client";

  vi.mock("@/lib/auth/config", () => ({
    auth: vi.fn(async () => ({ user: { id: "u1" } })),
  }));

  describe("GET /api/hub/oauth/start", () => {
    beforeEach(() => {
      process.env.SAVINT_HUB_URL = "https://hub.example";
      process.env.HUB_OAUTH_CLIENT_ID = "cid";
      process.env.HUB_OAUTH_CLIENT_SECRET = "sec";
    });

    it("redirects to hub authorize URL with PKCE challenge and stores verifier", async () => {
      const res = await GET(
        new Request("http://app/api/hub/oauth/start?quizId=q1&scopes=publish"),
      );
      expect(res.status).toBe(307);
      const loc = res.headers.get("location")!;
      expect(loc).toContain("https://hub.example/oauth/authorize");
      expect(loc).toContain("code_challenge=");
      const url = new URL(loc);
      const state = url.searchParams.get("state")!;
      const row = await prisma.oAuthFlowState.findUnique({ where: { state } });
      expect(row?.codeVerifier.length).toBeGreaterThan(40);
      expect(row?.quizId).toBe("q1");
    });

    it("rejects when not authenticated", async () => {
      const { auth } = await import("@/lib/auth/config");
      (auth as any).mockResolvedValueOnce(null);
      const res = await GET(new Request("http://app/api/hub/oauth/start"));
      expect(res.status).toBe(401);
    });
  });
  ```

- [ ] 8.2 Run; expect failures.

- [ ] 8.3 Create `src/app/api/hub/oauth/start/route.ts`:

  ```ts
  import { NextRequest, NextResponse } from "next/server";
  import { auth } from "@/lib/auth/config";
  import { prisma } from "@/lib/db/client";
  import { generatePkcePair } from "@/lib/hub/pkce";
  import { generateOpaqueToken } from "@/lib/hub/token-hash";
  import { getHubOAuthConfig } from "@/lib/hub/oauth-config";

  export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL(req.url);
    const quizId = url.searchParams.get("quizId") ?? undefined;
    const scopes = (url.searchParams.get("scopes") ?? "publish").split(/[\s,]+/).filter(Boolean);

    const cfg = getHubOAuthConfig();
    const pkce = generatePkcePair();
    const state = generateOpaqueToken();

    await prisma.oAuthFlowState.create({
      data: {
        userId: session.user.id,
        codeVerifier: pkce.verifier,
        state,
        quizId,
        scopes,
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });

    const origin = url.origin;
    const redirectUri = `${origin}/api/hub/oauth/callback`;

    const authorize = new URL(`${cfg.hubUrl}/oauth/authorize`);
    authorize.searchParams.set("client_id", cfg.clientId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("scope", scopes.join(" "));
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("code_challenge", pkce.challenge);
    authorize.searchParams.set("code_challenge_method", "S256");
    authorize.searchParams.set("response_type", "code");

    return NextResponse.redirect(authorize.toString(), 307);
  }
  ```

- [ ] 8.4 Run tests. Expected: 2 passed.

- [ ] 8.5 Commit: `git add src/app/api/hub/oauth/start && git commit -m "feat(hub): installation route /api/hub/oauth/start issues PKCE + redirects to hub"`.

---

### Task 9 — Installation OAuth callback route

**Files**
- Create: `src/app/api/hub/oauth/callback/route.ts`
- Create: `src/app/api/hub/oauth/callback/__tests__/route.test.ts`

**Steps**

- [ ] 9.1 **TEST FIRST.**

  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { GET } from "@/app/api/hub/oauth/callback/route";
  import { prisma } from "@/lib/db/client";

  vi.mock("@/lib/auth/config", () => ({
    auth: vi.fn(async () => ({ user: { id: "u-cb-1" } })),
  }));

  describe("GET /api/hub/oauth/callback", () => {
    beforeEach(() => {
      process.env.SAVINT_HUB_URL = "https://hub.example";
      process.env.HUB_OAUTH_CLIENT_ID = "cid";
      process.env.HUB_OAUTH_CLIENT_SECRET = "sec";
      process.env.NEXTAUTH_SECRET = "test-secret-for-token-encrypt-32";
    });

    it("exchanges code, encrypts tokens, creates HubLink", async () => {
      // arrange OAuthFlowState
      await prisma.user.upsert({
        where: { id: "u-cb-1" },
        create: { id: "u-cb-1", email: "u-cb-1@x" },
        update: {},
      });
      const flow = await prisma.oAuthFlowState.create({
        data: {
          userId: "u-cb-1",
          codeVerifier: "v".repeat(64),
          state: "ST1",
          scopes: ["publish"],
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      global.fetch = vi.fn(async () =>
        new Response(
          JSON.stringify({
            access_token: "at-1",
            refresh_token: "rt-1",
            token_type: "Bearer",
            expires_in: 900,
            scope: "publish",
            hub_account_id: "ha-1",
            hub_account_email: "h@x",
          }),
          { status: 200 },
        ),
      ) as any;

      const res = await GET(
        new Request("http://app/api/hub/oauth/callback?code=C&state=ST1"),
      );
      expect([302, 307]).toContain(res.status);
      const link = await prisma.hubLink.findUnique({ where: { userId: "u-cb-1" } });
      expect(link?.accessTokenCiphertext).toBeTruthy();
      expect(link?.scopes).toContain("publish");
    });

    it("rejects an unknown state", async () => {
      const res = await GET(
        new Request("http://app/api/hub/oauth/callback?code=C&state=does-not-exist"),
      );
      expect(res.status).toBe(400);
    });
  });
  ```

- [ ] 9.2 Run; expect failures.

- [ ] 9.3 Create `src/app/api/hub/oauth/callback/route.ts`:

  ```ts
  import { NextRequest, NextResponse } from "next/server";
  import { auth } from "@/lib/auth/config";
  import { prisma } from "@/lib/db/client";
  import { encryptToken } from "@/lib/hub/token-crypto";
  import { getHubOAuthConfig } from "@/lib/hub/oauth-config";

  export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      return NextResponse.json({ error: "missing_params" }, { status: 400 });
    }

    const flow = await prisma.oAuthFlowState.findUnique({ where: { state } });
    if (!flow || flow.userId !== session.user.id || flow.expiresAt < new Date()) {
      return NextResponse.json({ error: "invalid_state" }, { status: 400 });
    }

    const cfg = getHubOAuthConfig();
    const tokenRes = await fetch(`${cfg.hubUrl}/api/hub/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: `${url.origin}/api/hub/oauth/callback`,
        code_verifier: flow.codeVerifier,
      }).toString(),
    });
    if (!tokenRes.ok) {
      return NextResponse.json({ error: "exchange_failed" }, { status: 502 });
    }
    const body = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string;
      hub_account_id: string;
      hub_account_email: string;
    };

    const secret = process.env.NEXTAUTH_SECRET ?? "";
    const accessTokenCiphertext = encryptToken(body.access_token, secret);
    const refreshTokenCiphertext = encryptToken(body.refresh_token, secret);

    await prisma.hubLink.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        hubAccountId: body.hub_account_id,
        hubAccountEmail: body.hub_account_email,
        accessTokenCiphertext,
        refreshTokenCiphertext,
        accessTokenExpiresAt: new Date(Date.now() + body.expires_in * 1000),
        scopes: body.scope.split(/\s+/).filter(Boolean),
      },
      update: {
        hubAccountId: body.hub_account_id,
        hubAccountEmail: body.hub_account_email,
        accessTokenCiphertext,
        refreshTokenCiphertext,
        accessTokenExpiresAt: new Date(Date.now() + body.expires_in * 1000),
        scopes: body.scope.split(/\s+/).filter(Boolean),
        revokedAt: null,
      },
    });

    await prisma.oAuthFlowState.delete({ where: { id: flow.id } });

    const dest = flow.quizId
      ? `/quiz/${flow.quizId}?hubLinked=1`
      : `/account/hub-link?linked=1`;
    return NextResponse.redirect(`${url.origin}${dest}`, 307);
  }
  ```

  Note: the hub's token endpoint needs to return `hub_account_id` / `hub_account_email`. Update Task 7 final response shape:

  ```ts
  // append to both grant branches in token/route.ts:
  return NextResponse.json({
    access_token: ...,
    refresh_token: ...,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_S,
    scope: ...,
    hub_account_id: row.hubAccountId,
    hub_account_email: (await prisma.hubAccount.findUnique({
      where: { id: row.hubAccountId },
      select: { email: true },
    }))?.email ?? "",
  });
  ```

- [ ] 9.4 Apply that response change to `src/app/api/hub/oauth/token/route.ts` (both branches) and add a Vitest case verifying `hub_account_id` is present (extend Task 7 tests).

- [ ] 9.5 Run callback tests. Expected: 2 passed.

- [ ] 9.6 Commit: `git add src/app/api/hub/oauth/callback src/app/api/hub/oauth/token && git commit -m "feat(hub): installation OAuth callback persists encrypted HubLink"`.

---

### Task 10 — Hub client with auto-refresh

**Files**
- Create: `src/lib/hub/hub-client.ts`
- Create: `src/lib/hub/__tests__/hub-client.test.ts`

**Steps**

- [ ] 10.1 **TEST FIRST.**

  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { prisma } from "@/lib/db/client";
  import { encryptToken, decryptToken } from "@/lib/hub/token-crypto";
  import { fetchWithTokenRefresh } from "@/lib/hub/hub-client";

  describe("hub-client", () => {
    beforeEach(() => {
      process.env.NEXTAUTH_SECRET = "test-secret-for-token-encrypt-32";
      process.env.SAVINT_HUB_URL = "https://hub.example";
      process.env.HUB_OAUTH_CLIENT_ID = "cid";
      process.env.HUB_OAUTH_CLIENT_SECRET = "sec";
    });

    it("calls the hub with the current access token", async () => {
      const userId = `u-hc-${Date.now()}`;
      await prisma.user.create({ data: { id: userId, email: `${userId}@x` } });
      await prisma.hubLink.create({
        data: {
          userId,
          hubAccountId: "ha",
          hubAccountEmail: "h@x",
          accessTokenCiphertext: encryptToken("good-token", process.env.NEXTAUTH_SECRET!),
          refreshTokenCiphertext: encryptToken("refresh", process.env.NEXTAUTH_SECRET!),
          accessTokenExpiresAt: new Date(Date.now() + 60_000),
          scopes: ["publish"],
        },
      });
      const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer good-token");
        return new Response("ok", { status: 200 });
      });
      global.fetch = fetchMock as any;
      const res = await fetchWithTokenRefresh(userId, "/api/hub/quizzes", { method: "GET" });
      expect(res.status).toBe(200);
    });

    it("refreshes when access token is near expiry and retries", async () => {
      const userId = `u-hc-${Date.now()}-r`;
      await prisma.user.create({ data: { id: userId, email: `${userId}@x` } });
      await prisma.hubLink.create({
        data: {
          userId,
          hubAccountId: "ha",
          hubAccountEmail: "h@x",
          accessTokenCiphertext: encryptToken("expired", process.env.NEXTAUTH_SECRET!),
          refreshTokenCiphertext: encryptToken("rt-1", process.env.NEXTAUTH_SECRET!),
          accessTokenExpiresAt: new Date(Date.now() - 1000),
          scopes: ["publish"],
        },
      });
      let call = 0;
      global.fetch = vi.fn(async (url: string) => {
        call++;
        if (url.endsWith("/api/hub/oauth/token")) {
          return new Response(
            JSON.stringify({
              access_token: "new-at",
              refresh_token: "new-rt",
              expires_in: 900,
              scope: "publish",
              token_type: "Bearer",
              hub_account_id: "ha",
              hub_account_email: "h@x",
            }),
            { status: 200 },
          );
        }
        return new Response("ok", { status: 200 });
      }) as any;
      const res = await fetchWithTokenRefresh(userId, "/api/hub/quizzes");
      expect(res.status).toBe(200);
      expect(call).toBe(2);
      const link = await prisma.hubLink.findUnique({ where: { userId } });
      expect(decryptToken(link!.accessTokenCiphertext, process.env.NEXTAUTH_SECRET!)).toBe(
        "new-at",
      );
    });
  });
  ```

- [ ] 10.2 Run; expect failures.

- [ ] 10.3 Create `src/lib/hub/hub-client.ts`:

  ```ts
  import { prisma } from "@/lib/db/client";
  import { decryptToken, encryptToken } from "@/lib/hub/token-crypto";
  import { getHubOAuthConfig } from "@/lib/hub/oauth-config";

  const REFRESH_SKEW_MS = 30_000;

  export class HubLinkMissingError extends Error {
    constructor() { super("hub_link_missing"); }
  }
  export class HubReauthRequiredError extends Error {
    constructor() { super("hub_reauth_required"); }
  }

  export function getAuthorizeUrl(quizId?: string): string {
    const params = new URLSearchParams();
    if (quizId) params.set("quizId", quizId);
    params.set("scopes", "publish clone");
    return `/api/hub/oauth/start?${params.toString()}`;
  }

  async function refreshLink(userId: string, secret: string) {
    const cfg = getHubOAuthConfig();
    const link = await prisma.hubLink.findUnique({ where: { userId } });
    if (!link || link.revokedAt) throw new HubLinkMissingError();
    const currentRefresh = decryptToken(link.refreshTokenCiphertext, secret);
    const res = await fetch(`${cfg.hubUrl}/api/hub/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: currentRefresh,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }).toString(),
    });
    if (!res.ok) {
      await prisma.hubLink.update({
        where: { id: link.id },
        data: { revokedAt: new Date() },
      });
      throw new HubReauthRequiredError();
    }
    const body = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string;
    };
    await prisma.hubLink.update({
      where: { id: link.id },
      data: {
        accessTokenCiphertext: encryptToken(body.access_token, secret),
        refreshTokenCiphertext: encryptToken(body.refresh_token, secret),
        accessTokenExpiresAt: new Date(Date.now() + body.expires_in * 1000),
        scopes: body.scope.split(/\s+/).filter(Boolean),
        lastUsedAt: new Date(),
      },
    });
    return body.access_token;
  }

  export async function fetchWithTokenRefresh(
    userId: string,
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const cfg = getHubOAuthConfig();
    const secret = process.env.NEXTAUTH_SECRET ?? "";
    let link = await prisma.hubLink.findUnique({ where: { userId } });
    if (!link || link.revokedAt) throw new HubLinkMissingError();

    let accessToken: string;
    if (link.accessTokenExpiresAt.getTime() - Date.now() < REFRESH_SKEW_MS) {
      accessToken = await refreshLink(userId, secret);
    } else {
      accessToken = decryptToken(link.accessTokenCiphertext, secret);
    }

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);

    let res = await fetch(`${cfg.hubUrl}${path}`, { ...init, headers });
    if (res.status === 401) {
      accessToken = await refreshLink(userId, secret);
      headers.set("Authorization", `Bearer ${accessToken}`);
      res = await fetch(`${cfg.hubUrl}${path}`, { ...init, headers });
    }
    return res;
  }
  ```

- [ ] 10.4 Run tests. Expected: 2 passed.

- [ ] 10.5 Commit: `git add src/lib/hub/hub-client.ts src/lib/hub/__tests__/hub-client.test.ts && git commit -m "feat(hub): client with auto-refresh and reauth-required error"`.

---

### Task 11 — Hub `POST /api/hub/quizzes` (publish + re-publish)

**Files**
- Create: `src/app/api/hub/quizzes/route.ts`
- Create: `src/app/api/hub/quizzes/__tests__/publish.test.ts`
- Create: `src/lib/hub/quiz-metadata.ts` (validation helpers)
- Modify: `src/messages/en.json`, `src/messages/it.json`

**Steps**

- [ ] 11.1 **TEST FIRST.** Write `src/app/api/hub/quizzes/__tests__/publish.test.ts` covering:
  - Happy path: valid Bearer, valid metadata → 201 with `{ hubQuizId, version: 1, url }`.
  - Wrong scope: token has only `clone` → 403.
  - Wrong hash: server recompute mismatch → 400.
  - Invalid `schoolLevel` value → 400.
  - Invalid `subject` slug → 400.
  - Oversize payload → 413.
  - Re-publish with `If-Match` header: 200, `version: 2`, prior `HubQuizVersion` row inserted.

  Pseudocode for one test case:

  ```ts
  it("publishes a new quiz", async () => {
    // arrange installation + access token + qlzBase64
    const res = await POST(new Request("http://hub/api/hub/quizzes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${plaintextAccess}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        metadata: {
          title: "T", description: "D", license: "CC_BY", tags: ["t1"],
          schoolLevel: "SECONDARIA_II", subject: "matematica", language: "it",
          ageMin: 14, ageMax: 19, estimatedDurationSec: 600,
        },
        qlzBase64,
        payloadHash,
      }),
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.hubQuizId).toBeTruthy();
    expect(body.version).toBe(1);
  });
  ```

- [ ] 11.2 Run; expect failures.

- [ ] 11.3 Create `src/lib/hub/quiz-metadata.ts`:

  ```ts
  import { z } from "zod";
  import { SUBJECT_SLUGS } from "@/lib/quiz-subjects";

  export const ISO_639_1 = /^[a-z]{2}$/;

  export const publishMetadataSchema = z
    .object({
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      license: z.enum(["CC_BY", "CC_BY_SA"]).default("CC_BY"),
      tags: z.array(z.string().max(40)).max(20).default([]),
      schoolLevel: z.enum(["PRIMARIA", "SECONDARIA_I", "SECONDARIA_II", "UNIVERSITA", "ALTRO"]),
      subject: z.string().refine((s) => SUBJECT_SLUGS.includes(s), "invalid subject"),
      language: z.string().regex(ISO_639_1, "invalid language"),
      ageMin: z.number().int().min(3).max(120).optional(),
      ageMax: z.number().int().min(3).max(120).optional(),
      estimatedDurationSec: z.number().int().min(10).max(86400),
    })
    .refine(
      (m) => m.ageMin === undefined || m.ageMax === undefined || m.ageMin <= m.ageMax,
      { message: "ageMin > ageMax", path: ["ageMin"] },
    );

  export type PublishMetadata = z.infer<typeof publishMetadataSchema>;
  ```

  Note: ensure `src/lib/quiz-subjects.ts` (Plan 1) exports a `SUBJECT_SLUGS` constant; if it only exports the array, add `export const SUBJECT_SLUGS = QUIZ_SUBJECTS.map(s => s.slug);` here instead.

- [ ] 11.4 Create `src/app/api/hub/quizzes/route.ts`:

  ```ts
  import { NextRequest, NextResponse } from "next/server";
  import { createHash } from "crypto";
  import { prisma } from "@/lib/db/client";
  import { hashToken } from "@/lib/hub/token-hash";
  import { enforceHubRateLimit } from "@/lib/rate-limit/hub-rate-limit";
  import { publishMetadataSchema } from "@/lib/hub/quiz-metadata";

  const MAX_MB = Number(process.env.HUB_MAX_QUIZ_SIZE_MB ?? "50");
  const MAX_PER_ACCOUNT = Number(process.env.HUB_PUBLIC_QUIZZES_PER_ACCOUNT_MAX ?? "200");

  function bearer(req: NextRequest): string | null {
    const h = req.headers.get("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(h);
    return m ? m[1] : null;
  }

  async function authenticate(req: NextRequest, requiredScope: string) {
    const token = bearer(req);
    if (!token) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
    const row = await prisma.hubAccessToken.findUnique({
      where: { accessTokenHash: hashToken(token) },
    });
    if (!row || row.revokedAt || row.accessTokenExpiresAt < new Date()) {
      return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
    }
    if (!row.scopes.includes(requiredScope)) {
      return { error: NextResponse.json({ error: "insufficient_scope" }, { status: 403 }) };
    }
    await prisma.hubAccessToken.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });
    return { token: row };
  }

  export async function POST(req: NextRequest) {
    const a = await authenticate(req, "publish");
    if (a.error) return a.error;
    const { token } = a;

    await enforceHubRateLimit(`publish:${token.id}`, 10, 3600);

    let body: { metadata: unknown; qlzBase64: string; payloadHash: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    if (!body.qlzBase64 || !body.payloadHash) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const meta = publishMetadataSchema.safeParse(body.metadata);
    if (!meta.success) {
      return NextResponse.json(
        { error: "invalid_metadata", details: meta.error.flatten() },
        { status: 400 },
      );
    }

    let payload: Buffer;
    try {
      payload = Buffer.from(body.qlzBase64, "base64");
    } catch {
      return NextResponse.json({ error: "invalid_payload_b64" }, { status: 400 });
    }
    if (payload.length === 0) {
      return NextResponse.json({ error: "empty_payload" }, { status: 400 });
    }
    if (payload.length > MAX_MB * 1024 * 1024) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }

    const recomputed = createHash("sha256").update(payload).digest("hex");
    if (recomputed !== body.payloadHash) {
      return NextResponse.json({ error: "payload_hash_mismatch" }, { status: 400 });
    }

    // Validate the qlz contents minimally (manifest parses) and count questions.
    let questionCount = 0;
    try {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(payload);
      const manifestFile = zip.file("manifest.json");
      if (!manifestFile) {
        return NextResponse.json({ error: "missing_manifest" }, { status: 400 });
      }
      const manifest = JSON.parse(await manifestFile.async("text"));
      questionCount = Array.isArray(manifest?.quiz?.questions)
        ? manifest.quiz.questions.length
        : 0;
      if (questionCount === 0) {
        return NextResponse.json({ error: "no_questions" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "invalid_qlz" }, { status: 400 });
    }

    const ifMatch = req.headers.get("if-match");
    if (ifMatch) {
      // Re-publish path
      const existing = await prisma.hubQuiz.findUnique({ where: { id: ifMatch } });
      if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
      if (existing.hubAccountId !== token.hubAccountId) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      const nextVersion = existing.version + 1;
      const updated = await prisma.$transaction(async (tx) => {
        await tx.hubQuizVersion.create({
          data: {
            hubQuizId: existing.id,
            version: existing.version,
            payloadBlob: existing.payloadBlob,
            payloadHash: existing.payloadHash,
            payloadSize: existing.payloadSize,
          },
        });
        return tx.hubQuiz.update({
          where: { id: existing.id },
          data: {
            title: meta.data.title,
            description: meta.data.description,
            license: meta.data.license,
            tags: meta.data.tags,
            schoolLevel: meta.data.schoolLevel,
            subject: meta.data.subject,
            language: meta.data.language,
            ageMin: meta.data.ageMin,
            ageMax: meta.data.ageMax,
            questionCount,
            estimatedDurationSec: meta.data.estimatedDurationSec,
            payloadBlob: payload,
            payloadHash: recomputed,
            payloadSize: payload.length,
            version: nextVersion,
            unpublishedAt: null,
          },
        });
      });
      return NextResponse.json({
        hubQuizId: updated.id,
        version: updated.version,
        publishedAt: updated.updatedAt,
        url: `${new URL(req.url).origin}/q/${updated.id}`,
      });
    }

    // First-publish: enforce per-account limit
    const total = await prisma.hubQuiz.count({
      where: { hubAccountId: token.hubAccountId, unpublishedAt: null },
    });
    if (total >= MAX_PER_ACCOUNT) {
      return NextResponse.json({ error: "quota_exceeded" }, { status: 429 });
    }

    const created = await prisma.hubQuiz.create({
      data: {
        hubAccountId: token.hubAccountId,
        title: meta.data.title,
        description: meta.data.description,
        license: meta.data.license,
        tags: meta.data.tags,
        schoolLevel: meta.data.schoolLevel,
        subject: meta.data.subject,
        language: meta.data.language,
        ageMin: meta.data.ageMin,
        ageMax: meta.data.ageMax,
        questionCount,
        estimatedDurationSec: meta.data.estimatedDurationSec,
        payloadBlob: payload,
        payloadHash: recomputed,
        payloadSize: payload.length,
      },
    });
    await prisma.hubQuizVersion.create({
      data: {
        hubQuizId: created.id,
        version: 1,
        payloadBlob: payload,
        payloadHash: recomputed,
        payloadSize: payload.length,
      },
    });
    return NextResponse.json(
      {
        hubQuizId: created.id,
        version: 1,
        publishedAt: created.publishedAt,
        url: `${new URL(req.url).origin}/q/${created.id}`,
      },
      { status: 201 },
    );
  }
  ```

- [ ] 11.5 Run all tests written in 11.1. Expected: 7 passed.

- [ ] 11.6 Commit: `git add src/app/api/hub/quizzes src/lib/hub/quiz-metadata.ts && git commit -m "feat(hub): POST /api/hub/quizzes publish + re-publish (If-Match) with hash recompute"`.

---

### Task 12 — Hub `DELETE /api/hub/quizzes/:id` (unpublish)

**Files**
- Create: `src/app/api/hub/quizzes/[id]/route.ts`
- Create: `src/app/api/hub/quizzes/__tests__/unpublish.test.ts`

**Steps**

- [ ] 12.1 **TEST FIRST.**

  ```ts
  it("unpublishes only when author calls it", async () => {
    // arrange HubQuiz owned by ha1, access token for ha2
    const res = await DELETE(req, { params: Promise.resolve({ id: quizId }) });
    expect(res.status).toBe(403);
  });

  it("marks unpublishedAt when author calls it", async () => {
    const res = await DELETE(req, { params: Promise.resolve({ id: quizId }) });
    expect(res.status).toBe(200);
    const after = await prisma.hubQuiz.findUnique({ where: { id: quizId } });
    expect(after?.unpublishedAt).toBeInstanceOf(Date);
  });

  it("rejects insufficient scope (clone-only token)", async () => {
    const res = await DELETE(req, { params: Promise.resolve({ id: quizId }) });
    expect(res.status).toBe(403);
  });
  ```

- [ ] 12.2 Create `src/app/api/hub/quizzes/[id]/route.ts`:

  ```ts
  import { NextRequest, NextResponse } from "next/server";
  import { prisma } from "@/lib/db/client";
  import { hashToken } from "@/lib/hub/token-hash";

  function bearer(req: NextRequest): string | null {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
    return m ? m[1] : null;
  }

  export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const token = bearer(req);
    if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const row = await prisma.hubAccessToken.findUnique({
      where: { accessTokenHash: hashToken(token) },
    });
    if (!row || row.revokedAt || row.accessTokenExpiresAt < new Date()) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!row.scopes.includes("publish")) {
      return NextResponse.json({ error: "insufficient_scope" }, { status: 403 });
    }
    const { id } = await params;
    const quiz = await prisma.hubQuiz.findUnique({ where: { id } });
    if (!quiz) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (quiz.hubAccountId !== row.hubAccountId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    await prisma.hubQuiz.update({
      where: { id },
      data: { unpublishedAt: new Date() },
    });
    return NextResponse.json({ id, unpublishedAt: new Date() });
  }
  ```

- [ ] 12.3 Run tests. Expected: 3 passed.

- [ ] 12.4 Commit: `git add src/app/api/hub/quizzes/\[id\] && git commit -m "feat(hub): DELETE /api/hub/quizzes/:id unpublish"`.

---

### Task 13 — Installation publish proxy route

This route runs on the installation side. It builds the `.qlz` using the same logic as the existing `/api/quiz/:id/export` endpoint, computes the hash, calls the hub via `hub-client`, then updates the local `Quiz` row.

**Files**
- Create: `src/app/api/hub/quiz/[id]/publish/route.ts`
- Create: `src/app/api/hub/quiz/[id]/publish/__tests__/route.test.ts`
- Create: `src/lib/hub/qlz-builder.ts` (extracted, shared with `/api/quiz/:id/export`)
- Modify: `src/app/api/quiz/[id]/export/route.ts` (use the shared builder)

**Steps**

- [ ] 13.1 Extract the existing zip-building loop from `src/app/api/quiz/[id]/export/route.ts` into `src/lib/hub/qlz-builder.ts`:

  ```ts
  import JSZip from "jszip";
  import { readFile } from "fs/promises";
  import { existsSync } from "fs";
  import { join, extname } from "path";
  import { createHash } from "crypto";
  import type { QlzManifest } from "@/lib/validators/qlz";
  import type { Quiz, Question } from "@prisma/client";

  export async function buildQlz(
    quiz: Quiz & { questions: Question[] },
  ): Promise<{ buffer: Buffer; payloadHash: string }> {
    const zip = new JSZip();
    zip.folder("assets");
    const questionsManifest: QlzManifest["quiz"]["questions"] = [];

    for (let i = 0; i < quiz.questions.length; i++) {
      const q = quiz.questions[i];
      let imagePath: string | undefined;

      if (q.mediaUrl) {
        const ext = extname(q.mediaUrl).slice(1) || "bin";
        const assetName = `assets/q${i}.${ext}`;
        try {
          let buffer: Buffer;
          if (q.mediaUrl.startsWith("/uploads/")) {
            const filePath = join(process.cwd(), "public", q.mediaUrl);
            if (!existsSync(filePath)) throw new Error("not_found");
            buffer = await readFile(filePath);
          } else if (q.mediaUrl.startsWith("http")) {
            const r = await fetch(q.mediaUrl);
            if (!r.ok) throw new Error("fetch_failed");
            buffer = Buffer.from(await r.arrayBuffer());
          } else {
            throw new Error("unsupported");
          }
          zip.file(assetName, buffer);
          imagePath = assetName;
        } catch {
          /* skip image */
        }
      }

      questionsManifest.push({
        type: q.type as QlzManifest["quiz"]["questions"][number]["type"],
        text: q.text,
        ...(imagePath ? { image: imagePath } : {}),
        timeLimit: q.timeLimit,
        points: q.points,
        confidenceEnabled: q.confidenceEnabled,
        options: q.options as QlzManifest["quiz"]["questions"][number]["options"],
      });
    }

    const manifest: QlzManifest = {
      version: 1,
      exportedAt: new Date().toISOString(),
      quiz: {
        title: quiz.title,
        ...(quiz.description ? { description: quiz.description } : {}),
        tags: (quiz.tags as string[]) ?? [],
        questions: questionsManifest,
      },
    };
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const payloadHash = createHash("sha256").update(buffer).digest("hex");
    return { buffer, payloadHash };
  }
  ```

- [ ] 13.2 Refactor `src/app/api/quiz/[id]/export/route.ts` to call `buildQlz(quiz)` and return `buffer` with the existing headers (preserve existing behavior). Run the existing export integration test (must still pass).

- [ ] 13.3 **TEST FIRST** — `src/app/api/hub/quiz/[id]/publish/__tests__/route.test.ts`:

  ```ts
  it("publishes a local quiz to the hub and updates local row", async () => {
    // mock fetchWithTokenRefresh to return { hubQuizId, version, publishedAt, url }
    const res = await POST(new Request("http://app/api/hub/quiz/q1/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schoolLevel: "SECONDARIA_II",
        subject: "matematica",
        language: "it",
        license: "CC_BY",
        estimatedDurationSec: 600,
      }),
    }), { params: Promise.resolve({ id: "q1" }) });
    expect(res.status).toBe(200);
    const updated = await prisma.quiz.findUnique({ where: { id: "q1" } });
    expect(updated?.hubPublishedId).toBe("hub-1");
    expect(updated?.hubLastPublishedAt).toBeInstanceOf(Date);
  });

  it("returns reauth url when HubReauthRequiredError", async () => {
    // mock fetchWithTokenRefresh to throw HubReauthRequiredError
    const res = await POST(req, { params: Promise.resolve({ id: "q1" }) });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ reauthUrl: expect.stringContaining("/api/hub/oauth/start") });
  });

  it("re-publishes with If-Match when quiz already has hubPublishedId", async () => {
    // arrange local Quiz with hubPublishedId='existing-hub-1'
    const res = await POST(req, { params: Promise.resolve({ id: "q1" }) });
    expect(res.status).toBe(200);
    // assert fetchWithTokenRefresh was called with If-Match: 'existing-hub-1'
  });

  it("unpublishes when DELETE", async () => {
    const res = await DELETE(req, { params: Promise.resolve({ id: "q1" }) });
    expect(res.status).toBe(200);
    const updated = await prisma.quiz.findUnique({ where: { id: "q1" } });
    expect(updated?.hubPublishedId).toBeNull();
  });
  ```

- [ ] 13.4 Create `src/app/api/hub/quiz/[id]/publish/route.ts`:

  ```ts
  import { NextRequest, NextResponse } from "next/server";
  import { auth } from "@/lib/auth/config";
  import { prisma } from "@/lib/db/client";
  import { buildQlz } from "@/lib/hub/qlz-builder";
  import {
    fetchWithTokenRefresh,
    HubLinkMissingError,
    HubReauthRequiredError,
    getAuthorizeUrl,
  } from "@/lib/hub/hub-client";
  import { publishMetadataSchema } from "@/lib/hub/quiz-metadata";

  async function loadOwnedQuiz(userId: string, id: string) {
    return prisma.quiz.findFirst({
      where: { id, authorId: userId },
      include: { questions: { orderBy: { order: "asc" } } },
    });
  }

  export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const quiz = await loadOwnedQuiz(session.user.id, id);
    if (!quiz) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const overrides = await req.json().catch(() => ({}));
    const metadata = publishMetadataSchema.safeParse({
      title: quiz.title,
      description: quiz.description ?? undefined,
      license: quiz.license,
      tags: quiz.tags,
      schoolLevel: overrides.schoolLevel ?? quiz.schoolLevel,
      subject: overrides.subject ?? quiz.subject,
      language: overrides.language ?? quiz.language,
      ageMin: overrides.ageMin ?? quiz.ageMin ?? undefined,
      ageMax: overrides.ageMax ?? quiz.ageMax ?? undefined,
      estimatedDurationSec:
        overrides.estimatedDurationSec ??
        quiz.questions.reduce((s, q) => s + q.timeLimit, 0),
    });
    if (!metadata.success) {
      return NextResponse.json(
        { error: "invalid_metadata", details: metadata.error.flatten() },
        { status: 400 },
      );
    }

    const { buffer, payloadHash } = await buildQlz(quiz);
    const qlzBase64 = buffer.toString("base64");

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (quiz.hubPublishedId) headers["If-Match"] = quiz.hubPublishedId;

    let res: Response;
    try {
      res = await fetchWithTokenRefresh(session.user.id, "/api/hub/quizzes", {
        method: "POST",
        headers,
        body: JSON.stringify({ metadata: metadata.data, qlzBase64, payloadHash }),
      });
    } catch (e) {
      if (e instanceof HubReauthRequiredError || e instanceof HubLinkMissingError) {
        return NextResponse.json(
          { error: "reauth_required", reauthUrl: getAuthorizeUrl(id) },
          { status: 401 },
        );
      }
      return NextResponse.json({ error: "hub_unreachable" }, { status: 502 });
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return NextResponse.json({ error: "hub_rejected", hub: body }, { status: res.status });
    }
    const body = (await res.json()) as {
      hubQuizId: string;
      version: number;
      publishedAt: string;
      url: string;
    };
    const link = await prisma.hubLink.findUnique({
      where: { userId: session.user.id },
    });
    await prisma.quiz.update({
      where: { id },
      data: {
        hubPublishedId: body.hubQuizId,
        hubLastPublishedAt: new Date(body.publishedAt),
        hubAccountId: link?.hubAccountId,
      },
    });
    return NextResponse.json(body);
  }

  export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const quiz = await prisma.quiz.findFirst({
      where: { id, authorId: session.user.id },
    });
    if (!quiz || !quiz.hubPublishedId) {
      return NextResponse.json({ error: "not_published" }, { status: 404 });
    }
    let res: Response;
    try {
      res = await fetchWithTokenRefresh(
        session.user.id,
        `/api/hub/quizzes/${quiz.hubPublishedId}`,
        { method: "DELETE" },
      );
    } catch (e) {
      if (e instanceof HubReauthRequiredError || e instanceof HubLinkMissingError) {
        return NextResponse.json(
          { error: "reauth_required", reauthUrl: getAuthorizeUrl(id) },
          { status: 401 },
        );
      }
      return NextResponse.json({ error: "hub_unreachable" }, { status: 502 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: "hub_rejected" }, { status: res.status });
    }
    await prisma.quiz.update({
      where: { id },
      data: { hubPublishedId: null, hubLastPublishedAt: null, hubAccountId: null },
    });
    return NextResponse.json({ ok: true });
  }
  ```

- [ ] 13.5 Run all publish-proxy tests. Expected: 4 passed.

- [ ] 13.6 Commit: `git add src/app/api/hub/quiz src/lib/hub/qlz-builder.ts src/app/api/quiz/\[id\]/export && git commit -m "feat(hub): installation publish proxy + share .qlz builder"`.

---

### Task 14 — Publish modal UI

**Files**
- Create: `src/components/hub/publish-modal.tsx`
- Create: `src/components/hub/__tests__/publish-modal.test.tsx`
- Modify: `src/messages/en.json`, `src/messages/it.json`

**Steps**

- [ ] 14.1 Add i18n keys under `hub.publish`:

  ```json
  "hub": {
    "publish": {
      "title": "Publish to savint.it",
      "titleUpdate": "Update on savint.it",
      "connectAccountIntro": "To publish on savint.it you need to link a hub account.",
      "connectAccountCta": "Connect savint.it account",
      "schoolLevel": "School level",
      "subject": "Subject",
      "language": "Language",
      "ageMin": "Min age",
      "ageMax": "Max age",
      "license": "License",
      "estimatedDuration": "Estimated duration (seconds)",
      "consentReconfirm": "I confirm the publication declaration applies to this content.",
      "submit": "Publish",
      "submitUpdate": "Update",
      "submitting": "Publishing…",
      "success": "Published. Open on savint.it",
      "successUpdate": "Updated. Open on savint.it",
      "errorGeneric": "Could not publish. {error}",
      "errorTooLarge": "Quiz too large: {sizeMb} MB (max {maxMb} MB).",
      "errorQuota": "Hub account quota reached.",
      "errorReauth": "Please reauthorize savint.it access.",
      "cancel": "Cancel",
      "unpublish": "Unpublish"
    }
  }
  ```

- [ ] 14.2 **TEST FIRST** — `src/components/hub/__tests__/publish-modal.test.tsx`:

  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen, fireEvent, waitFor } from "@testing-library/react";
  import { PublishModal } from "@/components/hub/publish-modal";

  const baseQuiz = {
    id: "q1", title: "T", description: "",
    schoolLevel: "SECONDARIA_II" as const, subject: "matematica",
    language: "it", ageMin: 14, ageMax: 19,
    license: "CC_BY" as const, tags: [], hubPublishedId: null,
  };

  describe("PublishModal", () => {
    it("shows 'connect' CTA when not linked", () => {
      render(<PublishModal open quiz={baseQuiz} link={null} onClose={() => {}} />);
      expect(screen.getByRole("link", { name: /Connect savint.it account/i })).toBeInTheDocument();
    });

    it("shows publish form when linked", () => {
      render(<PublishModal open quiz={baseQuiz} link={{ hubAccountEmail: "h@x" }} onClose={() => {}} />);
      expect(screen.getByRole("button", { name: /^Publish$/i })).toBeInTheDocument();
    });

    it("submits and calls success handler", async () => {
      global.fetch = vi.fn(async () =>
        new Response(JSON.stringify({ hubQuizId: "H", version: 1, url: "https://savint.it/q/H" }), { status: 200 }),
      ) as any;
      const onSuccess = vi.fn();
      render(
        <PublishModal
          open
          quiz={baseQuiz}
          link={{ hubAccountEmail: "h@x" }}
          onClose={() => {}}
          onSuccess={onSuccess}
        />,
      );
      fireEvent.click(screen.getByLabelText(/consentReconfirm|publication declaration/i));
      fireEvent.click(screen.getByRole("button", { name: /^Publish$/i }));
      await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    });

    it("renders Update title when already published", () => {
      render(
        <PublishModal
          open
          quiz={{ ...baseQuiz, hubPublishedId: "H" }}
          link={{ hubAccountEmail: "h@x" }}
          onClose={() => {}}
        />,
      );
      expect(screen.getByText(/Update on savint.it/i)).toBeInTheDocument();
    });
  });
  ```

- [ ] 14.3 Create `src/components/hub/publish-modal.tsx`:

  ```tsx
  "use client";

  import { useState } from "react";
  import { useTranslations } from "next-intl";

  type Quiz = {
    id: string;
    title: string;
    description: string | null;
    schoolLevel: "PRIMARIA" | "SECONDARIA_I" | "SECONDARIA_II" | "UNIVERSITA" | "ALTRO" | null;
    subject: string | null;
    language: string | null;
    ageMin: number | null;
    ageMax: number | null;
    license: "CC_BY" | "CC_BY_SA";
    tags: string[];
    hubPublishedId: string | null;
  };

  type Props = {
    open: boolean;
    quiz: Quiz;
    link: { hubAccountEmail: string } | null;
    onClose: () => void;
    onSuccess?: (result: { hubQuizId: string; url: string; version: number }) => void;
  };

  export function PublishModal({ open, quiz, link, onClose, onSuccess }: Props) {
    const t = useTranslations("hub.publish");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [consent, setConsent] = useState(false);
    const [form, setForm] = useState({
      schoolLevel: quiz.schoolLevel ?? "SECONDARIA_II",
      subject: quiz.subject ?? "",
      language: quiz.language ?? "it",
      ageMin: quiz.ageMin ?? "",
      ageMax: quiz.ageMax ?? "",
      license: quiz.license,
      estimatedDurationSec: 600,
    });

    if (!open) return null;
    const isUpdate = Boolean(quiz.hubPublishedId);

    async function handleSubmit() {
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch(`/api/hub/quiz/${quiz.id}/publish`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            schoolLevel: form.schoolLevel,
            subject: form.subject,
            language: form.language,
            ageMin: form.ageMin === "" ? undefined : Number(form.ageMin),
            ageMax: form.ageMax === "" ? undefined : Number(form.ageMax),
            estimatedDurationSec: Number(form.estimatedDurationSec),
          }),
        });
        if (res.status === 401) {
          const body = await res.json().catch(() => ({}));
          if (body.reauthUrl) {
            window.location.href = body.reauthUrl;
            return;
          }
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? "unknown");
        }
        const body = (await res.json()) as { hubQuizId: string; url: string; version: number };
        onSuccess?.(body);
        onClose();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSubmitting(false);
      }
    }

    return (
      <div role="dialog" aria-modal className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
          <h2 className="text-lg font-semibold">{isUpdate ? t("titleUpdate") : t("title")}</h2>

          {!link ? (
            <>
              <p className="mt-2 text-sm text-gray-600">{t("connectAccountIntro")}</p>
              <a
                href={`/api/hub/oauth/start?quizId=${quiz.id}&scopes=publish%20clone`}
                className="mt-4 inline-block rounded bg-emerald-600 px-4 py-2 text-white"
              >
                {t("connectAccountCta")}
              </a>
            </>
          ) : (
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label htmlFor="sl">{t("schoolLevel")}</label>
                <select
                  id="sl"
                  className="ml-2 rounded border"
                  value={form.schoolLevel}
                  onChange={(e) => setForm({ ...form, schoolLevel: e.target.value as typeof form.schoolLevel })}
                >
                  <option value="PRIMARIA">PRIMARIA</option>
                  <option value="SECONDARIA_I">SECONDARIA_I</option>
                  <option value="SECONDARIA_II">SECONDARIA_II</option>
                  <option value="UNIVERSITA">UNIVERSITA</option>
                  <option value="ALTRO">ALTRO</option>
                </select>
              </div>
              <div>
                <label htmlFor="sub">{t("subject")}</label>
                <input
                  id="sub"
                  className="ml-2 rounded border"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="lang">{t("language")}</label>
                <input
                  id="lang"
                  className="ml-2 w-16 rounded border"
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                />
              </div>
              <div className="flex gap-4">
                <label>
                  {t("ageMin")}
                  <input
                    type="number"
                    className="ml-2 w-20 rounded border"
                    value={form.ageMin}
                    onChange={(e) => setForm({ ...form, ageMin: e.target.value as unknown as number })}
                  />
                </label>
                <label>
                  {t("ageMax")}
                  <input
                    type="number"
                    className="ml-2 w-20 rounded border"
                    value={form.ageMax}
                    onChange={(e) => setForm({ ...form, ageMax: e.target.value as unknown as number })}
                  />
                </label>
              </div>
              <div>
                <label htmlFor="lic">{t("license")}</label>
                <select
                  id="lic"
                  className="ml-2 rounded border"
                  value={form.license}
                  onChange={(e) => setForm({ ...form, license: e.target.value as typeof form.license })}
                >
                  <option value="CC_BY">CC BY</option>
                  <option value="CC_BY_SA">CC BY-SA</option>
                </select>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  aria-label={t("consentReconfirm")}
                />
                {t("consentReconfirm")}
              </label>
              {error && <p role="alert" className="text-red-600">{error}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={onClose} className="rounded border px-3 py-1">
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  disabled={!consent || submitting}
                  onClick={handleSubmit}
                  className="rounded bg-emerald-600 px-3 py-1 text-white disabled:opacity-50"
                >
                  {submitting ? t("submitting") : isUpdate ? t("submitUpdate") : t("submit")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  ```

- [ ] 14.4 Run tests. Expected: 4 passed.

- [ ] 14.5 Commit: `git add src/components/hub src/messages/en.json src/messages/it.json && git commit -m "feat(hub): PublishModal (connect-or-publish, with update + reauth)"`.

---

### Task 15 — Publish button in the quiz editor

**Files**
- Create: `src/components/hub/publish-button.tsx`
- Modify: `src/components/quiz/quiz-editor.tsx`
- Create: `src/components/quiz/__tests__/quiz-editor.publish-button.test.tsx`

**Steps**

- [ ] 15.1 **TEST FIRST.**

  ```tsx
  import { render, screen } from "@testing-library/react";
  import { describe, it, expect, vi } from "vitest";
  import { PublishButton } from "@/components/hub/publish-button";

  describe("PublishButton", () => {
    it("renders when SAVINT_HUB_URL is configured and user owns the quiz", () => {
      render(<PublishButton hubEnabled quiz={{ id: "q1", hubPublishedId: null }} link={null} />);
      expect(screen.getByRole("button", { name: /Publish to savint.it/i })).toBeInTheDocument();
    });

    it("renders 'Update' when already published", () => {
      render(<PublishButton hubEnabled quiz={{ id: "q1", hubPublishedId: "H" }} link={{ hubAccountEmail: "h@x" }} />);
      expect(screen.getByRole("button", { name: /Update on savint.it/i })).toBeInTheDocument();
    });

    it("renders nothing when hub disabled", () => {
      const { container } = render(<PublishButton hubEnabled={false} quiz={{ id: "q1", hubPublishedId: null }} link={null} />);
      expect(container.firstChild).toBeNull();
    });
  });
  ```

- [ ] 15.2 Create `src/components/hub/publish-button.tsx`:

  ```tsx
  "use client";
  import { useState } from "react";
  import { useTranslations } from "next-intl";
  import { PublishModal } from "@/components/hub/publish-modal";

  type Props = {
    hubEnabled: boolean;
    quiz: Parameters<typeof PublishModal>[0]["quiz"];
    link: { hubAccountEmail: string } | null;
  };

  export function PublishButton({ hubEnabled, quiz, link }: Props) {
    const t = useTranslations("hub.publish");
    const [open, setOpen] = useState(false);
    if (!hubEnabled) return null;
    const label = quiz.hubPublishedId ? t("titleUpdate") : t("title");
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white"
        >
          {label}
        </button>
        <PublishModal open={open} quiz={quiz} link={link} onClose={() => setOpen(false)} />
      </>
    );
  }
  ```

- [ ] 15.3 Modify `src/components/quiz/quiz-editor.tsx`: add an import for `PublishButton` and render it next to `<ShareDialog>` / `<TestQuizButton>`. The parent server page must pass `hubEnabled` (from `hasHubOAuthConfig()` evaluated server-side) and `link` (`prisma.hubLink.findUnique({ where: { userId } })` projected to `{ hubAccountEmail }`). Add the two new props to the editor component signature and thread them through.

  Concrete diff (illustrative — exact line numbers depend on file at time of execution; preserve existing markup):

  ```diff
   import { ShareDialog } from "@/components/quiz/share-dialog";
   import { TestQuizButton } from "@/components/quiz/test-quiz-button";
  +import { PublishButton } from "@/components/hub/publish-button";

   type Props = {
     initialData?: ...;
  +  hubEnabled?: boolean;
  +  hubLink?: { hubAccountEmail: string } | null;
   };

  ...
           {initialData?.id && <ShareDialog quizId={initialData.id} />}
           {initialData?.id && <TestQuizButton quizId={initialData.id} />}
  +        {initialData?.id && (
  +          <PublishButton
  +            hubEnabled={Boolean(hubEnabled)}
  +            quiz={{
  +              id: initialData.id,
  +              title: initialData.title,
  +              description: initialData.description ?? null,
  +              schoolLevel: initialData.schoolLevel ?? null,
  +              subject: initialData.subject ?? null,
  +              language: initialData.language ?? null,
  +              ageMin: initialData.ageMin ?? null,
  +              ageMax: initialData.ageMax ?? null,
  +              license: initialData.license,
  +              tags: initialData.tags ?? [],
  +              hubPublishedId: initialData.hubPublishedId ?? null,
  +            }}
  +            link={hubLink ?? null}
  +          />
  +        )}
  ```

  Update the consumers of `<QuizEditor>` (the editor page server component) to fetch `hubLink` and pass `hubEnabled={hasHubOAuthConfig()}`.

- [ ] 15.4 Run tests. Expected: 3 passed.

- [ ] 15.5 Commit: `git add src/components/hub/publish-button.tsx src/components/quiz/quiz-editor.tsx src/components/quiz/__tests__/quiz-editor.publish-button.test.tsx && git commit -m "feat(hub): Publish button in quiz editor"`.

---

### Task 16 — Hub revoke endpoint + installation link page

**Files**
- Create: `src/app/api/hub/oauth/revoke/route.ts` (hub side)
- Create: `src/app/api/hub/oauth/link/route.ts` (installation side, DELETE)
- Create: `src/app/(app)/account/hub-link/page.tsx`
- Create: `src/app/api/hub/oauth/revoke/__tests__/route.test.ts`
- Modify: `src/messages/en.json`, `src/messages/it.json`

**Steps**

- [ ] 16.1 **TEST FIRST** — hub revoke endpoint:

  ```ts
  it("revokes the access token presented in body and its refresh chain", async () => {
    const res = await POST(new Request("http://hub/api/hub/oauth/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: plaintextAccess,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    }));
    expect(res.status).toBe(200);
    const after = await prisma.hubAccessToken.findUnique({ where: { id: tokenId } });
    expect(after?.revokedAt).toBeInstanceOf(Date);
  });
  ```

- [ ] 16.2 Create `src/app/api/hub/oauth/revoke/route.ts`:

  ```ts
  import { NextRequest, NextResponse } from "next/server";
  import { prisma } from "@/lib/db/client";
  import { hashToken } from "@/lib/hub/token-hash";
  import { verifyPassword } from "@/lib/auth/password";

  export async function POST(req: NextRequest) {
    const params = new URLSearchParams(await req.text());
    const clientId = params.get("client_id");
    const clientSecret = params.get("client_secret");
    const token = params.get("token");
    if (!clientId || !clientSecret || !token) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const inst = await prisma.installation.findUnique({ where: { clientId } });
    if (!inst || !(await verifyPassword(clientSecret, inst.clientSecretHash))) {
      return NextResponse.json({ error: "invalid_client" }, { status: 401 });
    }
    const tokenHash = hashToken(token);
    const row =
      (await prisma.hubAccessToken.findUnique({ where: { accessTokenHash: tokenHash } })) ??
      (await prisma.hubAccessToken.findUnique({ where: { refreshTokenHash: tokenHash } }));
    if (row && row.installationId === inst.id) {
      await prisma.hubAccessToken.updateMany({
        where: {
          hubAccountId: row.hubAccountId,
          installationId: inst.id,
          revokedAt: null,
        },
        data: { revokedAt: new Date(), revokedReason: "user_revoked" },
      });
    }
    return NextResponse.json({ ok: true });
  }
  ```

- [ ] 16.3 Create `src/app/api/hub/oauth/link/route.ts` (installation side):

  ```ts
  import { NextResponse } from "next/server";
  import { auth } from "@/lib/auth/config";
  import { prisma } from "@/lib/db/client";
  import { decryptToken } from "@/lib/hub/token-crypto";
  import { getHubOAuthConfig } from "@/lib/hub/oauth-config";

  export async function DELETE() {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const link = await prisma.hubLink.findUnique({ where: { userId: session.user.id } });
    if (!link) return NextResponse.json({ ok: true });

    try {
      const cfg = getHubOAuthConfig();
      const token = decryptToken(link.accessTokenCiphertext, process.env.NEXTAUTH_SECRET ?? "");
      await fetch(`${cfg.hubUrl}/api/hub/oauth/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
        }).toString(),
      });
    } catch {
      /* best-effort */
    }
    await prisma.hubLink.update({
      where: { id: link.id },
      data: { revokedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }
  ```

- [ ] 16.4 Add i18n keys under `hub.link`:

  ```json
  "hub": {
    "link": {
      "title": "savint.it account link",
      "linkedAs": "Linked as {email}",
      "notLinked": "No hub account linked yet.",
      "revoke": "Revoke",
      "connect": "Connect savint.it account",
      "revoking": "Revoking…",
      "revoked": "Link revoked."
    }
  }
  ```

- [ ] 16.5 Create `src/app/(app)/account/hub-link/page.tsx`:

  ```tsx
  import { auth } from "@/lib/auth/config";
  import { prisma } from "@/lib/db/client";
  import { redirect } from "next/navigation";
  import { getTranslations } from "next-intl/server";
  import { hasHubOAuthConfig } from "@/lib/hub/oauth-config";
  import { RevokeButton } from "./revoke-button";

  export default async function HubLinkPage() {
    const t = await getTranslations("hub.link");
    const session = await auth();
    if (!session?.user?.id) redirect("/login");
    if (!hasHubOAuthConfig()) return <p>{t("notLinked")}</p>;
    const link = await prisma.hubLink.findUnique({
      where: { userId: session.user.id },
    });
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        {link && !link.revokedAt ? (
          <>
            <p className="mt-2 text-sm">{t("linkedAs", { email: link.hubAccountEmail })}</p>
            <RevokeButton />
          </>
        ) : (
          <a className="mt-4 inline-block rounded bg-emerald-600 px-4 py-2 text-white"
             href="/api/hub/oauth/start?scopes=publish%20clone">
            {t("connect")}
          </a>
        )}
      </main>
    );
  }
  ```

- [ ] 16.6 Create `src/app/(app)/account/hub-link/revoke-button.tsx`:

  ```tsx
  "use client";
  import { useState } from "react";
  import { useTranslations } from "next-intl";
  import { useRouter } from "next/navigation";

  export function RevokeButton() {
    const t = useTranslations("hub.link");
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    return (
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await fetch("/api/hub/oauth/link", { method: "DELETE" });
          router.refresh();
          setBusy(false);
        }}
        className="mt-3 rounded border px-3 py-1 text-sm"
      >
        {busy ? t("revoking") : t("revoke")}
      </button>
    );
  }
  ```

- [ ] 16.7 Run tests. Expected: revoke route tests pass.

- [ ] 16.8 Commit: `git add src/app/api/hub/oauth/revoke src/app/api/hub/oauth/link src/app/\(app\)/account/hub-link src/messages/en.json src/messages/it.json && git commit -m "feat(hub): revoke endpoint + installation hub-link account page"`.

---

### Task 17 — Hub `/q/[id]` placeholder page

**Files**
- Create: `src/app/(hub)/q/[id]/page.tsx`
- Create: `src/app/(hub)/q/[id]/__tests__/page.test.tsx`

**Steps**

- [ ] 17.1 **TEST FIRST.**

  ```tsx
  import { render, screen } from "@testing-library/react";
  import { describe, it, expect, vi } from "vitest";
  import Page from "@/app/(hub)/q/[id]/page";

  vi.mock("@/lib/db/client", () => ({
    prisma: {
      hubQuiz: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          where.id === "found"
            ? {
                id: "found", title: "T", language: "it",
                hubAccountId: "ha",
                schoolLevel: "SECONDARIA_II",
                subject: "matematica",
                publishedAt: new Date("2026-05-17T10:00:00Z"),
                updatedAt: new Date("2026-05-17T10:00:00Z"),
                version: 2,
                downloadsCount: 0, playsCount: 0,
                description: null,
                unpublishedAt: null,
                suspended: false,
              }
            : null,
        ),
      },
      hubAccount: {
        findUnique: vi.fn(async () => ({ name: "Maria Rossi" })),
      },
    },
  }));

  describe("/q/:id page", () => {
    it("renders title, author, published-at for a found quiz", async () => {
      const ui = await Page({ params: Promise.resolve({ id: "found" }) });
      render(ui);
      expect(screen.getByText("T")).toBeInTheDocument();
      expect(screen.getByText(/Maria Rossi/)).toBeInTheDocument();
      expect(screen.getByText(/v2/)).toBeInTheDocument();
    });

    it("shows withdrawn banner for unpublishedAt", async () => {
      const { prisma } = await import("@/lib/db/client");
      (prisma.hubQuiz.findUnique as any).mockResolvedValueOnce({
        id: "withdrawn", title: "X", description: null, hubAccountId: "ha",
        schoolLevel: "ALTRO", subject: "altro", language: "it",
        publishedAt: new Date(), updatedAt: new Date(), version: 1,
        downloadsCount: 0, playsCount: 0,
        unpublishedAt: new Date(), suspended: false,
      });
      const ui = await Page({ params: Promise.resolve({ id: "withdrawn" }) });
      render(ui);
      expect(screen.getByText(/withdrawn/i)).toBeInTheDocument();
    });

    it("returns 404 for an unknown id", async () => {
      const ui = await Page({ params: Promise.resolve({ id: "missing" }) });
      render(ui);
      expect(screen.getByText(/Not found|not_found/i)).toBeInTheDocument();
    });
  });
  ```

- [ ] 17.2 Create `src/app/(hub)/q/[id]/page.tsx`:

  ```tsx
  import { prisma } from "@/lib/db/client";
  import { notFound } from "next/navigation";

  export default async function HubQuizPage({
    params,
  }: {
    params: Promise<{ id: string }>;
  }) {
    const { id } = await params;
    const quiz = await prisma.hubQuiz.findUnique({ where: { id } });
    if (!quiz) {
      return <main className="mx-auto max-w-2xl p-6"><p>Not found</p></main>;
    }
    const author = await prisma.hubAccount.findUnique({
      where: { id: quiz.hubAccountId },
      select: { name: true },
    });
    return (
      <main className="mx-auto max-w-2xl p-6">
        {quiz.unpublishedAt && (
          <p className="mb-4 rounded bg-amber-100 p-3 text-sm">
            This quiz has been withdrawn by the author.
          </p>
        )}
        {quiz.suspended && (
          <p className="mb-4 rounded bg-red-100 p-3 text-sm">
            This quiz has been suspended for review.
          </p>
        )}
        <h1 className="text-2xl font-semibold">{quiz.title}</h1>
        <p className="mt-1 text-sm text-gray-600">
          by {author?.name ?? "Unknown"} · v{quiz.version} ·{" "}
          {quiz.publishedAt.toISOString().slice(0, 10)}
        </p>
        {quiz.description && <p className="mt-4 text-sm">{quiz.description}</p>}
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <dt>Level</dt><dd>{quiz.schoolLevel}</dd>
          <dt>Subject</dt><dd>{quiz.subject}</dd>
          <dt>Language</dt><dd>{quiz.language}</dd>
        </dl>
      </main>
    );
  }
  ```

- [ ] 17.3 Run tests. Expected: 3 passed.

- [ ] 17.4 Commit: `git add src/app/\(hub\)/q && git commit -m "feat(hub): minimal /q/:id detail placeholder page (Plan 4 will expand)"`.

---

### Task 18 — Refresh-replay end-to-end unit test

**Files**
- Create: `src/app/api/hub/oauth/token/__tests__/refresh-replay.test.ts`

**Steps**

- [ ] 18.1 **TEST.**

  ```ts
  import { describe, it, expect, beforeAll } from "vitest";
  import { POST } from "@/app/api/hub/oauth/token/route";
  import { prisma } from "@/lib/db/client";
  import { hashPassword } from "@/lib/auth/password";

  describe("refresh-token rotation + replay detection", () => {
    let clientId: string;
    let clientSecret: string;
    let installationId: string;

    const fields = async (form: Record<string, string>) =>
      POST(new Request("http://h/api/hub/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form).toString(),
      }));

    beforeAll(async () => {
      clientId = `c-rr-${Date.now()}`;
      clientSecret = "rr-secret";
      const i = await prisma.installation.create({
        data: {
          name: "RR", contactEmail: "rr@x",
          clientId, clientSecretHash: await hashPassword(clientSecret),
        },
      });
      installationId = i.id;
    });

    it("rotates on each refresh and revokes chain on replay", async () => {
      // seed a HubAccessToken directly
      const seedAccess = "seed-at-rr";
      const seedRefresh = "seed-rt-rr";
      const { hashToken } = await import("@/lib/hub/token-hash");
      await prisma.hubAccessToken.create({
        data: {
          hubAccountId: "ha-rr",
          installationId,
          accessTokenHash: hashToken(seedAccess),
          refreshTokenHash: hashToken(seedRefresh),
          accessTokenExpiresAt: new Date(Date.now() + 900_000),
          refreshTokenExpiresAt: new Date(Date.now() + 90 * 86400_000),
          scopes: ["publish"],
        },
      });

      const r1 = await fields({
        grant_type: "refresh_token",
        refresh_token: seedRefresh,
        client_id: clientId,
        client_secret: clientSecret,
      });
      expect(r1.status).toBe(200);
      const b1 = await r1.json();

      // legitimate refresh again with new token works
      const r2 = await fields({
        grant_type: "refresh_token",
        refresh_token: b1.refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      });
      expect(r2.status).toBe(200);

      // replay of the original seedRefresh now fails AND revokes chain
      const r3 = await fields({
        grant_type: "refresh_token",
        refresh_token: seedRefresh,
        client_id: clientId,
        client_secret: clientSecret,
      });
      expect(r3.status).toBe(400);

      const revoked = await prisma.hubAccessToken.findMany({
        where: { installationId, revokedAt: { not: null } },
      });
      expect(revoked.length).toBeGreaterThanOrEqual(2);
    });
  });
  ```

- [ ] 18.2 Run. Expected: passes (logic already implemented in Task 7).

- [ ] 18.3 Commit: `git add src/app/api/hub/oauth/token/__tests__/refresh-replay.test.ts && git commit -m "test(hub): refresh-token rotation and replay-detection chain revocation"`.

---

### Task 19 — Multi-server Playwright E2E

**Files**
- Create: `tests/e2e/hub-publish.spec.ts`
- Create: `tests/e2e/helpers/spawn-savint.ts`
- Modify: `playwright.config.ts`

**Steps**

- [ ] 19.1 Create `tests/e2e/helpers/spawn-savint.ts`:

  ```ts
  import { spawn, ChildProcess } from "child_process";
  import { setTimeout as wait } from "timers/promises";

  export type Spawned = { proc: ChildProcess; baseURL: string };

  export async function spawnSavint(opts: {
    mode: "hub" | "installation";
    port: number;
    extraEnv?: Record<string, string>;
  }): Promise<Spawned> {
    const env = {
      ...process.env,
      SAVINT_MODE: opts.mode,
      PORT: String(opts.port),
      NODE_ENV: "test",
      ...opts.extraEnv,
    };
    const proc = spawn("npx", ["next", "start", "-p", String(opts.port)], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const baseURL = `http://localhost:${opts.port}`;
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`${baseURL}/api/health`);
        if (r.ok) return { proc, baseURL };
      } catch {}
      await wait(500);
    }
    proc.kill();
    throw new Error(`SAVINT ${opts.mode} did not become ready on ${opts.port}`);
  }

  export function killSavint(s: Spawned | null) {
    if (s) s.proc.kill("SIGTERM");
  }
  ```

- [ ] 19.2 Create `tests/e2e/hub-publish.spec.ts`:

  ```ts
  import { test, expect } from "@playwright/test";
  import { spawnSavint, killSavint, Spawned } from "./helpers/spawn-savint";
  import { prisma } from "../../src/lib/db/client";
  import { hashPassword } from "../../src/lib/auth/password";

  let hub: Spawned | null = null;
  let inst: Spawned | null = null;

  test.beforeAll(async () => {
    // Provision an Installation row on the hub DB so OAuth works.
    const clientId = "e2e-installation";
    const clientSecret = "e2e-installation-secret";
    await prisma.installation.upsert({
      where: { clientId },
      create: {
        name: "E2E School",
        contactEmail: "e2e@x",
        clientId,
        clientSecretHash: await hashPassword(clientSecret),
      },
      update: {},
    });

    hub = await spawnSavint({ mode: "hub", port: 4001 });
    inst = await spawnSavint({
      mode: "installation",
      port: 4000,
      extraEnv: {
        SAVINT_HUB_URL: "http://localhost:4001",
        HUB_OAUTH_CLIENT_ID: clientId,
        HUB_OAUTH_CLIENT_SECRET: clientSecret,
      },
    });
  });

  test.afterAll(() => {
    killSavint(hub);
    killSavint(inst);
  });

  test("teacher links hub account and publishes a quiz", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // 1) Register hub account
    await page.goto("http://localhost:4001/register");
    await page.getByLabel("Email").fill("teacher@e2e");
    await page.getByLabel("Password").fill("Password123!");
    await page.getByRole("button", { name: /Sign up|Register/i }).click();

    // 2) Log in as a teacher on the installation (uses dev login route from Plan 2)
    await page.goto("http://localhost:4000/api/auth/dev-login?email=t1@e2e");

    // 3) Create a minimal quiz (use seed route from Plan 1 if present)
    await page.goto("http://localhost:4000/api/test/seed-quiz?title=E2E+Quiz");

    // 4) Open the editor and click "Publish to savint.it"
    await page.goto("http://localhost:4000/quiz/latest/edit");
    await page.getByRole("button", { name: /Publish to savint.it/i }).click();
    await page.getByRole("link", { name: /Connect savint.it account/i }).click();

    // 5) Approve consent on the hub
    await page.getByRole("button", { name: /^Allow$/i }).click();

    // 6) Back on installation: complete publish form & submit
    await expect(page).toHaveURL(/quiz\/.*hubLinked=1/);
    await page.getByRole("button", { name: /Publish to savint.it/i }).click();
    await page.getByLabel(/School level/i).selectOption("SECONDARIA_II");
    await page.getByLabel(/^Subject$/i).fill("matematica");
    await page.getByLabel(/Language/i).fill("it");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /^Publish$/i }).click();

    // 7) Open hub URL and verify
    await page.waitForTimeout(500);
    const last = await prisma.hubQuiz.findFirst({ orderBy: { publishedAt: "desc" } });
    expect(last?.title).toBe("E2E Quiz");
    const hubPage = await ctx.newPage();
    await hubPage.goto(`http://localhost:4001/q/${last!.id}`);
    await expect(hubPage.getByText("E2E Quiz")).toBeVisible();
  });
  ```

- [ ] 19.3 Modify `playwright.config.ts` to include the new `tests/e2e/hub-publish.spec.ts` and set a longer timeout (`timeout: 120_000` for this file via `test.describe.configure`).

- [ ] 19.4 Build production bundle once: `npm run build`.

- [ ] 19.5 Run only this spec: `npx playwright test tests/e2e/hub-publish.spec.ts --project=chromium`. Expected: 1 passed.

- [ ] 19.6 Commit: `git add tests/e2e/hub-publish.spec.ts tests/e2e/helpers/spawn-savint.ts playwright.config.ts && git commit -m "test(hub): multi-server Playwright E2E for OAuth link + publish"`.

---

### Task 20 — Acceptance criteria & doc update

**Files**
- Modify: `README.md` (small note under "Hub" section)
- Modify: `docs/superpowers/specs/2026-05-17-online-quiz-repository-design.md` (mark Plan 3 status: implemented)

**Steps**

- [ ] 20.1 Run the full unit + integration suite: `npx vitest run`. Expected: all green.

- [ ] 20.2 Run the full Playwright suite: `npx playwright test`. Expected: all green.

- [ ] 20.3 Add a one-paragraph "Publishing to savint.it" section to `README.md` under the existing hub mention (mirror in `README.it.md`):

  ```
  ### Publishing to savint.it

  When `SAVINT_HUB_URL`, `HUB_OAUTH_CLIENT_ID`, and `HUB_OAUTH_CLIENT_SECRET`
  are configured, teachers see a "Publish to savint.it" button in the quiz
  editor. The first click triggers an OAuth consent flow on the hub; once the
  account is linked, subsequent publishes are one-click. Republishing the same
  quiz increments the version on the hub. Linked accounts and revocation are
  managed at `/account/hub-link`.
  ```

- [ ] 20.4 Commit: `git add README.md README.it.md docs/superpowers/specs/2026-05-17-online-quiz-repository-design.md && git commit -m "docs(hub): publish flow and account-link page"`.

---

## Acceptance criteria for Plan 3

- A logged-in teacher whose installation has `SAVINT_HUB_URL` / `HUB_OAUTH_CLIENT_ID` / `HUB_OAUTH_CLIENT_SECRET` configured can:
  1. See a "Publish to savint.it" button in the quiz editor.
  2. Be redirected to `/oauth/authorize` on the hub, see the school name and scopes, click Allow.
  3. Land back on the installation with a `HubLink` row created (encrypted tokens at rest).
  4. Fill the publish form (required: schoolLevel/subject/language), tick consent, submit.
  5. See the published quiz at `https://savint.it/q/<id>` with title, author name, level/subject/language.
  6. Re-publish from the same modal — version increments and a `HubQuizVersion` row is archived.
  7. Unpublish from the modal — the URL still resolves but shows "withdrawn".
  8. Revoke the hub link from `/account/hub-link` — installation's `HubLink.revokedAt` is set and the hub's `HubAccessToken` rows for that account+installation are revoked.
- Refresh-token rotation: a refresh produces a new access+refresh pair; reusing a rotated refresh token revokes the entire chain.
- Server-side validation: `payloadHash` mismatch → 400; oversize → 413; invalid `subject` → 400; quota exceeded → 429; wrong scope → 403; expired token → 401.
- All publish, refresh and authorize endpoints enforce the rate limits from spec Section 9.
- Multi-server E2E test passes from a clean DB.

---

## Open questions / assumptions

- Assumes Plan 1 exports `SUBJECT_SLUGS` (a `readonly string[]`) from `src/lib/quiz-subjects.ts`. If not, Task 11 derives it locally.
- Assumes Plan 2 exposes `enforceHubRateLimit(key, limit, windowSeconds)` from `src/lib/rate-limit/hub-rate-limit.ts` and `hashPassword`/`verifyPassword` from `src/lib/auth/password.ts`.
- Assumes Plan 2 added the `HubAccount` model with `id`, `email`, `name`. Task 17 reads `hubAccount.findUnique({ select: { name: true } })`.
- Assumes a `/api/health` endpoint exists for the Playwright readiness probe. If not, replace with a TCP-probe loop on the port.
- The hub `/q/:id` page intentionally minimal here — Plan 4 owns the full detail page, question preview, "Try now", "Clone", "Download .qlz", "Report".
- The cloning + browse endpoints (`GET /api/hub/quizzes`, `/api/hub/quizzes/:id/download`) are Plan 4.
- Both modes share a single Postgres database in dev/CI; production hub and installations always have separate databases.
