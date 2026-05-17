# Online Quiz Repository (savint.it Hub) — Design Spec

**Date:** 2026-05-17
**Status:** Approved for implementation planning
**Scope:** Build a centralized online repository at `savint.it` where all SAVINT installations can search, clone, and publish quizzes; and where anonymous users can browse and self-practice quizzes directly from the web.

---

## 1. Goals and non-goals

### Goals

- Teachers from any SAVINT installation can publish their quizzes to a public catalog at `savint.it`.
- Teachers from any SAVINT installation can search the public catalog and clone quizzes into their own library.
- Anyone (no account required) can browse the public catalog and play any quiz in self-practice mode directly on `savint.it`.
- Quiz authors keep ownership: they can update or unpublish their published quizzes; the local installation is the source of truth.
- The hub respects the existing license model (CC BY / CC BY-SA) and consent flow (`QUIZ_PUBLISH_DECLARATION`).
- Moderation reuses the existing post-publication report model already implemented locally.
- The same codebase serves both an installation and the hub, switched by a single env var.

### Non-goals

- No peer-to-peer federation between installations. The model is strictly hub-and-spoke.
- No comments, ratings, reviews, or social interactions (following, messaging).
- No public forking workflow distinct from clone (clone is private to the cloner).
- No collections or quiz bundles.
- No aggregated cross-installation statistics; per-session stats stay private to each installation.
- No offline catalog caching in the installation (online only).
- No self-service installation onboarding in v1 (manual credential provisioning by hub admins).
- No object storage for images in v1 (base64 inline in `.qlz`; revisit in phase 2).

---

## 2. Architecture overview

### Dual-mode codebase

A single environment variable `SAVINT_MODE` switches the application between two roles:

- `SAVINT_MODE=installation` (default): existing SAVINT behavior. School self-hosts. Two new entry points are added to the teacher dashboard: "Publish to savint.it" (per-quiz action) and "Browse public repository" (sidebar nav). Both talk to the configured `SAVINT_HUB_URL` over HTTPS.
- `SAVINT_MODE=hub`: special deployment at `savint.it`. Exposes hub-only endpoints under `/api/hub/*`, the public browse site (`/explore`), the OAuth provider endpoints for installations, hub account registration/login, and the moderation admin panel. Live in-class session hosting UI is hidden (kept code-wise so self-practice continues to work).

### Core entities

- **HubAccount** — a user registered directly on `savint.it` with Google OAuth **or** email/password.
- **Installation** — registration of a school's SAVINT instance, holding OAuth `client_id` and `client_secret`.
- **HubAccessToken** — OAuth access/refresh tokens binding a `HubAccount` to an `Installation` with explicit scopes (`publish`, `clone`).

### Communication

- REST + JSON for all metadata, search, and OAuth flows.
- The `.qlz` format (already used for export/import) is the transport payload for quiz contents during publish and clone. Base64-encoded in JSON request/response bodies. Images are inline base64 inside the `.qlz`.
- Every cross-system request requires a Bearer access token tied to a specific teacher; installations never act on their own.

---

## 3. Data model

### Existing `Quiz` model — additive changes only

All new fields are nullable to preserve backward compatibility.

```
hubPublishedId      String?    -- HubQuiz.id if this quiz has been published, else null
hubLastPublishedAt  DateTime?  -- timestamp of last (re)publish
hubAccountId        String?    -- HubAccount used to publish (cached for UI)
clonedFromHubId      String?   -- HubQuiz.id this quiz was cloned from, if any
clonedFromHubVersion Int?      -- HubQuiz.version at the time of clone (drives "update available")
clonedFromHubAuthor  String?   -- frozen author name for attribution at clone time
schoolLevel         SchoolLevel?
subject             String?    -- slug from controlled vocabulary
language            String?    -- ISO 639-1 code
ageMin              Int?
ageMax              Int?
```

New enum `SchoolLevel`: `PRIMARIA | SECONDARIA_I | SECONDARIA_II | UNIVERSITA | ALTRO`.

`subject` is validated against a controlled list in `src/lib/quiz-subjects.ts` (a typed array of `{ slug, label_it, label_en }`). Extending the list is a code change, not a migration.

