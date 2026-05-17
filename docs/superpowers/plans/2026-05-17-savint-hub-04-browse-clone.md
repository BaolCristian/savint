# SAVINT Hub — Plan 4: Browse, Clone, and Self-Practice

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **READ FIRST:** [`2026-05-17-savint-hub-00-integration-contract.md`](./2026-05-17-savint-hub-00-integration-contract.md). Most relevant overrides for this plan: (a) **import path** for rate limiter is `@/lib/rate-limit/hub-rate-limit` (NOT `@/lib/hub/rate-limit`); (b) signature is `hubRateLimit({ key, windowSeconds, max })` returning `{ allowed, retryAfterSeconds? }` (NOT `enforceHubRateLimit({ key, limit, windowSec })`); (c) Plan 1 exports `QUIZ_SUBJECTS` (array) and `SUBJECT_SLUGS` (Set), NOT `SCHOOL_LEVELS, SUBJECTS` — use `import { QUIZ_SUBJECTS } from "@/lib/quiz-subjects"; import { SchoolLevel } from "@prisma/client";`.

**Goal:** Make the published catalog discoverable: search and browse on savint.it (anonymous), detail pages with question preview, self-practice runs without an account, and a clone workflow from an installation back to a local quiz copy.

**Architecture:** A search API `GET /api/hub/quizzes` with filters (school level, subject, language, age, full-text q). Detail page `/q/:id` renders question metadata without exposing correct answers in the page HTML. Anonymous "Try now" creates an ephemeral `PracticeRun` (1h TTL) and streams questions chunk-by-chunk via API. Clone API `GET /api/hub/quizzes/:id/download` returns `.qlz` + metadata; installation-side import creates a local `Quiz` with `clonedFromHubId` and a "From savint.it" badge.

**Tech Stack:** Prisma 6, Next.js 16 App Router (server components for SEO on `/explore` and `/q/:id`), Zod 4, Vitest 3, Playwright.

---

## File Structure

### Created files

| Path | Responsibility |
|------|----------------|
| `prisma/migrations/<ts>_add_practice_run/migration.sql` | Adds `PracticeRun` table (ephemeral hub practice). |
| `src/lib/hub/practice-run.ts` | Helpers: `createPracticeRun`, `getPracticeRun`, `completePracticeRun`, plus IP hashing. |
| `src/lib/hub/search.ts` | `searchHubQuizzes` — Zod input + Prisma query (filters, sort, pagination). |
| `src/lib/hub/__tests__/search.test.ts` | Unit tests for filters, sort variants, pagination, suspension hiding. |
| `src/lib/hub/__tests__/practice-run.test.ts` | Unit tests for TTL, IP hash, completion increment. |
| `src/app/api/hub/quizzes/route.ts` | `GET /api/hub/quizzes` — catalog search endpoint. |
| `src/app/api/hub/quizzes/__tests__/route.test.ts` | Integration tests for search endpoint. |
| `src/app/api/hub/quizzes/[id]/route.ts` | `GET /api/hub/quizzes/:id` — detail (metadata + question list w/o answers). |
| `src/app/api/hub/quizzes/[id]/__tests__/route.test.ts` | Integration tests for detail endpoint. |
| `src/app/api/hub/quizzes/[id]/download/route.ts` | `GET /api/hub/quizzes/:id/download` — Bearer + `clone` scope, returns base64 qlz. |
| `src/app/api/hub/quizzes/[id]/download/__tests__/route.test.ts` | Tests: 401 missing, 403 wrong scope, 200 increments counter. |
| `src/app/api/hub/practice/start/route.ts` | `POST /api/hub/practice/start` — creates `PracticeRun`. |
| `src/app/api/hub/practice/start/__tests__/route.test.ts` | Integration tests including rate limit. |
| `src/app/api/hub/practice/[runId]/question/[order]/route.ts` | Per-question fetch; hides correct answer until expiry or post-answer. |
| `src/app/api/hub/practice/[runId]/question/[order]/__tests__/route.test.ts` | Tests for both states. |
| `src/app/api/hub/practice/[runId]/answer/route.ts` | `POST` answer; on last-question completes run and `playsCount++`. |
| `src/app/api/hub/practice/[runId]/answer/__tests__/route.test.ts` | Tests: correctness, idempotency, completion counter. |
| `src/components/hub/hub-explore-client.tsx` | Shared filter sidebar + grid component (used by hub `/explore` and installation `/dashboard/hub`). |
| `src/components/hub/hub-quiz-card.tsx` | Card with title, author, badges, counts. |
| `src/components/hub/hub-quiz-detail.tsx` | Detail page header + question preview list (server component). |
| `src/components/hub/practice-runner.tsx` | Client component for the streamed self-practice run. |
| `src/components/hub/clone-button.tsx` | Installation-only button posting to `/api/dashboard/hub/clone`. |
| `src/components/hub/from-hub-badge.tsx` | Library badge "From savint.it · by <author>". |
| `src/app/q/[id]/play/[runId]/page.tsx` | Self-practice play page (mounts `PracticeRunner`). |
| `src/app/u/[hubAccountId]/page.tsx` | Hub author profile page. |
| `src/app/(dashboard)/dashboard/hub/page.tsx` | Installation browse view (proxies the hub search). |
| `src/app/(dashboard)/dashboard/hub/[id]/page.tsx` | Installation detail view with Clone primary action. |
| `src/app/api/dashboard/hub/clone/route.ts` | Server action: downloads from hub, runs qlz import, sets `clonedFromHub*`. |
| `src/app/api/dashboard/hub/clone/__tests__/route.test.ts` | Tests dedup, version mismatch, success. |
| `tests/e2e/hub-browse-clone.spec.ts` | Multi-server E2E: anonymous browse, self-practice, clone, badge. |

### Modified files

| Path | What changes |
|------|--------------|
| `prisma/schema.prisma` | Adds `PracticeRun` model. |
| `src/app/explore/page.tsx` | Branches on `SAVINT_MODE`: `hub` -> hub catalog UI, `installation` -> existing behavior + "Browse savint.it" link. |
| `src/app/q/[id]/page.tsx` | Replaces Plan-3 placeholder with full detail page. |
| `src/components/practice/practice-view.tsx` | Extracts inner runner so it can be reused from hub via a streamed fetcher. |
| `src/components/dashboard/sidebar.tsx` | Adds "Browse savint.it" menu item when `SAVINT_HUB_URL` is configured. |
| `src/components/library/library-client.tsx` | Renders `<FromHubBadge>` when quiz has `clonedFromHubId`. |
| `src/lib/hub/hub-client.ts` (from Plan 3) | Adds `downloadHubQuiz` and `searchHubQuizzes` helpers. |
| `src/messages/en.json`, `src/messages/it.json` | New `hub.*` keys (browse, detail, practice, clone). |

---

## Tasks

### Task 1 — Add `PracticeRun` Prisma model and migration