The four pedagogical metadata fields (`schoolLevel`, `subject`, `language`, age range) live on every `Quiz`, not only published ones. They are filled in via a dedicated section of the quiz editor, all optional locally, but enforced (where applicable) at publish time.

### New `HubLink` model (installation side)

Stores the OAuth tokens linking a local `User` to their `HubAccount`.

```
HubLink:
  id, userId (User), hubAccountId, hubAccountEmail (cached for UI),
  accessToken (encrypted), refreshToken (encrypted),
  accessTokenExpiresAt, scopes (String[]),
  createdAt, lastUsedAt, revokedAt
```

Tokens are encrypted at rest using a symmetric key derived from `NEXTAUTH_SECRET`.

### New hub-only models

```
HubAccount:
  id, email (unique), name, image,
  authMethod          GOOGLE | PASSWORD
  passwordHash        String?     -- bcrypt cost 12, only when PASSWORD
  emailVerified       DateTime?
  affiliation         String?     -- free text, e.g. "Liceo Galilei, Padova"
  role                HUB_USER | HUB_ADMIN  (default HUB_USER)
  linkedProviders     String[]    -- ["google"] or ["password"] or both
  bannedAt            DateTime?
  createdAt

Installation:
  id, name, contactEmail,
  clientId            String      @unique
  clientSecretHash    String      -- bcrypt
  createdAt, lastSeenAt,
  disabledAt          DateTime?

HubAccessToken:
  id, hubAccountId, installationId,
  accessTokenHash     String      @unique  -- SHA-256 of opaque token
  refreshTokenHash    String      @unique
  accessTokenExpiresAt, refreshTokenExpiresAt,
  scopes              String[],
  rotationCount       Int         @default(0)
  revokedAt           DateTime?
  createdAt, lastUsedAt

HubQuiz:
  id, hubAccountId,
  title, description, license (CC_BY | CC_BY_SA), tags String[],
  schoolLevel, subject, language, ageMin, ageMax,
  questionCount, estimatedDurationSec,
  payloadBlob         Bytes       -- the .qlz, images base64-inlined
  payloadHash         String      -- SHA-256 of payloadBlob
  version             Int         @default(1)
  publishedAt, updatedAt,
  suspended           Boolean     @default(false)
  suspendedReason     String?
  downloadsCount      Int         @default(0)
  playsCount          Int         @default(0)

HubQuizVersion:                     -- audit / history
  id, hubQuizId, version, payloadBlob, payloadHash, publishedAt

HubReport:                          -- same shape as local Report
  id, hubQuizId, reporterAccountId?, reporterIpHash,
  reason (COPYRIGHT | PERSONAL_DATA | OFFENSIVE | OTHER),
  description, status (PENDING | REVIEWED | RESOLVED | DISMISSED),
  resolvedAt, resolvedBy, createdAt
  @@index(hubQuizId, reporterIpHash, createdAt)  -- supports 24h dedup window (Section 8)

HubRateLimit:                       -- backs the rate-limit middleware (Section 9)
  id, key, windowStart, count
  @@unique(key, windowStart)

EmailVerificationToken:
  id, hubAccountId, tokenHash @unique, purpose (VERIFY_EMAIL | RESET_PASSWORD),
  expiresAt, usedAt, createdAt

PracticeRun:                        -- ephemeral, TTL 1h
  id, hubQuizId, ipHash, startedAt, completedAt
```

A single migration introduces all new fields and tables. Hub-only tables are part of the unified schema even in `installation` mode (negligible overhead, simpler ops).

---

## 4. Publish workflow

### Step 1 — Account linking (first time only)

When a teacher clicks "Publish to savint.it" on a quiz they own, and their local `User` has no `HubLink`:

1. Installation opens a new tab to `https://savint.it/oauth/authorize?client_id=<installation>&redirect_uri=<installation>/api/hub/oauth/callback&scope=publish,clone&state=<csrf>&code_challenge=<pkce>`.
2. User signs in on the hub (Google or email/password); if it's their first time, an inline register option is offered.
3. Hub shows a consent screen: *"Liceo Galilei wants to publish quizzes on your behalf on savint.it. Allow?"* with the scopes spelled out.
4. On Accept → redirect to `redirect_uri` with `code`. Installation exchanges `code` for `{ accessToken, refreshToken, expiresIn }` via `POST /api/hub/oauth/token` using PKCE verifier and client credentials.
5. Installation encrypts and stores tokens in `HubLink`, closes the tab, shows "Hub account linked".

OAuth follows OAuth 2.0 + PKCE. Authorization codes are single-use, 10-minute TTL.

### Step 2 — Publish form (modal)

Once linked, "Publish" opens a modal with:

- Title, description, tags (prefilled from quiz)
- Required: `schoolLevel`, `subject`, `language` (defaults to installation UI language). `ageMin`/`ageMax` optional.
- License (CC BY / CC BY-SA, default CC BY)
- Re-confirmation of `QUIZ_PUBLISH_DECLARATION` (reuses existing consent record)
- Preview of `.qlz` size
- "Publish" button

### Step 3 — Transmission

1. Installation generates the `.qlz` via the existing export pipeline.
2. `POST https://savint.it/api/hub/quizzes` with `Authorization: Bearer <accessToken>`, JSON body `{ metadata, qlzBase64, payloadHash }`.
3. Hub validates the token, recomputes the hash, checks the `publish` scope, validates metadata against vocabularies, creates `HubQuiz` (`version=1`) and an initial `HubQuizVersion`.
4. Response: `{ hubQuizId, publishedAt, url: "https://savint.it/q/<hubQuizId>" }`.
5. Installation updates `Quiz.hubPublishedId`, `hubLastPublishedAt`, `hubAccountId`.
6. UI toast: "Published" with a clickable link.

### Step 4 — Re-publish (updates)

If the local `Quiz` already has a `hubPublishedId`, the modal title becomes "Update on savint.it" and the button "Update". The request uses `If-Match: <hubPublishedId>`. The hub increments `version`, archives the prior payload into `HubQuizVersion`, overwrites `payloadBlob`. Existing clones in other installations remain untouched; they get a "version 2 available" badge the next time the cloner browses the hub.

### Step 5 — Unpublish

`DELETE /api/hub/quizzes/:id` (publish scope) — quiz becomes invisible in search results; the URL still resolves but shows "this quiz has been withdrawn by the author". Existing clones remain functional with attribution intact.

### Refresh

When an access token expires (15 min), the installation transparently exchanges the refresh token (90-day TTL, rotated on every use) for a new pair. If refresh fails, UI prompts "Reauthorize savint.it access" and restarts at Step 1.

---

## 5. Browse and clone workflow

### Search API

`GET /api/hub/quizzes` accepts:

```
q           free text on title+description+tags
schoolLevel enum
subject     slug
language    ISO
ageMin, ageMax
sort        recent | popular | relevant (default: relevant)
            -- popular = (downloadsCount + 0.2 * playsCount), recency-decayed
            -- relevant = full-text rank on q against title+description+tags
page, perPage (perPage max 50)
```

Response is paginated metadata only — no `payloadBlob`. Each item: `{ id, title, description, author, schoolLevel, subject, language, tags, questionCount, downloadsCount, playsCount, license, publishedAt }`.

### Detail page `/q/:id`

- Header: title, author (link to `/u/:hubAccountId`), license, published date, download/play counts.
- Structured metadata: school level, subject, language, age range, tags.
- Question preview: list of questions showing text and type only (correct answers not exposed to the page HTML to prevent trivial spoilage).
- Actions:
  - **Try now** — always available, no login (Section 6).
  - **Clone to my installation** — only visible when the page is rendered inside an installation. Requires `clone` scope.
  - **Download .qlz** — for manual import elsewhere.
  - **Report** — opens a report modal.

### Clone flow

1. Installation calls `GET /api/hub/quizzes/:id/download` with Bearer token (clone scope).
2. Hub increments `downloadsCount`, returns `{ qlzBase64, hubQuizId, hubAuthor, version }`.
3. Installation runs the existing `.qlz` import to create a new local `Quiz` with:
   - `authorId` = current local teacher
   - `clonedFromHubId` = `hubQuizId`
   - `clonedFromHubAuthor` = author name at the time of clone
   - `isPublic` = false (clones are not auto-public in the cloning school)