**Files**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_practice_run/migration.sql`
- Create: `src/lib/hub/__tests__/practice-run-schema.test.ts`

**Steps**

- [ ] **1.1 Write failing test for the Prisma model**
  Create `src/lib/hub/__tests__/practice-run-schema.test.ts`:
  ```typescript
  import { describe, it, expect, beforeAll, afterAll } from "vitest";
  import { prisma } from "@/lib/db/client";

  describe("PracticeRun schema", () => {
    let hubQuizId: string;

    beforeAll(async () => {
      const account = await prisma.hubAccount.create({
        data: { email: `pr-${Date.now()}@test`, name: "T", authMethod: "PASSWORD", linkedProviders: ["password"] },
      });
      const q = await prisma.hubQuiz.create({
        data: {
          hubAccountId: account.id,
          title: "X",
          description: "d",
          license: "CC_BY",
          tags: [],
          schoolLevel: "PRIMARIA",
          subject: "math",
          language: "it",
          questionCount: 1,
          estimatedDurationSec: 30,
          payloadBlob: Buffer.from("x"),
          payloadHash: "h",
        },
      });
      hubQuizId = q.id;
    });

    afterAll(async () => {
      await prisma.practiceRun.deleteMany();
    });

    it("creates a practice run with TTL fields", async () => {
      const run = await prisma.practiceRun.create({
        data: { hubQuizId, ipHash: "abc" },
      });
      expect(run.startedAt).toBeInstanceOf(Date);
      expect(run.completedAt).toBeNull();
    });
  });
  ```
  Run `pnpm vitest run src/lib/hub/__tests__/practice-run-schema.test.ts`. Expect failure (model not in client).

- [ ] **1.2 Add `PracticeRun` model to schema**
  Append to `prisma/schema.prisma`:
  ```prisma
  model PracticeRun {
    id          String    @id @default(cuid())
    hubQuizId   String
    hubQuiz     HubQuiz   @relation(fields: [hubQuizId], references: [id], onDelete: Cascade)
    ipHash      String
    startedAt   DateTime  @default(now())
    completedAt DateTime?
    answers     Json      @default("[]") // array of { order, correct, submittedAt }
    expiresAt   DateTime  @default(dbgenerated("now() + interval '1 hour'"))

    @@index([hubQuizId, startedAt])
    @@index([expiresAt])
  }
  ```
  Also add the back-relation on `HubQuiz`:
  ```prisma
  model HubQuiz {
    // ... existing fields from Plan 3 ...
    practiceRuns PracticeRun[]
  }
  ```

- [ ] **1.3 Generate migration**
  Run:
  ```bash
  pnpm prisma migrate dev --name add_practice_run --create-only
  ```
  Expect a new migration file at `prisma/migrations/<ts>_add_practice_run/migration.sql`. Confirm SQL adds `PracticeRun` table with the indexes above.

- [ ] **1.4 Apply migration and regenerate client**
  Run:
  ```bash
  pnpm prisma migrate dev
  ```
  Expect "Database is now in sync with your schema" plus Prisma Client regenerated.

- [ ] **1.5 Re-run schema test**
  ```bash
  pnpm vitest run src/lib/hub/__tests__/practice-run-schema.test.ts
  ```
  Expect `1 passed`.

- [ ] **1.6 Commit**
  ```bash
  git add prisma/schema.prisma prisma/migrations src/lib/hub/__tests__/practice-run-schema.test.ts
  git commit -m "feat(hub): add PracticeRun model for ephemeral self-practice sessions"
  ```

---

### Task 2 — Hub catalog search library helper

**Files**
- Create: `src/lib/hub/search.ts`
- Create: `src/lib/hub/__tests__/search.test.ts`

**Steps**

- [ ] **2.1 Write failing tests covering each filter and sort**
  `src/lib/hub/__tests__/search.test.ts`:
  ```typescript
  import { describe, it, expect, beforeAll, afterAll } from "vitest";
  import { prisma } from "@/lib/db/client";
  import { searchHubQuizzes } from "@/lib/hub/search";

  describe("searchHubQuizzes", () => {
    let accountId: string;

    beforeAll(async () => {
      const acc = await prisma.hubAccount.create({
        data: { email: `s-${Date.now()}@t`, name: "A", authMethod: "PASSWORD", linkedProviders: ["password"] },
      });
      accountId = acc.id;
      await prisma.hubQuiz.createMany({
        data: [
          { hubAccountId: accountId, title: "Algebra Basics", description: "linear equations", license: "CC_BY", tags: ["algebra"], schoolLevel: "SECONDARIA_II", subject: "math", language: "it", questionCount: 5, estimatedDurationSec: 300, payloadBlob: Buffer.from("a"), payloadHash: "h1", playsCount: 10, downloadsCount: 3 },
          { hubAccountId: accountId, title: "Storia Romana", description: "impero", license: "CC_BY_SA", tags: ["history"], schoolLevel: "SECONDARIA_I", subject: "history", language: "it", questionCount: 10, estimatedDurationSec: 600, payloadBlob: Buffer.from("b"), payloadHash: "h2", playsCount: 50, downloadsCount: 20 },
          { hubAccountId: accountId, title: "Suspended", description: "x", license: "CC_BY", tags: [], schoolLevel: "PRIMARIA", subject: "math", language: "it", questionCount: 1, estimatedDurationSec: 60, payloadBlob: Buffer.from("c"), payloadHash: "h3", suspended: true },
        ],
      });
    });

    afterAll(async () => {
      await prisma.hubQuiz.deleteMany({ where: { hubAccountId: accountId } });
    });

    it("filters by subject", async () => {
      const { items } = await searchHubQuizzes({ subject: "history" });
      expect(items.map((i) => i.title)).toEqual(["Storia Romana"]);
    });

    it("filters by schoolLevel", async () => {
      const { items } = await searchHubQuizzes({ schoolLevel: "SECONDARIA_II" });
      expect(items.map((i) => i.title)).toEqual(["Algebra Basics"]);
    });

    it("hides suspended", async () => {
      const { items } = await searchHubQuizzes({});
      expect(items.find((i) => i.title === "Suspended")).toBeUndefined();
    });

    it("full-text q on title and description", async () => {
      const { items } = await searchHubQuizzes({ q: "algebra" });
      expect(items[0]?.title).toBe("Algebra Basics");
    });

    it("sort=popular orders by downloads + 0.2*plays", async () => {
      const { items } = await searchHubQuizzes({ sort: "popular" });
      expect(items[0]?.title).toBe("Storia Romana"); // 20 + 10 = 30 > 3 + 2 = 5
    });

    it("paginates with perPage", async () => {
      const { items, total } = await searchHubQuizzes({ page: 1, perPage: 1 });
      expect(items.length).toBe(1);
      expect(total).toBeGreaterThanOrEqual(2);
    });
  });
  ```
  Run `pnpm vitest run src/lib/hub/__tests__/search.test.ts`. Expect failure (file missing).

- [ ] **2.2 Implement `searchHubQuizzes`**
  Create `src/lib/hub/search.ts`:
  ```typescript
  import { z } from "zod";
  import { prisma } from "@/lib/db/client";
  import type { Prisma, SchoolLevel } from "@prisma/client";

  export const searchInputSchema = z.object({
    q: z.string().trim().max(200).optional(),
    schoolLevel: z.enum(["PRIMARIA", "SECONDARIA_I", "SECONDARIA_II", "UNIVERSITA", "ALTRO"]).optional(),
    subject: z.string().max(64).optional(),
    language: z.string().length(2).optional(),
    ageMin: z.coerce.number().int().min(3).max(99).optional(),
    ageMax: z.coerce.number().int().min(3).max(99).optional(),
    sort: z.enum(["recent", "popular", "relevant"]).default("relevant"),
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(50).default(20),
  });

  export type SearchInput = z.infer<typeof searchInputSchema>;

  export interface SearchResultItem {
    id: string;
    title: string;
    description: string;
    author: string;
    schoolLevel: SchoolLevel | null;
    subject: string | null;
    language: string | null;
    tags: string[];
    questionCount: number;
    downloadsCount: number;
    playsCount: number;
    license: "CC_BY" | "CC_BY_SA";
    publishedAt: Date;
  }

  export async function searchHubQuizzes(rawInput: Partial<SearchInput>): Promise<{
    items: SearchResultItem[];
    total: number;
    page: number;
    perPage: number;
  }> {
    const input = searchInputSchema.parse(rawInput);
    const where: Prisma.HubQuizWhereInput = { suspended: false };
    if (input.schoolLevel) where.schoolLevel = input.schoolLevel;
    if (input.subject) where.subject = input.subject;
    if (input.language) where.language = input.language;
    if (input.ageMin !== undefined) where.ageMax = { gte: input.ageMin };
    if (input.ageMax !== undefined) where.ageMin = { lte: input.ageMax };
    if (input.q) {
      where.OR = [
        { title: { contains: input.q, mode: "insensitive" } },
        { description: { contains: input.q, mode: "insensitive" } },
        { tags: { has: input.q } },
      ];
    }

    const orderBy: Prisma.HubQuizOrderByWithRelationInput[] =
      input.sort === "recent"
        ? [{ publishedAt: "desc" }]
        : input.sort === "popular"
          ? [{ downloadsCount: "desc" }, { playsCount: "desc" }]
          : [{ publishedAt: "desc" }]; // relevant: rely on `where` filter + recency

    const [rows, total] = await Promise.all([
      prisma.hubQuiz.findMany({
        where,
        orderBy,
        include: { hubAccount: { select: { name: true } } },
        skip: (input.page - 1) * input.perPage,
        take: input.perPage,
      }),
      prisma.hubQuiz.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        author: r.hubAccount.name,
        schoolLevel: r.schoolLevel,
        subject: r.subject,
        language: r.language,
        tags: r.tags,
        questionCount: r.questionCount,
        downloadsCount: r.downloadsCount,
        playsCount: r.playsCount,
        license: r.license as "CC_BY" | "CC_BY_SA",
        publishedAt: r.publishedAt,
      })),
      total,
      page: input.page,
      perPage: input.perPage,
    };
  }
  ```

- [ ] **2.3 Run tests**
  ```bash
  pnpm vitest run src/lib/hub/__tests__/search.test.ts
  ```
  Expect `6 passed`.

- [ ] **2.4 Commit**
  ```bash
  git add src/lib/hub/search.ts src/lib/hub/__tests__/search.test.ts
  git commit -m "feat(hub): searchHubQuizzes helper with filters, sort, and pagination"
  ```

---

### Task 3 — `GET /api/hub/quizzes` search endpoint

**Files**
- Create: `src/app/api/hub/quizzes/route.ts`
- Create: `src/app/api/hub/quizzes/__tests__/route.test.ts`

**Steps**

- [ ] **3.1 Write failing tests**
  `src/app/api/hub/quizzes/__tests__/route.test.ts`:
  ```typescript
  import { describe, it, expect, beforeAll, afterAll } from "vitest";
  import { GET } from "@/app/api/hub/quizzes/route";
  import { prisma } from "@/lib/db/client";
  import { NextRequest } from "next/server";

  describe("GET /api/hub/quizzes", () => {
    let accountId: string;
    beforeAll(async () => {
      const a = await prisma.hubAccount.create({ data: { email: `e-${Date.now()}@t`, name: "X", authMethod: "PASSWORD", linkedProviders: ["password"] } });
      accountId = a.id;
      await prisma.hubQuiz.create({
        data: { hubAccountId: a.id, title: "Geo101", description: "world", license: "CC_BY", tags: [], schoolLevel: "PRIMARIA", subject: "geography", language: "it", questionCount: 3, estimatedDurationSec: 180, payloadBlob: Buffer.from("x"), payloadHash: "h" },
      });
    });
    afterAll(async () => {
      await prisma.hubQuiz.deleteMany({ where: { hubAccountId: accountId } });
    });

    it("returns 200 with paginated items", async () => {
      const req = new NextRequest("http://t/api/hub/quizzes?subject=geography");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items[0].title).toBe("Geo101");
    });

    it("400 on invalid sort", async () => {
      const req = new NextRequest("http://t/api/hub/quizzes?sort=banana");
      const res = await GET(req);
      expect(res.status).toBe(400);
    });
  });
  ```
  Run; expect ENOENT.

- [ ] **3.2 Implement the route**
  ```typescript
  // src/app/api/hub/quizzes/route.ts
  import { NextRequest, NextResponse } from "next/server";
  import { searchHubQuizzes, searchInputSchema } from "@/lib/hub/search";
  import { enforceHubRateLimit } from "@/lib/hub/rate-limit"; // from Plan 2

  export async function GET(req: NextRequest) {
    const rl = await enforceHubRateLimit({ key: `search:${req.headers.get("x-forwarded-for") ?? "anon"}`, limit: 60, windowSec: 60 });
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const url = new URL(req.url);
    const raw = Object.fromEntries(url.searchParams.entries());
    const parsed = searchInputSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
    }
    const result = await searchHubQuizzes(parsed.data);
    return NextResponse.json(result);
  }
  ```

- [ ] **3.3 Run tests**
  ```bash
  pnpm vitest run src/app/api/hub/quizzes/__tests__/route.test.ts
  ```
  Expect `2 passed`.

- [ ] **3.4 Commit**
  ```bash
  git add src/app/api/hub/quizzes/route.ts src/app/api/hub/quizzes/__tests__/route.test.ts
  git commit -m "feat(hub): GET /api/hub/quizzes catalog search endpoint"
  ```

---

### Task 4 — `GET /api/hub/quizzes/:id` detail endpoint (no answers)

**Files**
- Create: `src/app/api/hub/quizzes/[id]/route.ts`
- Create: `src/app/api/hub/quizzes/[id]/__tests__/route.test.ts`

**Steps**

- [ ] **4.1 Write failing tests**
  ```typescript
  // src/app/api/hub/quizzes/[id]/__tests__/route.test.ts
  import { describe, it, expect, beforeAll, afterAll } from "vitest";
  import { GET } from "@/app/api/hub/quizzes/[id]/route";
  import { prisma } from "@/lib/db/client";
  import { NextRequest } from "next/server";

  describe("GET /api/hub/quizzes/:id", () => {
    let id: string;
    beforeAll(async () => {
      const a = await prisma.hubAccount.create({ data: { email: `d-${Date.now()}@t`, name: "Maria", authMethod: "PASSWORD", linkedProviders: ["password"] } });
      const q = await prisma.hubQuiz.create({
        data: {
          hubAccountId: a.id, title: "T", description: "d", license: "CC_BY", tags: [],
          schoolLevel: "PRIMARIA", subject: "math", language: "it",
          questionCount: 1, estimatedDurationSec: 30,
          payloadBlob: Buffer.from(JSON.stringify({ questions: [ { type: "TRUE_FALSE", text: "2+2=4?", timeLimit: 20, points: 100, options: { correct: true } } ] })),
          payloadHash: "h",
        },
      });
      id = q.id;
    });
    afterAll(async () => {
      await prisma.hubQuiz.delete({ where: { id } });
    });

    it("returns metadata and questions without correct answer fields", async () => {
      const res = await GET(new NextRequest(`http://t/api/hub/quizzes/${id}`), { params: Promise.resolve({ id }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.author).toBe("Maria");
      expect(body.questions[0].text).toBe("2+2=4?");
      expect(JSON.stringify(body.questions[0])).not.toContain("correct");
    });

    it("404 when suspended", async () => {
      await prisma.hubQuiz.update({ where: { id }, data: { suspended: true } });
      const res = await GET(new NextRequest(`http://t/api/hub/quizzes/${id}`), { params: Promise.resolve({ id }) });
      expect(res.status).toBe(404);
      await prisma.hubQuiz.update({ where: { id }, data: { suspended: false } });
    });
  });
  ```

- [ ] **4.2 Implement the route**
  ```typescript
  // src/app/api/hub/quizzes/[id]/route.ts
  import { NextRequest, NextResponse } from "next/server";
  import { prisma } from "@/lib/db/client";
  import { enforceHubRateLimit } from "@/lib/hub/rate-limit";
  import { extractQuestionPreviews } from "@/lib/hub/qlz-preview";

  export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const rl = await enforceHubRateLimit({ key: `detail:${req.headers.get("x-forwarded-for") ?? "anon"}`, limit: 120, windowSec: 60 });
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const { id } = await params;
    const q = await prisma.hubQuiz.findUnique({
      where: { id },
      include: { hubAccount: { select: { id: true, name: true, affiliation: true } } },
    });
    if (!q || q.suspended) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const previews = await extractQuestionPreviews(Buffer.from(q.payloadBlob));
    return NextResponse.json({
      id: q.id,
      title: q.title,
      description: q.description,
      tags: q.tags,
      license: q.license,
      schoolLevel: q.schoolLevel,
      subject: q.subject,
      language: q.language,
      ageMin: q.ageMin,
      ageMax: q.ageMax,
      questionCount: q.questionCount,
      estimatedDurationSec: q.estimatedDurationSec,
      version: q.version,
      publishedAt: q.publishedAt,
      updatedAt: q.updatedAt,
      downloadsCount: q.downloadsCount,
      playsCount: q.playsCount,
      author: q.hubAccount.name,
      authorId: q.hubAccount.id,
      authorAffiliation: q.hubAccount.affiliation,
      questions: previews, // { order, type, text, timeLimit, points } — NO correct answers
    });
  }
  ```

  Also create `src/lib/hub/qlz-preview.ts`:
  ```typescript
  import JSZip from "jszip";

  export interface QuestionPreview {
    order: number;
    type: string;
    text: string;
    timeLimit: number;
    points: number;
    hasMedia: boolean;
  }

  export async function extractQuestionPreviews(payload: Buffer): Promise<QuestionPreview[]> {
    const zip = await JSZip.loadAsync(payload);
    const mf = zip.file("manifest.json");
    if (!mf) return [];
    const manifest = JSON.parse(await mf.async("text"));
    return (manifest.quiz?.questions ?? []).map((q: any, i: number) => ({
      order: i,
      type: q.type,
      text: q.text,
      timeLimit: q.timeLimit,
      points: q.points,
      hasMedia: Boolean(q.image),
    }));
  }
  ```

- [ ] **4.3 Run tests**
  ```bash
  pnpm vitest run src/app/api/hub/quizzes/[id]/__tests__/route.test.ts src/lib/hub
  ```
  Expect all green.

- [ ] **4.4 Commit**
  ```bash
  git add src/app/api/hub/quizzes/[id]/route.ts src/app/api/hub/quizzes/[id]/__tests__/route.test.ts src/lib/hub/qlz-preview.ts
  git commit -m "feat(hub): detail endpoint with question previews (no correct answers)"
  ```

---

### Task 5 — Modify `/explore/page.tsx` to branch by `SAVINT_MODE`

**Files**
- Modify: `src/app/explore/page.tsx`
- Create: `src/app/explore/__tests__/page.test.tsx`

**Steps**

- [ ] **5.1 Write failing tests for both modes**
  ```typescript
  // src/app/explore/__tests__/page.test.tsx
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { render } from "@testing-library/react";

  vi.mock("@/lib/config/savint-mode", () => ({
    getSavintMode: vi.fn(),
  }));

  describe("/explore page", () => {
    beforeEach(() => vi.resetModules());

    it("renders hub catalog when mode=hub", async () => {
      const m = await import("@/lib/config/savint-mode");
      (m.getSavintMode as any).mockReturnValue("hub");
      const ExplorePage = (await import("@/app/explore/page")).default;
      const ui = await ExplorePage({ searchParams: Promise.resolve({}) });
      const { container } = render(ui as any);
      expect(container.textContent).toContain("savint.it");
    });

    it("renders local public library when mode=installation", async () => {
      const m = await import("@/lib/config/savint-mode");
      (m.getSavintMode as any).mockReturnValue("installation");
      const ExplorePage = (await import("@/app/explore/page")).default;
      const ui = await ExplorePage({ searchParams: Promise.resolve({}) });
      const { container } = render(ui as any);
      expect(container.textContent).toMatch(/Esplora|Explore/);
    });
  });
  ```

- [ ] **5.2 Refactor `/explore/page.tsx`**
  ```typescript
  // src/app/explore/page.tsx
  import { getTranslations } from "next-intl/server";
  import { prisma } from "@/lib/db/client";
  import { ExploreClient } from "@/components/practice/explore-client";
  import { HubExploreClient } from "@/components/hub/hub-explore-client";
  import { searchHubQuizzes, searchInputSchema } from "@/lib/hub/search";
  import { getSavintMode } from "@/lib/config/savint-mode";

  export const dynamic = "force-dynamic";

  export default async function ExplorePage({
    searchParams,
  }: {
    searchParams: Promise<Record<string, string | undefined>>;
  }) {
    const t = await getTranslations("practice");
    const mode = getSavintMode();
    const sp = await searchParams;

    if (mode === "hub") {
      const parsed = searchInputSchema.safeParse(sp);
      const input = parsed.success ? parsed.data : { sort: "relevant" as const, page: 1, perPage: 20 };
      const { items, total, page, perPage } = await searchHubQuizzes(input);
      return (
        <div className="min-h-dvh bg-gradient-to-br from-indigo-50 via-white to-violet-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
            <header className="mb-8 text-center">
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-2">
                {t("hubExploreTitle")}
              </h1>
              <p className="text-slate-600">{t("hubExploreSubtitle")}</p>
            </header>
            <HubExploreClient items={items} total={total} page={page} perPage={perPage} initialFilters={input} basePath="/explore" />
          </div>
        </div>
      );
    }

    // installation mode — existing behaviour
    const quizzes = await prisma.quiz.findMany({
      where: { isPublic: true, suspended: false },
      include: { author: { select: { name: true } }, _count: { select: { questions: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const data = quizzes
      .filter((q) => q._count.questions > 0)
      .map((q) => ({
        id: q.id,
        title: q.title,
        description: q.description,
        tags: q.tags,
        authorName: q.author.name ?? "Anonimo",
        questionCount: q._count.questions,
      }));
    return (
      <div className="min-h-dvh bg-gradient-to-br from-indigo-50 via-white to-violet-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <header className="mb-8 text-center">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-2">{t("exploreTitle")}</h1>
            <p className="text-slate-600">{t("exploreSubtitle")}</p>
          </header>
          <ExploreClient quizzes={data} />
        </div>
      </div>
    );
  }
  ```

- [ ] **5.3 Run tests**
  ```bash
  pnpm vitest run src/app/explore/__tests__/page.test.tsx
  ```
  Expect green (after stubbing `HubExploreClient` in next task — for now stub the component as a placeholder returning null so the import resolves).

- [ ] **5.4 Stub `HubExploreClient` placeholder**
  Create `src/components/hub/hub-explore-client.tsx` with a minimal shell:
  ```typescript
  "use client";
  export function HubExploreClient(_: any) { return <div data-testid="hub-explore" /> }
  ```
  (Real implementation in Task 6.)

- [ ] **5.5 Commit**
  ```bash
  git add src/app/explore/page.tsx src/app/explore/__tests__/page.test.tsx src/components/hub/hub-explore-client.tsx
  git commit -m "feat(hub): branch /explore by SAVINT_MODE (hub vs installation)"
  ```

---

### Task 6 — Full hub explore UI (filter sidebar + cards)

**Files**
- Modify: `src/components/hub/hub-explore-client.tsx`
- Create: `src/components/hub/hub-quiz-card.tsx`
- Create: `src/components/hub/__tests__/hub-explore-client.test.tsx`
- Modify: `src/messages/en.json`, `src/messages/it.json` (add `hub.*` keys)

**Steps**

- [ ] **6.1 Add i18n keys**
  In both `src/messages/en.json` and `src/messages/it.json`, add under `practice` (or a new top-level `hub`):
  ```json
  "hub": {
    "exploreTitle": "Public quiz repository",
    "exploreSubtitle": "Search thousands of teacher-made quizzes",
    "filters": { "schoolLevel": "School level", "subject": "Subject", "language": "Language", "ageMin": "Min age", "ageMax": "Max age", "all": "All" },
    "sort": { "relevant": "Relevant", "recent": "Recent", "popular": "Popular" },
    "search": "Search",
    "noResults": "No quizzes match these filters",
    "downloads": "{count, plural, one {# clone} other {# clones}}",
    "plays": "{count, plural, one {# play} other {# plays}}",
    "tryNow": "Try now",
    "clone": "Clone to my library",
    "downloadQlz": "Download .qlz",
    "report": "Report",
    "license": "License: {license}",
    "by": "by {author}",
    "fromHub": "From savint.it · {author}",
    "version": "v{n}",
    "updateAvailable": "Update available",
    "alreadyCloned": "Already in your library"
  }
  ```
  Provide Italian translations in `it.json`.

- [ ] **6.2 Write component test**
  ```typescript
  // src/components/hub/__tests__/hub-explore-client.test.tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@testing-library/react";
  import { NextIntlClientProvider } from "next-intl";
  import { HubExploreClient } from "@/components/hub/hub-explore-client";
  import en from "@/messages/en.json";

  const items = [{
    id: "x", title: "Algebra", description: "d", author: "M", schoolLevel: "PRIMARIA",
    subject: "math", language: "it", tags: [], questionCount: 5,
    downloadsCount: 2, playsCount: 9, license: "CC_BY", publishedAt: new Date().toISOString(),
  }];

  it("renders cards", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <HubExploreClient items={items as any} total={1} page={1} perPage={20} initialFilters={{}} basePath="/explore" />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("Algebra")).toBeInTheDocument();
  });
  ```

- [ ] **6.3 Implement card + client**
  `src/components/hub/hub-quiz-card.tsx`:
  ```typescript
  "use client";
  import Link from "next/link";
  import { useTranslations } from "next-intl";

  export function HubQuizCard({ item, basePath }: { item: any; basePath: string }) {
    const t = useTranslations("hub");
    return (
      <Link href={`/q/${item.id}`} className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all p-5 flex flex-col">
        <h2 className="font-bold text-lg text-slate-900 mb-1 line-clamp-2">{item.title}</h2>
        <p className="text-sm text-slate-600 mb-3 line-clamp-2">{item.description}</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {item.schoolLevel && <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{item.schoolLevel}</span>}
          {item.subject && <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">{item.subject}</span>}
          {item.language && <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{item.language}</span>}
        </div>
        <div className="mt-auto pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
          <span>{t("by", { author: item.author })}</span>
          <span>{t("downloads", { count: item.downloadsCount })} · {t("plays", { count: item.playsCount })}</span>
        </div>
      </Link>
    );
  }
  ```

  Full `HubExploreClient` (replace the placeholder):
  ```typescript
  "use client";
  import { useRouter, useSearchParams } from "next/navigation";
  import { useTranslations } from "next-intl";
  import { HubQuizCard } from "./hub-quiz-card";
  import { SCHOOL_LEVELS, SUBJECTS } from "@/lib/quiz-subjects"; // assumed from Plan 1

  export function HubExploreClient({ items, total, page, perPage, initialFilters, basePath }: any) {
    const t = useTranslations("hub");
    const router = useRouter();
    const sp = useSearchParams();

    const setParam = (k: string, v: string | undefined) => {
      const next = new URLSearchParams(sp);
      if (v === undefined || v === "") next.delete(k); else next.set(k, v);
      next.set("page", "1");
      router.push(`${basePath}?${next.toString()}`);
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
        <aside className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t("filters.schoolLevel")}</label>
            <select value={sp.get("schoolLevel") ?? ""} onChange={(e) => setParam("schoolLevel", e.target.value)} className="w-full px-3 py-2 border rounded">
              <option value="">{t("filters.all")}</option>
              {SCHOOL_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t("filters.subject")}</label>
            <select value={sp.get("subject") ?? ""} onChange={(e) => setParam("subject", e.target.value)} className="w-full px-3 py-2 border rounded">
              <option value="">{t("filters.all")}</option>
              {SUBJECTS.map((s) => <option key={s.slug} value={s.slug}>{s.label_en}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">{t("filters.language")}</label>
            <select value={sp.get("language") ?? ""} onChange={(e) => setParam("language", e.target.value)} className="w-full px-3 py-2 border rounded">
              <option value="">{t("filters.all")}</option>
              <option value="it">it</option><option value="en">en</option>
            </select>
          </div>
        </aside>
        <section>
          <div className="flex items-center gap-3 mb-4">
            <input type="text" defaultValue={sp.get("q") ?? ""} onBlur={(e) => setParam("q", e.target.value || undefined)} placeholder={t("search")} className="flex-1 h-10 px-3 border rounded-lg" />
            <select value={sp.get("sort") ?? "relevant"} onChange={(e) => setParam("sort", e.target.value)} className="px-3 py-2 border rounded-lg">
              <option value="relevant">{t("sort.relevant")}</option>
              <option value="recent">{t("sort.recent")}</option>
              <option value="popular">{t("sort.popular")}</option>
            </select>
          </div>
          {items.length === 0 ? (
            <p className="text-center text-slate-500 py-10">{t("noResults")}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {items.map((i: any) => <HubQuizCard key={i.id} item={i} basePath={basePath} />)}
            </div>
          )}
          {total > perPage && (
            <div className="flex justify-center gap-2 mt-6">
              {page > 1 && <button onClick={() => setParam("page", String(page - 1))} className="px-3 py-1 border rounded">&larr;</button>}
              <span className="px-3 py-1">{page} / {Math.ceil(total / perPage)}</span>
              {page * perPage < total && <button onClick={() => setParam("page", String(page + 1))} className="px-3 py-1 border rounded">&rarr;</button>}
            </div>
          )}
        </section>
      </div>
    );
  }
  ```

- [ ] **6.4 Run tests**
  ```bash
  pnpm vitest run src/components/hub
  ```
  Expect green.

- [ ] **6.5 Commit**
  ```bash
  git add src/components/hub src/messages/en.json src/messages/it.json
  git commit -m "feat(hub): explore UI with filter sidebar, sort, and quiz cards"
  ```

---

### Task 7 — Replace `/q/[id]/page.tsx` placeholder with full detail page

**Files**
- Modify: `src/app/q/[id]/page.tsx`
- Create: `src/components/hub/hub-quiz-detail.tsx`
- Create: `src/components/hub/hub-quiz-detail-actions.tsx` (client component for buttons)
- Create: `src/app/q/[id]/__tests__/page.test.tsx`

**Steps**

- [ ] **7.1 Write failing tests**
  ```typescript
  // src/app/q/[id]/__tests__/page.test.tsx
  import { describe, it, expect, beforeAll, afterAll } from "vitest";
  import { render } from "@testing-library/react";
  import { NextIntlClientProvider } from "next-intl";
  import en from "@/messages/en.json";
  import { prisma } from "@/lib/db/client";

  describe("/q/[id]", () => {
    let id: string;
    beforeAll(async () => {
      const a = await prisma.hubAccount.create({ data: { email: `qd-${Date.now()}@t`, name: "Mara", authMethod: "PASSWORD", linkedProviders: ["password"] } });
      const q = await prisma.hubQuiz.create({
        data: {
          hubAccountId: a.id, title: "Capitali", description: "europa",
          license: "CC_BY", tags: ["geo"], schoolLevel: "SECONDARIA_I", subject: "geography", language: "it",
          questionCount: 1, estimatedDurationSec: 20,
          payloadBlob: Buffer.from("not-zip"), payloadHash: "h",
        },
      });
      id = q.id;
    });
    afterAll(async () => { await prisma.hubQuiz.delete({ where: { id } }); });

    it("renders title, author, license, and counts", async () => {
      const Page = (await import("@/app/q/[id]/page")).default;
      const ui = await Page({ params: Promise.resolve({ id }) });
      const { container } = render(<NextIntlClientProvider locale="en" messages={en}>{ui as any}</NextIntlClientProvider>);
      expect(container.textContent).toContain("Capitali");
      expect(container.textContent).toContain("Mara");
    });

    it("does NOT include correct answers in HTML", async () => {
      const Page = (await import("@/app/q/[id]/page")).default;
      const ui = await Page({ params: Promise.resolve({ id }) });
      const { container } = render(<NextIntlClientProvider locale="en" messages={en}>{ui as any}</NextIntlClientProvider>);
      expect(container.innerHTML.toLowerCase()).not.toContain('"correct"');
    });
  });
  ```

- [ ] **7.2 Implement detail page (server component)**
  ```typescript
  // src/app/q/[id]/page.tsx
  import { notFound } from "next/navigation";
  import { getTranslations } from "next-intl/server";
  import { prisma } from "@/lib/db/client";
  import { extractQuestionPreviews } from "@/lib/hub/qlz-preview";
  import { HubQuizDetail } from "@/components/hub/hub-quiz-detail";

  export const dynamic = "force-dynamic";

  export default async function HubQuizPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const t = await getTranslations("hub");
    const quiz = await prisma.hubQuiz.findUnique({
      where: { id },
      include: { hubAccount: { select: { id: true, name: true, affiliation: true } } },
    });
    if (!quiz) notFound();

    let previews: Awaited<ReturnType<typeof extractQuestionPreviews>> = [];
    try {
      previews = await extractQuestionPreviews(Buffer.from(quiz.payloadBlob));
    } catch {
      // corrupt payload - still render metadata
    }

    return (
      <HubQuizDetail
        quiz={{
          id: quiz.id,
          title: quiz.title,
          description: quiz.description,
          tags: quiz.tags,
          license: quiz.license,
          schoolLevel: quiz.schoolLevel,
          subject: quiz.subject,
          language: quiz.language,
          ageMin: quiz.ageMin,
          ageMax: quiz.ageMax,
          questionCount: quiz.questionCount,
          downloadsCount: quiz.downloadsCount,
          playsCount: quiz.playsCount,
          publishedAt: quiz.publishedAt.toISOString(),
          updatedAt: quiz.updatedAt.toISOString(),
          version: quiz.version,
          suspended: quiz.suspended,
          author: quiz.hubAccount.name,
          authorId: quiz.hubAccount.id,
          authorAffiliation: quiz.hubAccount.affiliation,
        }}
        questions={previews}
      />
    );
  }
  ```

  `src/components/hub/hub-quiz-detail.tsx` (server-rendered):
  ```typescript
  import Link from "next/link";
  import { getTranslations } from "next-intl/server";
  import { HubQuizDetailActions } from "./hub-quiz-detail-actions";

  export async function HubQuizDetail({ quiz, questions }: any) {
    const t = await getTranslations("hub");
    if (quiz.suspended) {
      return (
        <div className="max-w-3xl mx-auto px-4 py-12">
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-6 text-amber-900">
            <h1 className="text-2xl font-bold mb-2">{quiz.title}</h1>
            <p>This quiz has been withdrawn by the author or suspended by moderators.</p>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-dvh bg-gradient-to-br from-indigo-50 via-white to-violet-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <header className="mb-6">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-2">{quiz.title}</h1>
            <p className="text-slate-600 mb-3">{quiz.description}</p>
            <div className="text-sm text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
              <Link className="text-indigo-600 hover:underline" href={`/u/${quiz.authorId}`}>{t("by", { author: quiz.author })}</Link>
              <span>{t("license", { license: quiz.license })}</span>
              <span>{t("version", { n: quiz.version })}</span>
              <span>{t("downloads", { count: quiz.downloadsCount })}</span>
              <span>{t("plays", { count: quiz.playsCount })}</span>
            </div>
          </header>

          <HubQuizDetailActions quizId={quiz.id} />

          <section className="mt-8">
            <h2 className="text-lg font-bold text-slate-900 mb-3">Questions ({quiz.questionCount})</h2>
            <ol className="space-y-2">
              {questions.map((q: any) => (
                <li key={q.order} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="text-xs uppercase font-semibold text-slate-500 mb-1">{q.type}</div>
                  <p className="text-slate-800">{q.text}</p>
                  <p className="text-xs text-slate-500 mt-1">{q.timeLimit}s · {q.points} pts</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    );
  }
  ```

  `src/components/hub/hub-quiz-detail-actions.tsx`:
  ```typescript
  "use client";
  import { useTranslations } from "next-intl";
  import { useRouter } from "next/navigation";
  import { useState } from "react";

  export function HubQuizDetailActions({ quizId }: { quizId: string }) {
    const t = useTranslations("hub");
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const tryNow = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/hub/practice/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hubQuizId: quizId }) });
        if (!res.ok) throw new Error();
        const { runId } = await res.json();
        router.push(`/q/${quizId}/play/${runId}`);
      } catch {
        alert("Could not start practice run");
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="flex flex-wrap gap-3 mt-4">
        <button onClick={tryNow} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl shadow">
          {t("tryNow")}
        </button>
        <a href={`/api/hub/quizzes/${quizId}/download`} className="bg-white border border-slate-300 text-slate-800 font-medium px-5 py-2.5 rounded-xl">
          {t("downloadQlz")}
        </a>
        <button className="bg-white border border-slate-300 text-slate-800 font-medium px-5 py-2.5 rounded-xl">
          {t("report")}
        </button>
      </div>
    );
  }
  ```

- [ ] **7.3 Run tests**
  ```bash
  pnpm vitest run src/app/q
  ```
  Expect `2 passed`.

- [ ] **7.4 Commit**
  ```bash
  git add src/app/q src/components/hub/hub-quiz-detail.tsx src/components/hub/hub-quiz-detail-actions.tsx
  git commit -m "feat(hub): full detail page at /q/:id with question preview (no answers in HTML)"
  ```

---

### Task 8 — `POST /api/hub/practice/start` and helper library

**Files**
- Create: `src/lib/hub/practice-run.ts`
- Create: `src/app/api/hub/practice/start/route.ts`
- Create: `src/lib/hub/__tests__/practice-run.test.ts`
- Create: `src/app/api/hub/practice/start/__tests__/route.test.ts`

**Steps**

- [ ] **8.1 Write helper tests**
  ```typescript
  // src/lib/hub/__tests__/practice-run.test.ts
  import { describe, it, expect, beforeAll, afterAll } from "vitest";
  import { prisma } from "@/lib/db/client";
  import { createPracticeRun, hashIp, completePracticeRun, getPracticeRun } from "@/lib/hub/practice-run";

  describe("practice-run helpers", () => {
    let hubQuizId: string;
    beforeAll(async () => {
      const a = await prisma.hubAccount.create({ data: { email: `pr-${Date.now()}@t`, name: "X", authMethod: "PASSWORD", linkedProviders: ["password"] } });
      const q = await prisma.hubQuiz.create({ data: { hubAccountId: a.id, title: "t", description: "d", license: "CC_BY", tags: [], schoolLevel: "PRIMARIA", subject: "math", language: "it", questionCount: 2, estimatedDurationSec: 60, payloadBlob: Buffer.from("x"), payloadHash: "h" } });
      hubQuizId = q.id;
    });
    afterAll(async () => { await prisma.practiceRun.deleteMany({ where: { hubQuizId } }); });

    it("hashIp is deterministic and never reveals raw IP", () => {
      const a = hashIp("1.2.3.4"); const b = hashIp("1.2.3.4");
      expect(a).toBe(b); expect(a).not.toContain("1.2.3.4");
    });

    it("createPracticeRun stores hashed ip and returns id", async () => {
      const run = await createPracticeRun({ hubQuizId, ip: "1.2.3.4" });
      expect(run.id).toBeDefined();
      const r = await getPracticeRun(run.id);
      expect(r?.ipHash).toBe(hashIp("1.2.3.4"));
    });

    it("completePracticeRun increments playsCount once", async () => {
      const before = await prisma.hubQuiz.findUnique({ where: { id: hubQuizId } });
      const run = await createPracticeRun({ hubQuizId, ip: "1.2.3.4" });
      await completePracticeRun(run.id);
      await completePracticeRun(run.id); // idempotent
      const after = await prisma.hubQuiz.findUnique({ where: { id: hubQuizId } });
      expect(after!.playsCount).toBe(before!.playsCount + 1);
    });
  });
  ```

- [ ] **8.2 Implement helpers**
  ```typescript
  // src/lib/hub/practice-run.ts
  import { createHash } from "crypto";
  import { prisma } from "@/lib/db/client";

  const SECRET = process.env.HUB_IP_HASH_SECRET ?? "dev-secret-do-not-use-in-prod";

  export function hashIp(ip: string): string {
    return createHash("sha256").update(`${SECRET}:${ip}`).digest("hex");
  }

  export async function createPracticeRun({ hubQuizId, ip }: { hubQuizId: string; ip: string }) {
    return prisma.practiceRun.create({
      data: { hubQuizId, ipHash: hashIp(ip) },
    });
  }

  export async function getPracticeRun(id: string) {
    return prisma.practiceRun.findUnique({ where: { id } });
  }

  export async function completePracticeRun(runId: string) {
    return prisma.$transaction(async (tx) => {
      const run = await tx.practiceRun.findUnique({ where: { id: runId } });
      if (!run || run.completedAt) return run;
      const updated = await tx.practiceRun.update({ where: { id: runId }, data: { completedAt: new Date() } });
      await tx.hubQuiz.update({ where: { id: run.hubQuizId }, data: { playsCount: { increment: 1 } } });
      return updated;
    });
  }
  ```

- [ ] **8.3 Write route test**
  ```typescript
  // src/app/api/hub/practice/start/__tests__/route.test.ts
  import { describe, it, expect, beforeAll, afterAll } from "vitest";
  import { POST } from "@/app/api/hub/practice/start/route";
  import { prisma } from "@/lib/db/client";
  import { NextRequest } from "next/server";

  describe("POST /api/hub/practice/start", () => {
    let hubQuizId: string;
    beforeAll(async () => {
      const a = await prisma.hubAccount.create({ data: { email: `ps-${Date.now()}@t`, name: "X", authMethod: "PASSWORD", linkedProviders: ["password"] } });
      const q = await prisma.hubQuiz.create({ data: { hubAccountId: a.id, title: "t", description: "d", license: "CC_BY", tags: [], schoolLevel: "PRIMARIA", subject: "math", language: "it", questionCount: 1, estimatedDurationSec: 30, payloadBlob: Buffer.from("x"), payloadHash: "h" } });
      hubQuizId = q.id;
    });
    afterAll(async () => { await prisma.practiceRun.deleteMany({ where: { hubQuizId } }); });

    it("returns 201 + runId", async () => {
      const req = new NextRequest("http://t/api/hub/practice/start", { method: "POST", body: JSON.stringify({ hubQuizId }), headers: { "Content-Type": "application/json", "x-forwarded-for": "1.1.1.1" } });
      const res = await POST(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.runId).toBeDefined();
    });

    it("returns 404 for unknown quiz", async () => {
      const req = new NextRequest("http://t/api/hub/practice/start", { method: "POST", body: JSON.stringify({ hubQuizId: "missing" }), headers: { "Content-Type": "application/json", "x-forwarded-for": "1.1.1.1" } });
      const res = await POST(req);
      expect(res.status).toBe(404);
    });
  });
  ```

- [ ] **8.4 Implement route**
  ```typescript
  // src/app/api/hub/practice/start/route.ts
  import { NextRequest, NextResponse } from "next/server";
  import { z } from "zod";
  import { prisma } from "@/lib/db/client";
  import { createPracticeRun } from "@/lib/hub/practice-run";
  import { enforceHubRateLimit } from "@/lib/hub/rate-limit";

  const bodySchema = z.object({ hubQuizId: z.string().min(1) });

  export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "anon";
    const rl = await enforceHubRateLimit({ key: `practice-start:${ip}`, limit: 5, windowSec: 60 });
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const quiz = await prisma.hubQuiz.findUnique({ where: { id: parsed.data.hubQuizId } });
    if (!quiz || quiz.suspended) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const run = await createPracticeRun({ hubQuizId: quiz.id, ip });
    return NextResponse.json({ runId: run.id }, { status: 201 });
  }
  ```

- [ ] **8.5 Run all tests**
  ```bash
  pnpm vitest run src/lib/hub src/app/api/hub/practice
  ```
  Expect green.

- [ ] **8.6 Commit**
  ```bash
  git add src/lib/hub/practice-run.ts src/app/api/hub/practice/start
  git commit -m "feat(hub): practice-run helpers + POST /api/hub/practice/start"
  ```

---

### Task 9 — `GET /api/hub/practice/:runId/question/:order`

**Files**
- Create: `src/app/api/hub/practice/[runId]/question/[order]/route.ts`
- Create: `src/app/api/hub/practice/[runId]/question/[order]/__tests__/route.test.ts`

**Steps**

- [ ] **9.1 Write failing tests for both pre- and post-submission states**
  ```typescript
  // src/app/api/hub/practice/[runId]/question/[order]/__tests__/route.test.ts
  import { describe, it, expect, beforeAll, afterAll } from "vitest";
  import { GET } from "@/app/api/hub/practice/[runId]/question/[order]/route";
  import { prisma } from "@/lib/db/client";
  import JSZip from "jszip";
  import { NextRequest } from "next/server";

  describe("question endpoint", () => {
    let runId: string;
    let hubQuizId: string;
    beforeAll(async () => {
      const a = await prisma.hubAccount.create({ data: { email: `pq-${Date.now()}@t`, name: "x", authMethod: "PASSWORD", linkedProviders: ["password"] } });
      const zip = new JSZip();
      zip.file("manifest.json", JSON.stringify({ quiz: { questions: [{ type: "TRUE_FALSE", text: "Q1?", timeLimit: 20, points: 100, options: { correct: true } }, { type: "TRUE_FALSE", text: "Q2?", timeLimit: 20, points: 100, options: { correct: false } }] } }));
      const blob = await zip.generateAsync({ type: "nodebuffer" });
      const q = await prisma.hubQuiz.create({ data: { hubAccountId: a.id, title: "t", description: "d", license: "CC_BY", tags: [], schoolLevel: "PRIMARIA", subject: "math", language: "it", questionCount: 2, estimatedDurationSec: 40, payloadBlob: blob, payloadHash: "h" } });
      hubQuizId = q.id;
      const run = await prisma.practiceRun.create({ data: { hubQuizId, ipHash: "x" } });
      runId = run.id;
    });
    afterAll(async () => { await prisma.hubQuiz.delete({ where: { id: hubQuizId } }); });

    it("returns question text+options WITHOUT correct field before answer", async () => {
      const res = await GET(new NextRequest("http://t"), { params: Promise.resolve({ runId, order: "0" }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.text).toBe("Q1?");
      expect(JSON.stringify(body)).not.toContain('"correct"');
    });

    it("404 for unknown run", async () => {
      const res = await GET(new NextRequest("http://t"), { params: Promise.resolve({ runId: "missing", order: "0" }) });
      expect(res.status).toBe(404);
    });

    it("404 for expired run", async () => {
      await prisma.practiceRun.update({ where: { id: runId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const res = await GET(new NextRequest("http://t"), { params: Promise.resolve({ runId, order: "0" }) });
      expect(res.status).toBe(410);
    });
  });
  ```

- [ ] **9.2 Implement the route**
  ```typescript
  // src/app/api/hub/practice/[runId]/question/[order]/route.ts
  import { NextRequest, NextResponse } from "next/server";
  import { prisma } from "@/lib/db/client";
  import JSZip from "jszip";

  export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string; order: string }> }) {
    const { runId, order } = await params;
    const orderNum = Number.parseInt(order, 10);
    if (!Number.isFinite(orderNum) || orderNum < 0) return NextResponse.json({ error: "Bad order" }, { status: 400 });

    const run = await prisma.practiceRun.findUnique({ where: { id: runId }, include: { hubQuiz: true } });
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (run.expiresAt < new Date()) return NextResponse.json({ error: "Expired" }, { status: 410 });

    const zip = await JSZip.loadAsync(Buffer.from(run.hubQuiz.payloadBlob));
    const mf = zip.file("manifest.json");
    if (!mf) return NextResponse.json({ error: "Corrupt payload" }, { status: 500 });
    const manifest = JSON.parse(await mf.async("text"));
    const q = manifest.quiz?.questions?.[orderNum];
    if (!q) return NextResponse.json({ error: "Question not found" }, { status: 404 });

    // Strip correct answers from options before returning.
    const sanitized = stripCorrect(q.options);

    return NextResponse.json({
      order: orderNum,
      type: q.type,
      text: q.text,
      timeLimit: q.timeLimit,
      points: q.points,
      options: sanitized,
      isLast: orderNum === manifest.quiz.questions.length - 1,
    });
  }

  function stripCorrect(opts: any): any {
    if (!opts || typeof opts !== "object") return opts;
    const out: any = Array.isArray(opts) ? [] : {};
    for (const [k, v] of Object.entries(opts)) {
      if (k === "correct" || k === "correctAnswer" || k === "correctIndex" || k === "correctIndices" || k === "correctText" || k === "correctValue" || k === "correctMatches" || k === "correctOrder" || k === "hotspot") continue;
      out[k] = typeof v === "object" ? stripCorrect(v) : v;
    }
    return out;
  }
  ```

- [ ] **9.3 Run tests**
  ```bash
  pnpm vitest run src/app/api/hub/practice/[runId]
  ```
  Expect green.

- [ ] **9.4 Commit**
  ```bash
  git add src/app/api/hub/practice/[runId]/question
  git commit -m "feat(hub): per-question fetch endpoint strips correct answers"
  ```

---

### Task 10 — `POST /api/hub/practice/:runId/answer`

**Files**
- Create: `src/app/api/hub/practice/[runId]/answer/route.ts`
- Create: `src/app/api/hub/practice/[runId]/answer/__tests__/route.test.ts`

**Steps**

- [ ] **10.1 Write failing tests**
  ```typescript
  import { describe, it, expect, beforeAll, afterAll } from "vitest";
  import { POST } from "@/app/api/hub/practice/[runId]/answer/route";
  import { prisma } from "@/lib/db/client";
  import JSZip from "jszip";
  import { NextRequest } from "next/server";

  describe("POST answer", () => {
    let runId: string; let hubQuizId: string;
    beforeAll(async () => {
      const a = await prisma.hubAccount.create({ data: { email: `pa-${Date.now()}@t`, name: "x", authMethod: "PASSWORD", linkedProviders: ["password"] } });
      const zip = new JSZip();
      zip.file("manifest.json", JSON.stringify({ quiz: { questions: [{ type: "TRUE_FALSE", text: "?", timeLimit: 20, points: 100, options: { correct: true } }] } }));
      const blob = await zip.generateAsync({ type: "nodebuffer" });
      const q = await prisma.hubQuiz.create({ data: { hubAccountId: a.id, title: "t", description: "d", license: "CC_BY", tags: [], schoolLevel: "PRIMARIA", subject: "math", language: "it", questionCount: 1, estimatedDurationSec: 20, payloadBlob: blob, payloadHash: "h" } });
      hubQuizId = q.id;
      const r = await prisma.practiceRun.create({ data: { hubQuizId, ipHash: "x" } });
      runId = r.id;
    });
    afterAll(async () => { await prisma.hubQuiz.delete({ where: { id: hubQuizId } }); });

    it("returns correctness and increments playsCount when last question submitted", async () => {
      const before = await prisma.hubQuiz.findUnique({ where: { id: hubQuizId } });
      const req = new NextRequest("http://t", { method: "POST", body: JSON.stringify({ order: 0, value: { selected: true } }), headers: { "Content-Type": "application/json" } });
      const res = await POST(req, { params: Promise.resolve({ runId }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isCorrect).toBe(true);
      const after = await prisma.hubQuiz.findUnique({ where: { id: hubQuizId } });
      expect(after!.playsCount).toBe(before!.playsCount + 1);
    });
  });
  ```

- [ ] **10.2 Implement route**
  ```typescript
  // src/app/api/hub/practice/[runId]/answer/route.ts
  import { NextRequest, NextResponse } from "next/server";
  import { z } from "zod";
  import JSZip from "jszip";
  import { prisma } from "@/lib/db/client";
  import { completePracticeRun } from "@/lib/hub/practice-run";
  import { checkAnswer } from "@/lib/scoring";

  const bodySchema = z.object({
    order: z.number().int().min(0),
    value: z.any(), // delegated to checkAnswer
  });

  export async function POST(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
    const { runId } = await params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const run = await prisma.practiceRun.findUnique({ where: { id: runId }, include: { hubQuiz: true } });
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (run.expiresAt < new Date()) return NextResponse.json({ error: "Expired" }, { status: 410 });
    if (run.completedAt) return NextResponse.json({ error: "Already completed" }, { status: 409 });

    const zip = await JSZip.loadAsync(Buffer.from(run.hubQuiz.payloadBlob));
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("text"));
    const question = manifest.quiz.questions[parsed.data.order];
    if (!question) return NextResponse.json({ error: "Question not found" }, { status: 404 });

    const isCorrect = checkAnswer(question.type, question.options, parsed.data.value);

    const answers = (run.answers as any[]) ?? [];
    answers.push({ order: parsed.data.order, correct: isCorrect, submittedAt: new Date().toISOString() });

    const isLast = parsed.data.order === manifest.quiz.questions.length - 1;
    await prisma.practiceRun.update({ where: { id: runId }, data: { answers } });

    if (isLast) await completePracticeRun(runId);

    return NextResponse.json({ isCorrect, correctOptions: question.options, isLast });
  }
  ```

- [ ] **10.3 Run tests**
  ```bash
  pnpm vitest run src/app/api/hub/practice/[runId]/answer
  ```

- [ ] **10.4 Commit**
  ```bash
  git add src/app/api/hub/practice/[runId]/answer
  git commit -m "feat(hub): POST answer endpoint with completion-triggered playsCount"
  ```

---

### Task 11 — Practice play page `/q/:id/play/:runId` and `PracticeRunner` component

**Files**
- Create: `src/app/q/[id]/play/[runId]/page.tsx`
- Create: `src/components/hub/practice-runner.tsx`
- Create: `src/components/hub/__tests__/practice-runner.test.tsx`

**Steps**

- [ ] **11.1 Write component test**
  ```typescript
  // src/components/hub/__tests__/practice-runner.test.tsx
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { render, screen, waitFor } from "@testing-library/react";
  import { NextIntlClientProvider } from "next-intl";
  import en from "@/messages/en.json";
  import { PracticeRunner } from "@/components/hub/practice-runner";

  beforeEach(() => {
    (global as any).fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ order: 0, type: "TRUE_FALSE", text: "Sky blue?", timeLimit: 20, points: 100, options: {}, isLast: true }),
    });
  });

  describe("<PracticeRunner>", () => {
    it("loads first question via fetch", async () => {
      render(
        <NextIntlClientProvider locale="en" messages={en}>
          <PracticeRunner runId="r" hubQuizId="q" totalQuestions={1} title="T" authorName="A" />
        </NextIntlClientProvider>
      );
      // intro screen → user must press Start to fetch question
      const start = await screen.findByText(/start/i);
      start.click();
      await waitFor(() => expect(screen.getByText("Sky blue?")).toBeInTheDocument());
    });
  });
  ```

- [ ] **11.2 Implement `<PracticeRunner>`**
  Skeleton that adapts `practice-view.tsx`:
  ```typescript
  // src/components/hub/practice-runner.tsx
  "use client";
  import { useCallback, useEffect, useState } from "react";
  import { useTranslations } from "next-intl";
  import { AnswerInput } from "@/components/live/player-view";
  import type { AnswerValue } from "@/types";

  interface FetchedQuestion {
    order: number;
    type: string;
    text: string;
    timeLimit: number;
    points: number;
    options: any;
    isLast: boolean;
  }

  export function PracticeRunner({ runId, hubQuizId, totalQuestions, title, authorName }: { runId: string; hubQuizId: string; totalQuestions: number; title: string; authorName: string }) {
    const t = useTranslations("hub");
    const tp = useTranslations("practice");
    const [phase, setPhase] = useState<"intro" | "loading" | "question" | "feedback" | "done">("intro");
    const [current, setCurrent] = useState<FetchedQuestion | null>(null);
    const [order, setOrder] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    const [lastResult, setLastResult] = useState<{ isCorrect: boolean; correctOptions: any } | null>(null);
    const [scoreCorrect, setScoreCorrect] = useState(0);

    const fetchQuestion = useCallback(async (n: number) => {
      setPhase("loading");
      const res = await fetch(`/api/hub/practice/${runId}/question/${n}`);
      if (!res.ok) { setPhase("done"); return; }
      const q = (await res.json()) as FetchedQuestion;
      setCurrent(q);
      setTimeLeft(q.timeLimit);
      setPhase("question");
    }, [runId]);

    const submit = async (value: AnswerValue | null) => {
      if (!current) return;
      const res = await fetch(`/api/hub/practice/${runId}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: current.order, value: value ?? { skipped: true } }) });
      const data = await res.json();
      setLastResult({ isCorrect: data.isCorrect, correctOptions: data.correctOptions });
      if (data.isCorrect) setScoreCorrect((n) => n + 1);
      setPhase("feedback");
    };

    useEffect(() => {
      if (phase !== "question" || !current) return;
      if (timeLeft <= 0) { submit(null); return; }
      const id = setInterval(() => setTimeLeft((s) => s - 1), 1000);
      return () => clearInterval(id);
    }, [phase, timeLeft, current]);

    if (phase === "intro") {
      return (
        <div className="min-h-dvh flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
            <h1 className="text-2xl font-bold mb-2">{title}</h1>
            <p className="text-slate-600 mb-2">{t("by", { author: authorName })}</p>
            <p className="text-slate-600 mb-6">{totalQuestions} questions</p>
            <button onClick={() => fetchQuestion(0)} className="bg-indigo-600 text-white font-bold px-6 py-3 rounded-xl">{tp("start")}</button>
          </div>
        </div>
      );
    }

    if (phase === "loading") return <div className="min-h-dvh flex items-center justify-center">…</div>;

    if (phase === "question" && current) {
      return (
        <div className="min-h-dvh bg-slate-900 text-white p-6">
          <div className="flex justify-between mb-3">
            <span>{current.order + 1} / {totalQuestions}</span>
            <span className={timeLeft <= 5 ? "text-red-400" : ""}>{timeLeft}s</span>
          </div>
          <h2 className="text-2xl font-bold mb-6 text-center">{current.text}</h2>
          <AnswerInput key={current.order} type={current.type as any} options={current.options} onSubmit={submit} />
        </div>
      );
    }

    if (phase === "feedback" && current && lastResult) {
      const next = () => {
        if (current.isLast) { setPhase("done"); return; }
        setOrder((n) => n + 1);
        fetchQuestion(current.order + 1);
      };
      return (
        <div className={`min-h-dvh flex flex-col items-center justify-center p-6 ${lastResult.isCorrect ? "bg-emerald-500" : "bg-rose-500"} text-white`}>
          <div className="text-7xl mb-4">{lastResult.isCorrect ? "✓" : "✗"}</div>
          <button onClick={next} className="bg-white text-slate-900 font-bold px-6 py-3 rounded-xl">{current.isLast ? tp("seeResults") : tp("next")}</button>
        </div>
      );
    }

    if (phase === "done") {
      return (
        <div className="min-h-dvh flex items-center justify-center p-6 bg-slate-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-xl">
            <h1 className="text-3xl font-bold mb-2">{tp("finalResult")}</h1>
            <p className="text-5xl font-black my-4">{scoreCorrect} / {totalQuestions}</p>
            <a href={`/q/${hubQuizId}`} className="inline-block bg-indigo-600 text-white font-bold px-6 py-3 rounded-xl">Back</a>
          </div>
        </div>
      );
    }

    return null;
  }
  ```

- [ ] **11.3 Implement page**
  ```typescript
  // src/app/q/[id]/play/[runId]/page.tsx
  import { notFound } from "next/navigation";
  import { prisma } from "@/lib/db/client";
  import { PracticeRunner } from "@/components/hub/practice-runner";

  export const dynamic = "force-dynamic";

  export default async function PracticePlayPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
    const { id, runId } = await params;
    const run = await prisma.practiceRun.findUnique({ where: { id: runId }, include: { hubQuiz: { include: { hubAccount: { select: { name: true } } } } } });
    if (!run || run.hubQuizId !== id || run.expiresAt < new Date()) notFound();
    return (
      <PracticeRunner
        runId={run.id}
        hubQuizId={run.hubQuizId}
        totalQuestions={run.hubQuiz.questionCount}
        title={run.hubQuiz.title}
        authorName={run.hubQuiz.hubAccount.name}
      />
    );
  }
  ```

- [ ] **11.4 Run tests and commit**
  ```bash
  pnpm vitest run src/components/hub/__tests__/practice-runner.test.tsx
  git add src/app/q/[id]/play src/components/hub/practice-runner.tsx src/components/hub/__tests__/practice-runner.test.tsx
  git commit -m "feat(hub): /q/:id/play/:runId page and streamed PracticeRunner component"
  ```

---

### Task 12 — `GET /api/hub/quizzes/:id/download` (Bearer + clone scope)

**Files**
- Create: `src/app/api/hub/quizzes/[id]/download/route.ts`
- Create: `src/app/api/hub/quizzes/[id]/download/__tests__/route.test.ts`

**Steps**

- [ ] **12.1 Write failing tests**
  ```typescript
  import { describe, it, expect, beforeAll, afterAll } from "vitest";
  import { GET } from "@/app/api/hub/quizzes/[id]/download/route";
  import { prisma } from "@/lib/db/client";
  import { issueHubAccessToken } from "@/lib/hub/access-token"; // from Plan 3
  import { NextRequest } from "next/server";

  describe("download endpoint", () => {
    let hubQuizId: string; let tokenWithClone: string; let tokenNoScope: string;
    beforeAll(async () => {
      const a = await prisma.hubAccount.create({ data: { email: `dl-${Date.now()}@t`, name: "x", authMethod: "PASSWORD", linkedProviders: ["password"] } });
      const inst = await prisma.installation.create({ data: { name: "i", contactEmail: "i@t", clientId: `cid-${Date.now()}`, clientSecretHash: "h" } });
      const q = await prisma.hubQuiz.create({ data: { hubAccountId: a.id, title: "t", description: "d", license: "CC_BY", tags: [], schoolLevel: "PRIMARIA", subject: "math", language: "it", questionCount: 1, estimatedDurationSec: 30, payloadBlob: Buffer.from("zip"), payloadHash: "h" } });
      hubQuizId = q.id;
      tokenWithClone = (await issueHubAccessToken({ hubAccountId: a.id, installationId: inst.id, scopes: ["clone"] })).accessToken;
      tokenNoScope = (await issueHubAccessToken({ hubAccountId: a.id, installationId: inst.id, scopes: ["publish"] })).accessToken;
    });
    afterAll(async () => { await prisma.hubQuiz.delete({ where: { id: hubQuizId } }); });

    it("401 without bearer", async () => {
      const res = await GET(new NextRequest("http://t"), { params: Promise.resolve({ id: hubQuizId }) });
      expect(res.status).toBe(401);
    });
    it("403 without clone scope", async () => {
      const res = await GET(new NextRequest("http://t", { headers: { Authorization: `Bearer ${tokenNoScope}` } }), { params: Promise.resolve({ id: hubQuizId }) });
      expect(res.status).toBe(403);
    });
    it("200 increments downloadsCount", async () => {
      const before = (await prisma.hubQuiz.findUnique({ where: { id: hubQuizId } }))!;
      const res = await GET(new NextRequest("http://t", { headers: { Authorization: `Bearer ${tokenWithClone}` } }), { params: Promise.resolve({ id: hubQuizId }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.qlzBase64).toBe(Buffer.from("zip").toString("base64"));
      expect(body.hubQuizId).toBe(hubQuizId);
      const after = (await prisma.hubQuiz.findUnique({ where: { id: hubQuizId } }))!;
      expect(after.downloadsCount).toBe(before.downloadsCount + 1);
    });
  });
  ```

- [ ] **12.2 Implement route**
  ```typescript
  // src/app/api/hub/quizzes/[id]/download/route.ts
  import { NextRequest, NextResponse } from "next/server";
  import { prisma } from "@/lib/db/client";
  import { requireHubAccessToken } from "@/lib/hub/access-token"; // from Plan 3
  import { enforceHubRateLimit } from "@/lib/hub/rate-limit";

  export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const token = auth.slice(7);

    let info;
    try { info = await requireHubAccessToken(token, { scope: "clone" }); }
    catch (e: any) {
      if (e?.code === "MISSING_SCOPE") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await enforceHubRateLimit({ key: `download:${token}`, limit: 30, windowSec: 60 });
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const { id } = await params;
    const quiz = await prisma.hubQuiz.findUnique({ where: { id }, include: { hubAccount: { select: { name: true } } } });
    if (!quiz || quiz.suspended) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.hubQuiz.update({ where: { id }, data: { downloadsCount: { increment: 1 } } });

    return NextResponse.json({
      qlzBase64: Buffer.from(quiz.payloadBlob).toString("base64"),
      hubQuizId: quiz.id,
      hubAuthor: quiz.hubAccount.name,
      version: quiz.version,
    });
  }
  ```

- [ ] **12.3 Run tests**
  ```bash
  pnpm vitest run src/app/api/hub/quizzes/[id]/download
  ```

- [ ] **12.4 Commit**
  ```bash
  git add src/app/api/hub/quizzes/[id]/download
  git commit -m "feat(hub): GET /api/hub/quizzes/:id/download (Bearer + clone scope)"
  ```

---

### Task 13 — Installation-side browse menu and dashboard page

**Files**
- Modify: `src/components/dashboard/sidebar.tsx`
- Create: `src/app/(dashboard)/dashboard/hub/page.tsx`
- Modify: `src/lib/hub/hub-client.ts` (add `searchHubQuizzes`)
- Create: `src/app/(dashboard)/dashboard/hub/__tests__/page.test.tsx`

**Steps**

- [ ] **13.1 Add `searchHubQuizzes` to `hub-client.ts`**
  ```typescript
  // extends src/lib/hub/hub-client.ts (Plan 3)
  export async function searchHubQuizzesRemote(filters: Record<string, string | undefined>) {
    const url = new URL("/api/hub/quizzes", process.env.SAVINT_HUB_URL!);
    for (const [k, v] of Object.entries(filters)) if (v !== undefined) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error("Hub unreachable");
    return res.json();
  }
  ```

- [ ] **13.2 Write page test**
  ```typescript
  // src/app/(dashboard)/dashboard/hub/__tests__/page.test.tsx
  import { describe, it, expect, vi } from "vitest";
  import { render } from "@testing-library/react";
  import { NextIntlClientProvider } from "next-intl";
  import en from "@/messages/en.json";

  vi.mock("@/lib/hub/hub-client", () => ({
    searchHubQuizzesRemote: vi.fn().mockResolvedValue({ items: [{ id: "x", title: "Hub Quiz", description: "d", author: "M", schoolLevel: "PRIMARIA", subject: "math", language: "it", tags: [], questionCount: 3, downloadsCount: 0, playsCount: 0, license: "CC_BY", publishedAt: new Date().toISOString() }], total: 1, page: 1, perPage: 20 }),
  }));
  vi.mock("@/lib/auth/config", () => ({ auth: vi.fn().mockResolvedValue({ user: { id: "u1" } }) }));

  describe("/dashboard/hub", () => {
    it("renders items from remote hub", async () => {
      process.env.SAVINT_HUB_URL = "http://hub";
      const Page = (await import("@/app/(dashboard)/dashboard/hub/page")).default;
      const ui = await Page({ searchParams: Promise.resolve({}) });
      const { container } = render(<NextIntlClientProvider locale="en" messages={en}>{ui as any}</NextIntlClientProvider>);
      expect(container.textContent).toContain("Hub Quiz");
    });
  });
  ```

- [ ] **13.3 Implement page**
  ```typescript
  // src/app/(dashboard)/dashboard/hub/page.tsx
  import { auth } from "@/lib/auth/config";
  import { redirect } from "next/navigation";
  import { HubExploreClient } from "@/components/hub/hub-explore-client";
  import { searchHubQuizzesRemote } from "@/lib/hub/hub-client";

  export const dynamic = "force-dynamic";

  export default async function DashboardHubPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
    const session = await auth();
    if (!session?.user?.id) redirect("/auth/signin");
    if (!process.env.SAVINT_HUB_URL) return <div className="p-6">SAVINT_HUB_URL not configured</div>;

    const sp = await searchParams;
    let data: any;
    try { data = await searchHubQuizzesRemote(sp); }
    catch { return <div className="p-6 text-rose-700">Repository not reachable, try again later</div>; }

    return (
      <div className="p-6">
        <HubExploreClient items={data.items} total={data.total} page={data.page} perPage={data.perPage} initialFilters={sp} basePath="/dashboard/hub" />
      </div>
    );
  }
  ```

- [ ] **13.4 Add sidebar menu entry**
  In `src/components/dashboard/sidebar.tsx` add (after the existing library item):
  ```tsx
  {process.env.NEXT_PUBLIC_SAVINT_HUB_URL && (
    <Link href="/dashboard/hub" className="...">
      <CloudIcon className="w-4 h-4" /> {t("browseRepository")}
    </Link>
  )}
  ```
  Plus an i18n key `dashboard.browseRepository` = "Browse savint.it repository" / "Sfoglia repository savint.it".

- [ ] **13.5 Run tests and commit**
  ```bash
  pnpm vitest run src/app/\(dashboard\)/dashboard/hub
  git add src/app/\(dashboard\)/dashboard/hub src/lib/hub/hub-client.ts src/components/dashboard/sidebar.tsx src/messages
  git commit -m "feat(hub): installation-side /dashboard/hub catalog browser"
  ```

---

### Task 14 — Installation-side detail view `/dashboard/hub/[id]` with Clone button

**Files**
- Create: `src/app/(dashboard)/dashboard/hub/[id]/page.tsx`
- Create: `src/components/hub/clone-button.tsx`
- Modify: `src/lib/hub/hub-client.ts` (add `fetchHubQuizDetail`)

**Steps**

- [ ] **14.1 Extend hub-client**
  ```typescript
  export async function fetchHubQuizDetail(id: string) {
    const url = new URL(`/api/hub/quizzes/${id}`, process.env.SAVINT_HUB_URL!);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`Detail fetch failed: ${res.status}`);
    return res.json();
  }
  ```

- [ ] **14.2 Implement `<CloneButton>`**
  ```typescript
  "use client";
  import { useState } from "react";
  import { useRouter } from "next/navigation";
  import { useTranslations } from "next-intl";

  export function CloneButton({ hubQuizId, hubVersion }: { hubQuizId: string; hubVersion: number }) {
    const t = useTranslations("hub");
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const handleClone = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/dashboard/hub/clone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hubQuizId, hubVersion }) });
        if (res.status === 409) {
          const { localQuizId } = await res.json();
          if (confirm(t("alreadyCloned") + " — Open existing?")) router.push(`/dashboard/quiz/${localQuizId}`);
          return;
        }
        if (!res.ok) throw new Error();
        const { quizId } = await res.json();
        router.push(`/dashboard/quiz/${quizId}`);
      } catch {
        alert("Clone failed");
      } finally {
        setLoading(false);
      }
    };

    return (
      <button onClick={handleClone} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl shadow disabled:opacity-60">
        {t("clone")}
      </button>
    );
  }
  ```

- [ ] **14.3 Implement page**
  ```typescript
  // src/app/(dashboard)/dashboard/hub/[id]/page.tsx
  import { auth } from "@/lib/auth/config";
  import { redirect, notFound } from "next/navigation";
  import { fetchHubQuizDetail } from "@/lib/hub/hub-client";
  import { CloneButton } from "@/components/hub/clone-button";

  export const dynamic = "force-dynamic";

  export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user?.id) redirect("/auth/signin");
    const { id } = await params;
    let data;
    try { data = await fetchHubQuizDetail(id); } catch { notFound(); }
    return (
      <div className="p-6 max-w-4xl">
        <h1 className="text-3xl font-bold mb-2">{data.title}</h1>
        <p className="text-slate-600 mb-4">{data.description}</p>
        <CloneButton hubQuizId={data.id} hubVersion={data.version} />
        <section className="mt-8">
          <h2 className="text-lg font-bold mb-3">Questions ({data.questionCount})</h2>
          <ol className="space-y-2">
            {data.questions.map((q: any) => (
              <li key={q.order} className="bg-white rounded-xl border p-4">
                <p className="text-xs uppercase text-slate-500">{q.type}</p>
                <p>{q.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    );
  }
  ```

- [ ] **14.4 Run tests and commit**
  ```bash
  pnpm vitest run src
  git add src/app/\(dashboard\)/dashboard/hub/\[id\] src/components/hub/clone-button.tsx src/lib/hub/hub-client.ts
  git commit -m "feat(hub): installation detail view with Clone button"
  ```

---

### Task 15 — Clone API route `/api/dashboard/hub/clone`

**Files**
- Create: `src/app/api/dashboard/hub/clone/route.ts`
- Create: `src/app/api/dashboard/hub/clone/__tests__/route.test.ts`

**Steps**

- [ ] **15.1 Write tests covering dedup and successful clone**
  ```typescript
  // src/app/api/dashboard/hub/clone/__tests__/route.test.ts
  import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
  import { prisma } from "@/lib/db/client";
  import { NextRequest } from "next/server";

  vi.mock("@/lib/auth/config", () => ({ auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }) }));
  vi.mock("@/lib/hub/hub-client", () => ({
    fetchHubQuizDownload: vi.fn(),
  }));

  let POST: any;
  beforeEach(async () => ({ POST } = await import("@/app/api/dashboard/hub/clone/route")));

  describe("POST /api/dashboard/hub/clone", () => {
    afterEach(async () => { await prisma.quiz.deleteMany({ where: { authorId: "user-1" } }); });

    it("creates a local Quiz with clonedFromHub fields", async () => {
      const m = await import("@/lib/hub/hub-client");
      // Build a tiny valid .qlz on the fly using JSZip:
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      zip.file("manifest.json", JSON.stringify({ quiz: { title: "From Hub", description: "x", tags: [], questions: [{ type: "TRUE_FALSE", text: "?", timeLimit: 20, points: 100, options: { correct: true } }] } }));
      const buf = await zip.generateAsync({ type: "nodebuffer" });
      (m.fetchHubQuizDownload as any).mockResolvedValue({ qlzBase64: buf.toString("base64"), hubQuizId: "hub-1", hubAuthor: "Mara", version: 1 });

      // Need a user row
      await prisma.user.upsert({ where: { id: "user-1" }, update: {}, create: { id: "user-1", email: `clone-${Date.now()}@t`, name: "U" } });

      const req = new NextRequest("http://t", { method: "POST", body: JSON.stringify({ hubQuizId: "hub-1", hubVersion: 1 }), headers: { "Content-Type": "application/json" } });
      const res = await POST(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      const q = await prisma.quiz.findUnique({ where: { id: body.quizId } });
      expect(q?.clonedFromHubId).toBe("hub-1");
      expect(q?.clonedFromHubAuthor).toBe("Mara");
      expect(q?.clonedFromHubVersion).toBe(1);
      expect(q?.isPublic).toBe(false);
    });

    it("returns 409 with localQuizId when already cloned same version", async () => {
      await prisma.user.upsert({ where: { id: "user-1" }, update: {}, create: { id: "user-1", email: `clone2-${Date.now()}@t`, name: "U" } });
      const local = await prisma.quiz.create({ data: { title: "x", description: "", authorId: "user-1", clonedFromHubId: "hub-dup", clonedFromHubVersion: 1, clonedFromHubAuthor: "M" } });
      const req = new NextRequest("http://t", { method: "POST", body: JSON.stringify({ hubQuizId: "hub-dup", hubVersion: 1 }), headers: { "Content-Type": "application/json" } });
      const res = await POST(req);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.localQuizId).toBe(local.id);
    });
  });
  ```

- [ ] **15.2 Implement the route**
  ```typescript
  // src/app/api/dashboard/hub/clone/route.ts
  import { NextRequest, NextResponse } from "next/server";
  import { z } from "zod";
  import { auth } from "@/lib/auth/config";
  import { prisma } from "@/lib/db/client";
  import { fetchHubQuizDownload } from "@/lib/hub/hub-client";
  import JSZip from "jszip";
  import { qlzManifestSchema } from "@/lib/validators/qlz";

  const bodySchema = z.object({ hubQuizId: z.string().min(1), hubVersion: z.number().int().min(1) });

  export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const existing = await prisma.quiz.findFirst({
      where: { authorId: session.user.id, clonedFromHubId: parsed.data.hubQuizId },
      orderBy: { createdAt: "desc" },
    });
    if (existing && existing.clonedFromHubVersion === parsed.data.hubVersion) {
      return NextResponse.json({ localQuizId: existing.id, message: "Already cloned" }, { status: 409 });
    }

    const { qlzBase64, hubAuthor, version } = await fetchHubQuizDownload({
      hubQuizId: parsed.data.hubQuizId,
      userId: session.user.id,
    });

    const buf = Buffer.from(qlzBase64, "base64");
    const zip = await JSZip.loadAsync(buf);
    const manifestRaw = JSON.parse(await zip.file("manifest.json")!.async("text"));
    const manifest = qlzManifestSchema.parse(manifestRaw);

    const quiz = await prisma.quiz.create({
      data: {
        title: manifest.quiz.title,
        description: manifest.quiz.description,
        tags: manifest.quiz.tags,
        authorId: session.user.id,
        isPublic: false,
        clonedFromHubId: parsed.data.hubQuizId,
        clonedFromHubVersion: version,
        clonedFromHubAuthor: hubAuthor,
        questions: {
          create: manifest.quiz.questions.map((q: any, i: number) => ({
            type: q.type, text: q.text, timeLimit: q.timeLimit, points: q.points, order: i, options: q.options, mediaUrl: null,
          })),
        },
      },
    });

    return NextResponse.json({ quizId: quiz.id }, { status: 201 });
  }
  ```

  Also add `fetchHubQuizDownload` to `src/lib/hub/hub-client.ts` — uses the existing `fetchWithTokenRefresh` from Plan 3 to attach a clone-scoped bearer:
  ```typescript
  export async function fetchHubQuizDownload({ hubQuizId, userId }: { hubQuizId: string; userId: string }) {
    const url = new URL(`/api/hub/quizzes/${hubQuizId}/download`, process.env.SAVINT_HUB_URL!);
    const res = await fetchWithTokenRefresh(url.toString(), { userId, scope: "clone" });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    return (await res.json()) as { qlzBase64: string; hubQuizId: string; hubAuthor: string; version: number };
  }
  ```

- [ ] **15.3 Run tests**
  ```bash
  pnpm vitest run src/app/api/dashboard/hub/clone
  ```

- [ ] **15.4 Commit**
  ```bash
  git add src/app/api/dashboard/hub/clone src/lib/hub/hub-client.ts
  git commit -m "feat(hub): clone API creates local Quiz with hub attribution; dedup by version"
  ```

---

### Task 16 — Library card "From savint.it" badge

**Files**
- Create: `src/components/hub/from-hub-badge.tsx`
- Modify: `src/components/library/library-client.tsx`
- Modify: `src/app/(dashboard)/dashboard/library/page.tsx` (to include the new fields in the payload)
- Create: `src/components/library/__tests__/from-hub-badge.test.tsx`

**Steps**

- [ ] **16.1 Write component test**
  ```typescript
  // src/components/library/__tests__/from-hub-badge.test.tsx
  import { describe, it, expect } from "vitest";
  import { render } from "@testing-library/react";
  import { NextIntlClientProvider } from "next-intl";
  import en from "@/messages/en.json";
  import { FromHubBadge } from "@/components/hub/from-hub-badge";

  it("renders link with author", () => {
    const { container, getByRole } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <FromHubBadge hubId="abc" author="Maria" />
      </NextIntlClientProvider>
    );
    expect(container.textContent).toContain("Maria");
    expect(getByRole("link").getAttribute("href")).toContain("/q/abc");
  });
  ```

- [ ] **16.2 Implement the badge**
  ```typescript
  // src/components/hub/from-hub-badge.tsx
  "use client";
  import Link from "next/link";
  import { useTranslations } from "next-intl";

  export function FromHubBadge({ hubId, author }: { hubId: string; author: string }) {
    const t = useTranslations("hub");
    const hubBase = process.env.NEXT_PUBLIC_SAVINT_HUB_URL ?? "";
    return (
      <Link href={`${hubBase}/q/${hubId}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full hover:bg-indigo-100">
        {t("fromHub", { author })}
      </Link>
    );
  }
  ```

- [ ] **16.3 Wire into library card**
  In `src/components/library/library-client.tsx`, extend `QuizItem`:
  ```typescript
  interface QuizItem {
    // ... existing fields
    clonedFromHubId: string | null;
    clonedFromHubAuthor: string | null;
  }
  ```
  Then in the card render: insert `{q.clonedFromHubId && q.clonedFromHubAuthor && <FromHubBadge hubId={q.clonedFromHubId} author={q.clonedFromHubAuthor} />}` near tags. Import `FromHubBadge`.

- [ ] **16.4 Update library page query** to include the two columns in the select projection. Confirm by reading the existing query.

- [ ] **16.5 Run tests and commit**
  ```bash
  pnpm vitest run src/components/library src/components/hub
  git add src/components/hub/from-hub-badge.tsx src/components/library/library-client.tsx src/app/\(dashboard\)/dashboard/library/page.tsx src/components/library/__tests__/from-hub-badge.test.tsx
  git commit -m "feat(hub): library card shows From savint.it badge for cloned quizzes"
  ```

---

### Task 17 — Author profile `/u/[hubAccountId]`

**Files**
- Create: `src/app/u/[hubAccountId]/page.tsx`
- Create: `src/app/u/[hubAccountId]/__tests__/page.test.tsx`

**Steps**

- [ ] **17.1 Write failing test**
  ```typescript
  // src/app/u/[hubAccountId]/__tests__/page.test.tsx
  import { describe, it, expect, beforeAll, afterAll } from "vitest";
  import { render } from "@testing-library/react";
  import { NextIntlClientProvider } from "next-intl";
  import en from "@/messages/en.json";
  import { prisma } from "@/lib/db/client";

  describe("/u/:hubAccountId", () => {
    let aid: string;
    beforeAll(async () => {
      const a = await prisma.hubAccount.create({ data: { email: `prof-${Date.now()}@t`, name: "Mara Verdi", affiliation: "Liceo X", authMethod: "PASSWORD", linkedProviders: ["password"] } });
      aid = a.id;
      await prisma.hubQuiz.create({ data: { hubAccountId: aid, title: "Verdi Quiz", description: "d", license: "CC_BY", tags: [], schoolLevel: "PRIMARIA", subject: "math", language: "it", questionCount: 1, estimatedDurationSec: 30, payloadBlob: Buffer.from("x"), payloadHash: "h" } });
    });
    afterAll(async () => { await prisma.hubQuiz.deleteMany({ where: { hubAccountId: aid } }); });

    it("renders name, affiliation, and published quizzes", async () => {
      const Page = (await import("@/app/u/[hubAccountId]/page")).default;
      const ui = await Page({ params: Promise.resolve({ hubAccountId: aid }) });
      const { container } = render(<NextIntlClientProvider locale="en" messages={en}>{ui as any}</NextIntlClientProvider>);
      expect(container.textContent).toContain("Mara Verdi");
      expect(container.textContent).toContain("Liceo X");
      expect(container.textContent).toContain("Verdi Quiz");
    });
  });
  ```

- [ ] **17.2 Implement the page**
  ```typescript
  // src/app/u/[hubAccountId]/page.tsx
  import { notFound } from "next/navigation";
  import Link from "next/link";
  import { prisma } from "@/lib/db/client";

  export const dynamic = "force-dynamic";

  export default async function ProfilePage({ params }: { params: Promise<{ hubAccountId: string }> }) {
    const { hubAccountId } = await params;
    const a = await prisma.hubAccount.findUnique({
      where: { id: hubAccountId },
      include: { quizzes: { where: { suspended: false }, orderBy: { publishedAt: "desc" } } },
    });
    if (!a || a.bannedAt) notFound();

    return (
      <div className="min-h-dvh bg-gradient-to-br from-indigo-50 via-white to-violet-50">
        <div className="max-w-3xl mx-auto px-4 py-12">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900">{a.name}</h1>
            {a.affiliation && <p className="text-slate-600">{a.affiliation}</p>}
          </header>
          <section>
            <h2 className="text-lg font-bold mb-3">Published quizzes ({a.quizzes.length})</h2>
            <ul className="space-y-2">
              {a.quizzes.map((q) => (
                <li key={q.id}>
                  <Link href={`/q/${q.id}`} className="block bg-white rounded-xl border border-slate-200 p-4 hover:border-indigo-300">
                    <p className="font-bold text-slate-900">{q.title}</p>
                    <p className="text-sm text-slate-600 line-clamp-2">{q.description}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    );
  }
  ```

  Note: requires a back-relation `quizzes HubQuiz[]` on `HubAccount` in the schema (Plan 3 introduces `HubAccount` and `HubQuiz`; if the relation isn't already named `quizzes`, adjust the include accordingly).

- [ ] **17.3 Run tests**
  ```bash
  pnpm vitest run src/app/u
  ```

- [ ] **17.4 Commit**
  ```bash
  git add src/app/u
  git commit -m "feat(hub): author profile /u/:hubAccountId"
  ```

---

### Task 18 — Multi-server Playwright E2E

**Files**
- Create: `tests/e2e/hub-browse-clone.spec.ts`
- Modify: `playwright.config.ts` (add two-server setup if not already present)

**Steps**

- [ ] **18.1 Configure two-server Playwright**
  In `playwright.config.ts` ensure `webServer` boots both:
  ```typescript
  webServer: [
    { command: "SAVINT_MODE=hub PORT=4000 pnpm dev", url: "http://localhost:4000/explore", reuseExistingServer: !process.env.CI, timeout: 120_000 },
    { command: "SAVINT_MODE=installation SAVINT_HUB_URL=http://localhost:4000 PORT=3000 pnpm dev", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
  use: { baseURL: "http://localhost:3000" },
  ```

- [ ] **18.2 Write the E2E spec**
  ```typescript
  // tests/e2e/hub-browse-clone.spec.ts
  import { test, expect } from "@playwright/test";

  test("anonymous browse + self-practice on hub", async ({ page }) => {
    await page.goto("http://localhost:4000/explore");
    await expect(page.getByRole("heading", { name: /public quiz repository|repository pubblico/i })).toBeVisible();
    // Open first card and trigger Try now
    const firstCard = page.locator("a[href^='/q/']").first();
    await firstCard.click();
    await page.getByRole("button", { name: /try now|prova ora/i }).click();
    await page.getByRole("button", { name: /start|inizia/i }).click();
    // Answer one question (TRUE_FALSE example)
    await page.getByRole("button").first().click();
    await expect(page.getByText(/correct|wrong|sbagliato|corretto/i)).toBeVisible();
  });

  test("clone from installation creates local quiz with badge", async ({ page }) => {
    // (assumes a test teacher account is seeded and OAuth-linked from Plan 3 fixtures)
    await page.goto("http://localhost:3000/dashboard/hub");
    await page.locator("a[href^='/dashboard/hub/']").first().click();
    await page.getByRole("button", { name: /clone/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/quiz\//);
    await page.goto("http://localhost:3000/dashboard/library");
    await expect(page.getByText(/from savint\.it/i).first()).toBeVisible();
  });
  ```

- [ ] **18.3 Run E2E**
  ```bash
  pnpm playwright test tests/e2e/hub-browse-clone.spec.ts
  ```
  Expect both tests green.

- [ ] **18.4 Commit**
  ```bash
  git add tests/e2e/hub-browse-clone.spec.ts playwright.config.ts
  git commit -m "test(e2e): hub browse, self-practice, and clone-with-badge flow"
  ```

---

## Done criteria

- [ ] All 18 tasks committed.
- [ ] `pnpm vitest run` green.
- [ ] `pnpm playwright test tests/e2e/hub-browse-clone.spec.ts` green.
- [ ] `pnpm prisma migrate status` reports no pending migrations.
- [ ] Server inspection (curl `GET /q/<id>`) confirms the rendered HTML never contains the string `"correct"` for the correct-answer field.
- [ ] Switching `SAVINT_MODE` between `hub` and `installation` toggles the `/explore` UI without code changes.

## Assumptions / dependencies on other plans

- Plan 1 must have shipped: `Quiz.clonedFromHubId`, `clonedFromHubVersion`, `clonedFromHubAuthor`, `subject`, `schoolLevel`, `language`, `ageMin`, `ageMax` columns; `src/lib/quiz-subjects.ts` exporting `SCHOOL_LEVELS` and `SUBJECTS`.
- Plan 2 must have shipped: `getSavintMode()` in `src/lib/config/savint-mode.ts`, hub middleware, `HubAccount` model with `quizzes HubQuiz[]` back-relation.
- Plan 3 must have shipped: `HubQuiz`, `HubQuizVersion`, `Installation`, `HubAccessToken` models; `issueHubAccessToken`, `requireHubAccessToken` helpers in `src/lib/hub/access-token.ts`; `fetchWithTokenRefresh` helper in `src/lib/hub/hub-client.ts`; placeholder `/q/[id]/page.tsx` (this plan replaces it); rate-limit helper `enforceHubRateLimit` from `src/lib/hub/rate-limit.ts` (Plan 5 introduces full rate-limit semantics — for Plan 4 only catalog/practice limits need to be live; a minimal stub is acceptable here).