4. UI shows the new quiz with a "From savint.it · originally by Maria Rossi" badge and a deep link to the hub page.

### Dedup and re-clone

If the same `clonedFromHubId` already exists locally:

- Hub `version` > `Quiz.clonedFromHubVersion`: modal offers (a) **clone alongside** as a separate quiz, (b) **cancel**. The existing local quiz is never overwritten — the teacher may have edited it.
- Versions equal: notice "You already have this quiz" with a link to the local copy.

### Browse failure modes

When the installation is browsing the hub catalog and the hub is unreachable, the UI shows a friendly "Repository not reachable, try again later" without affecting the rest of the installation.

### Author profile `/u/:hubAccountId`

Public page showing name, optional affiliation, and a list of their published quizzes. No messaging, no follow.

---

## 6. Self-practice on the hub

Anyone visiting `/q/:id` can click **Try now**. The hub creates an ephemeral `PracticeRun` (TTL 1h) and redirects to `/q/:id/play/:runId`.

The client reuses the same self-practice component that already exists locally (introduced in commit `4f0bfe0`). Questions are streamed chunk-by-chunk via API so correct answers are not all included in the initial HTML payload (basic anti-cheat for honest play; self-practice has no leaderboard so the incentive is low).

No persistence beyond a single counter: when the run completes, `HubQuiz.playsCount` is incremented atomically. No accounts required, no per-player history, no public leaderboards.

Rate limit: 5 runs per minute per IP to deter inflated counters.

---

## 7. Hub account management

### Two auth methods, one account

- **Google OAuth** — reuses NextAuth v5 already configured for installations. `authMethod = GOOGLE`.
- **Email + password** — new `CredentialsProvider`. Passwords bcrypt cost 12. Email verification mandatory via magic link (24h TTL). `authMethod = PASSWORD`.

### Email collision

If a user signs up via Google with an email already registered via password (or vice versa), the UI guides them to log in with the existing method first, then link the second provider from `/account`. `HubAccount.linkedProviders` records active methods.

### Public hub pages

- `/login` — Google + email/password
- `/register` — email/password (Google flows through `/login`)
- `/forgot-password` — standard reset
- `/account` — profile (name, affiliation, password change, linked providers, list of linked installations with per-installation "Revoke access")

Hub cookies are scoped to `savint.it`; no cross-domain coupling with self-hosted installations.

---

## 8. Moderation

Mirrors the existing local report model.

- Anyone can submit a report; anonymous reporters are deduplicated by IP (one report per quiz per IP per 24h).
- Admin panel `/admin/hub/reports` (visible to `HUB_ADMIN` only) lists pending reports with quiz preview, reason, description, and count of other reports against the same quiz.
- Admin actions: suspend quiz (`suspended=true`, hidden from search, direct URL shows a banner), dismiss report, email author (prefilled draft), ban author (suspends all their quizzes; sets `HubAccount.bannedAt`).
- When a quiz is suspended, the author receives an automatic email explaining the reason and how to appeal.

The first hub admin is provisioned via `scripts/promote-hub-admin.ts`, identical pattern to the existing installation admin script.

---

## 9. Security, rate limiting, and abuse prevention

### Rate limits

| Endpoint | Auth | Limit |
|---|---|---|
| `GET /api/hub/quizzes` | none | 60/min/IP |
| `GET /api/hub/quizzes/:id` | none | 120/min/IP |
| `GET /api/hub/quizzes/:id/download` | Bearer (clone) | 30/min/token |
| `POST /api/hub/quizzes` | Bearer (publish) | 10/hour/token |
| `POST /q/:id/play` | none | 5/min/IP |
| `POST /api/hub/reports` | optional Bearer | 5/hour/IP |
| `POST /api/hub/oauth/authorize` | none | 20/hour/IP |
| `POST /api/hub/auth/login` (password) | none | 10/hour/IP |
| `POST /api/hub/auth/register` | none | 5/hour/IP |

Implementation: a Postgres-backed rate limit table (`HubRateLimit`) with `(key, windowStart)` index. No new external dependencies.

### Hardening

- Server-side `payloadHash` recompute and verification before persisting.
- Max `.qlz` size on publish: 50 MB (env `HUB_MAX_QUIZ_SIZE_MB`).
- Max published quizzes per account: 200 (env `HUB_PUBLIC_QUIZZES_PER_ACCOUNT_MAX`); excess returns 429.
- Strict server-side metadata validation (enum membership, max lengths, HTML sanitization in description).
- Refresh tokens rotated on each use; reuse of an already-rotated refresh token revokes the entire chain.
- Strong CSP on `/explore` and `/q/:id`.
- Encrypted-at-rest storage of installation-side OAuth tokens (`HubLink`).
- IP collection is one-way hashed for `PracticeRun.ipHash` and `HubReport.reporterIp` (salted with a server-side secret) — used for dedup, not analytics.

---

## 10. Deploy and configuration

### Environment variables

```
SAVINT_MODE=hub|installation              # default: installation
SAVINT_HUB_URL=https://savint.it          # required when MODE=installation
HUB_OAUTH_CLIENT_ID=<assigned>            # required when MODE=installation
HUB_OAUTH_CLIENT_SECRET=<assigned>        # required when MODE=installation
HUB_MAX_QUIZ_SIZE_MB=50
HUB_PUBLIC_QUIZZES_PER_ACCOUNT_MAX=200
HUB_EMAIL_FROM=noreply@savint.it          # required when MODE=hub
HUB_SMTP_HOST=...                         # required when MODE=hub
HUB_SMTP_PORT=...
HUB_SMTP_USER=...
HUB_SMTP_PASS=...
HUB_IP_HASH_SECRET=<random>               # required when MODE=hub
```

### Onboarding a new installation (v1, manual)

1. School admin emails `support@savint.it` requesting credentials.
2. Hub admin creates an `Installation` record (admin UI or seed script) and shares `client_id` + `client_secret` over a secure channel.
3. School admin sets the env vars on their installation and restarts.
4. Teachers can immediately link their accounts and publish.

A self-service onboarding flow is explicitly out of scope for v1 (see Section 1, non-goals).

### Migrations

A single Prisma migration adds the new `Quiz` columns and all new tables. All new `Quiz` columns are nullable so existing rows are unaffected.

---

## 11. Testing strategy

### Unit (Vitest)

- OAuth code exchange and PKCE verifier
- Access token refresh, rotation, and replay detection
- Scope enforcement (publish vs clone)
- Payload hash verification
- Clone dedup logic (same hub id, different versions)
- Subject vocabulary lookup and ISO language validation
- Password hashing, email verification token issuance
- Rate limiter window arithmetic

### Integration

- Publish flow end-to-end with a mocked hub
- Clone flow end-to-end with a mocked hub
- Re-publish with version increment
- Suspend → search hidden, direct URL shows banner, clones unaffected
- Email collision flow (Google + password on same email)

### E2E (Playwright)

A new multi-server Playwright setup boots two SAVINT processes — one in `SAVINT_MODE=hub` on port `4000`, one in `SAVINT_MODE=installation` on port `3000` pointing to `4000` as its hub — and covers:

1. Hub account registration (email/password) and email verification.
2. OAuth link from installation to hub.
3. Publishing a quiz with full metadata.
4. Anonymous browse and self-practice on the hub.
5. Search and clone from a second teacher's installation view.
6. Re-publish from the original author and "update available" badge in the cloner's view.
7. Reporting and admin suspension.

---

## 12. Out of scope (YAGNI)

Explicitly excluded from v1:

- Peer-to-peer federation between installations.
- Comments, ratings, recensions, follows.
- Public forking distinct from clone.
- Branding/theming per school on the hub.
- Quiz collections / bundles.
- Aggressive offline catalog caching.
- Self-service installation onboarding.
- Object storage (e.g. S3) for images — inline base64 in `.qlz` is the v1 transport; migration is planned for phase 2 driven by storage growth.
- Cross-installation aggregated analytics.
- Full hub i18n beyond IT + EN.
