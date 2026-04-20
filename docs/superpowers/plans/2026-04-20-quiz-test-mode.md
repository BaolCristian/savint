# Quiz Test Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let teachers play their own quiz solo in a "test mode" to validate it end-to-end, without polluting analytics/stats.

**Architecture:** Add an `isTest` flag to `Session`. Reuse live socket infrastructure. New `/live/test/[sessionId]` route renders `HostView` + `PlayerView` side-by-side; player auto-registers with a fixed name. In test mode, the server auto-advances to reveal phase as soon as the single player answers. Analytics/listing queries filter out `isTest=true`.

**Tech Stack:** Next.js (App Router) + Prisma (PostgreSQL) + Socket.IO + React + TypeScript + Tailwind. Tests: Vitest (unit) + Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-04-20-quiz-test-mode-design.md`

---

## File Structure

**Create:**
- `prisma/migrations/<timestamp>_add_session_is_test/migration.sql`
- `src/app/(live)/live/test/[sessionId]/page.tsx` — server component: auth + ownership check, renders client
- `src/components/live/test-view.tsx` — client: split layout wrapping `HostView` + `PlayerView`, auto-join player
- `src/components/quiz/test-quiz-button.tsx` — client: posts session + redirects to `/live/test/[id]`
- `tests/unit/session-api.test.ts` — unit tests for API POST + listing filter

**Modify:**
- `prisma/schema.prisma` — add `isTest Boolean @default(false)` to `Session`
- `src/app/api/session/route.ts` — accept `isTest` in POST body; filter `isTest:false` in GET
- `src/app/(dashboard)/dashboard/sessions/page.tsx` — filter `isTest:false`
- `src/app/(dashboard)/dashboard/stats/page.tsx` — filter `isTest:false`
- `src/app/(dashboard)/dashboard/stats/students/page.tsx` — filter `isTest:false`
- `src/app/(dashboard)/dashboard/stats/topics/page.tsx` — filter `isTest:false`
- `src/app/(dashboard)/dashboard/quiz/[id]/stats/page.tsx` — filter `isTest:false`
- `src/app/api/stats/export/route.ts` — filter `isTest:false`
- `src/app/(dashboard)/dashboard/page.tsx` — filter `isTest:false`
- `src/lib/socket/server.ts` — load `isTest` into `GameState`; in `submitAnswer`, if `isTest`, trigger reveal logic automatically
- `src/components/quiz/quiz-editor.tsx` (or wherever `StartSessionButton` is rendered) — add `TestQuizButton`
- `src/app/(dashboard)/dashboard/quiz/[id]/page.tsx` — add `TestQuizButton`
- `src/components/library/...` — add "Prova" action to quiz card (to be located during Task 10)

---

## Task 1: Add `isTest` column to `Session`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: Prisma migration via CLI

- [ ] **Step 1: Edit schema**

In `prisma/schema.prisma`, update `model Session`:

```prisma
model Session {
  id        String        @id @default(cuid())
  quizId    String
  hostId    String
  pin       String        @unique
  status    SessionStatus @default(LOBBY)
  isTest    Boolean       @default(false)
  startedAt DateTime?
  endedAt   DateTime?
  createdAt DateTime      @default(now())

  quiz    Quiz     @relation(fields: [quizId], references: [id])
  host    User     @relation(fields: [hostId], references: [id])
  answers Answer[]
}
```

- [ ] **Step 2: Generate migration**

Run: `npx prisma migrate dev --name add_session_is_test`
Expected: migration file created under `prisma/migrations/`, DB updated, client regenerated.

- [ ] **Step 3: Verify**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add Session.isTest flag for quiz preview mode"
```

---

## Task 2: Accept `isTest` in `POST /api/session`

**Files:**
- Modify: `src/app/api/session/route.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/session-api.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    session: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: any) => ({ id: "s1", ...data })),
      findMany: vi.fn(),
    },
    quiz: {
      findUnique: vi.fn().mockResolvedValue({
        id: "q1",
        authorId: "u1",
        isPublic: false,
        suspended: false,
      }),
    },
  },
}));

vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1" } }),
}));

import { POST, GET } from "@/app/api/session/route";
import { prisma } from "@/lib/db/client";

function req(body: any) {
  return new Request("http://x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("POST /api/session", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a normal session with isTest=false by default", async () => {
    const res = await POST(req({ quizId: "q1" }));
    expect(res.status).toBe(201);
    const createCall = (prisma.session.create as any).mock.calls[0][0];
    expect(createCall.data.isTest).toBe(false);
  });

  it("creates a test session when isTest=true", async () => {
    const res = await POST(req({ quizId: "q1", isTest: true }));
    expect(res.status).toBe(201);
    const createCall = (prisma.session.create as any).mock.calls[0][0];
    expect(createCall.data.isTest).toBe(true);
  });
});

describe("GET /api/session", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters out isTest sessions from listing", async () => {
    (prisma.session.findMany as any).mockResolvedValue([]);
    await GET();
    const whereArg = (prisma.session.findMany as any).mock.calls[0][0].where;
    expect(whereArg.isTest).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

Run: `npx vitest run tests/unit/session-api.test.ts`
Expected: the two "isTest" assertions fail.

- [ ] **Step 3: Update `POST` + `GET` in `src/app/api/session/route.ts`**

Replace the `POST` body-parse + create block:

```ts
const { quizId, isTest } = await req.json();
if (!quizId) return NextResponse.json({ error: "quizId required" }, { status: 400 });
```

And the `create` call:

```ts
const gameSession = await prisma.session.create({
  data: {
    quizId,
    hostId: session.user.id,
    pin,
    isTest: isTest === true,
  },
});
```

In `GET`:

```ts
const sessions = await prisma.session.findMany({
  where: { hostId: session.user.id, isTest: false },
  include: {
    quiz: { select: { title: true } },
    _count: { select: { answers: true } },
  },
  orderBy: { createdAt: "desc" },
});
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run tests/unit/session-api.test.ts`
Expected: all three pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/session/route.ts tests/unit/session-api.test.ts
git commit -m "feat(api): accept isTest flag on session create; hide from listing"
```

---

## Task 3: Filter `isTest=false` in dashboard + stats queries

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`
- Modify: `src/app/(dashboard)/dashboard/sessions/page.tsx`
- Modify: `src/app/(dashboard)/dashboard/stats/page.tsx`
- Modify: `src/app/(dashboard)/dashboard/stats/students/page.tsx`
- Modify: `src/app/(dashboard)/dashboard/stats/topics/page.tsx`
- Modify: `src/app/(dashboard)/dashboard/quiz/[id]/stats/page.tsx`
- Modify: `src/app/api/stats/export/route.ts`

- [ ] **Step 1: Update each query to include `isTest: false`**

For every occurrence of a Prisma session query used for listing/stats, add `isTest: false` to the `where` clause, and for nested `session:` filters used on `Answer`, add `session: { isTest: false, ... }`.

Concretely:

`src/app/(dashboard)/dashboard/page.tsx`:
- `prisma.session.count({ where: { hostId: userId } })` → `{ where: { hostId: userId, isTest: false } }`
- `where: { session: { hostId: userId } }` (2 occurrences) → `where: { session: { hostId: userId, isTest: false } }`
- `prisma.session.findMany({ where: { hostId: userId }, ... })` → `{ where: { hostId: userId, isTest: false }, ... }`

`src/app/(dashboard)/dashboard/sessions/page.tsx`:
- `where: { hostId: session!.user!.id }` → `where: { hostId: session!.user!.id, isTest: false }`

`src/app/(dashboard)/dashboard/stats/page.tsx`:
- `where: { hostId: userId, status: "FINISHED" }` → `where: { hostId: userId, status: "FINISHED", isTest: false }`
- `where: { session: { hostId: userId } }` → `where: { session: { hostId: userId, isTest: false } }`

`src/app/(dashboard)/dashboard/stats/students/page.tsx`:
- `where: { hostId: userId, status: "FINISHED" }` → add `isTest: false`

`src/app/(dashboard)/dashboard/stats/topics/page.tsx`:
- In any `where: { session: { hostId: ... } }` or `where: { hostId: ... }` → add `isTest: false` appropriately. Read the file and apply the same pattern.

`src/app/(dashboard)/dashboard/quiz/[id]/stats/page.tsx`:
- Same treatment for all session/answer queries.

`src/app/api/stats/export/route.ts`:
- Same treatment.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\) src/app/api/stats
git commit -m "feat(stats): exclude isTest sessions from dashboard and analytics"
```

---

## Task 4: Load `isTest` into socket `GameState`

**Files:**
- Modify: `src/lib/socket/server.ts`

- [ ] **Step 1: Extend GameState type**

In `src/lib/socket/server.ts`, find the `GameState` type/interface (near the top of the file) and add:

```ts
isTest: boolean;
```

- [ ] **Step 2: Populate from DB on load**

Find the block near line 291 where `prisma.session.findUnique` loads the session to bootstrap a room. Include `isTest` in the `select` (or remove select / include all fields) and assign it when constructing `GameState`:

```ts
const session = await prisma.session.findUnique({
  where: { id: sessionId },
  select: {
    id: true,
    quizId: true,
    hostId: true,
    status: true,
    isTest: true,
    quiz: { /* existing */ },
  },
});
```

And wherever `GameState` is constructed, set `isTest: session.isTest`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/socket/server.ts
git commit -m "feat(socket): expose isTest on in-memory game state"
```

---

## Task 5: Auto-advance in `submitAnswer` when `isTest=true`

**Files:**
- Modify: `src/lib/socket/server.ts`

- [ ] **Step 1: Extract reveal logic into a helper**

Inside `src/lib/socket/server.ts`, extract the body of the `showResults` socket handler (lines ~665–749) into a module-level function:

```ts
async function runShowResults(io: TypedIO, game: GameState) {
  if (game.currentQuestionIndex < 0) return;
  const question = game.questions[game.currentQuestionIndex];
  if (!question) return;

  try {
    const dbAnswers = await prisma.answer.findMany({
      where: { sessionId: game.sessionId, questionId: question.id },
      select: { value: true, isCorrect: true },
    });

    const distribution = buildDistribution(
      question.type,
      dbAnswers.map((a) => ({ value: a.value, isCorrect: a.isCorrect })),
      question.options
    );

    const leaderboard = buildLeaderboard(game);

    io.to(room(game.sessionId)).emit("questionResult", {
      correctAnswer: question.options,
      distribution,
      leaderboard: leaderboard.slice(0, 10),
    });

    const allSessionAnswers = await prisma.answer.findMany({
      where: { sessionId: game.sessionId },
      select: { playerName: true, questionId: true, isCorrect: true, responseTimeMs: true },
      orderBy: { createdAt: "asc" },
    });

    const totalPlayers = realPlayerCount(game);

    for (const [playerName, player] of game.players) {
      if (playerName === "__host__") continue;
      const playerAnswers = allSessionAnswers.filter((a) => a.playerName === playerName);
      const currentAnswer = playerAnswers.find((a) => a.questionId === question.id);
      const position = leaderboard.findIndex((l) => l.playerName === playerName) + 1;
      const correctCount = playerAnswers.filter((a) => a.isCorrect).length;
      const totalAnswered = playerAnswers.length;
      let streak = 0;
      for (let i = playerAnswers.length - 1; i >= 0; i--) {
        if (playerAnswers[i].isCorrect) streak++;
        else break;
      }
      const playerSocket = io.sockets.sockets.get(player.socketId);
      if (playerSocket) {
        playerSocket.emit("playerStats", {
          position,
          totalPlayers,
          responseTimeMs: currentAnswer?.responseTimeMs ?? 0,
          correctCount,
          totalAnswered,
          streak,
        });
      }
    }
  } catch (err) {
    console.error("runShowResults error:", err);
  }
}
```

Replace the body of `socket.on("showResults", …)` with `await runShowResults(io, game);`.

- [ ] **Step 2: Trigger reveal after single-player answer in test mode**

At the end of the `submitAnswer` handler (after `emit("answerCount", …)`), append:

```ts
if (game.isTest) {
  await runShowResults(io, game);
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/socket/server.ts
git commit -m "feat(socket): auto-reveal after answer in test mode"
```

---

## Task 6: Test-mode page server component

**Files:**
- Create: `src/app/(live)/live/test/[sessionId]/page.tsx`

- [ ] **Step 1: Create route**

```tsx
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { TestView } from "@/components/live/test-view";

type Props = { params: Promise<{ sessionId: string }> };

export default async function TestSessionPage({ params }: Props) {
  const { sessionId } = await params;
  const authSession = await auth();
  if (!authSession?.user?.id) redirect("/");

  const gameSession = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { quiz: { select: { title: true } } },
  });

  if (!gameSession) notFound();
  if (gameSession.hostId !== authSession.user.id) notFound();
  if (!gameSession.isTest) notFound();

  return (
    <TestView
      sessionId={gameSession.id}
      pin={gameSession.pin}
      quizTitle={gameSession.quiz.title}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(live\)/live/test
git commit -m "feat(live): add /live/test/[sessionId] route"
```

---

## Task 7: Split-view client component

**Files:**
- Create: `src/components/live/test-view.tsx`

- [ ] **Step 1: Create component**

```tsx
"use client";

import { HostView } from "@/components/live/host-view";
import { PlayerView } from "@/components/live/player-view";

type Props = {
  sessionId: string;
  pin: string;
  quizTitle: string;
};

const TEST_PLAYER_NAME = "Docente (test)";

export function TestView({ sessionId, pin, quizTitle }: Props) {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 text-sm text-amber-900 text-center">
        Modalità test — i risultati non verranno salvati nelle statistiche
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x">
        <section className="overflow-auto" aria-label="Host panel">
          <HostView sessionId={sessionId} pin={pin} quizTitle={quizTitle} />
        </section>
        <section className="overflow-auto" aria-label="Player panel">
          <PlayerView
            testMode
            testPin={pin}
            testPlayerName={TEST_PLAYER_NAME}
          />
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add test-mode props to `PlayerView`**

Open `src/components/live/player-view.tsx`. Find the component props/signature and add optional props:

```ts
type PlayerViewProps = {
  // ...existing props...
  testMode?: boolean;
  testPin?: string;
  testPlayerName?: string;
};
```

Find the auto-join / form logic. When `testMode === true`, skip the pin/name input form and emit `joinSession` automatically on mount with `{ pin: testPin, playerName: testPlayerName }` (no avatar). Concretely, wrap the existing initial-form render in `if (!testMode) { … }` and add a `useEffect` that runs once emitting `socket.emit("joinSession", { pin: testPin!, playerName: testPlayerName! })` when `testMode` is true and not yet joined.

Check existing join logic around line 389 to mirror the shape.

- [ ] **Step 3: Verify `HostView` props match usage**

Open `src/components/live/host-view.tsx` and confirm the component accepts `sessionId`, `pin`, `quizTitle`. Adjust the `<HostView …/>` call in `test-view.tsx` to match the actual prop names if different.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`
In the browser, temporarily create a test session via the devtools console:
```js
fetch("/api/session", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({quizId:"<id>",isTest:true})}).then(r=>r.json()).then(s=>location.href=`/live/test/${s.id}`)
```
Expected: page loads with banner + two panels; player side auto-registered.

- [ ] **Step 6: Commit**

```bash
git add src/components/live/test-view.tsx src/components/live/player-view.tsx
git commit -m "feat(live): split host+player test view with auto-registered player"
```

---

## Task 8: `TestQuizButton` component

**Files:**
- Create: `src/components/quiz/test-quiz-button.tsx`

- [ ] **Step 1: Create component**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";
import { FlaskConical } from "lucide-react";

export function TestQuizButton({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleTest() {
    setLoading(true);
    try {
      const res = await fetch(withBasePath("/api/session"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, isTest: true }),
      });
      if (!res.ok) throw new Error("Failed to start test session");
      const session = await res.json();
      router.push(`/live/test/${session.id}`);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }

  return (
    <Button
      onClick={handleTest}
      disabled={loading}
      variant="outline"
      size="sm"
      title="Gioca da solo per verificare il quiz"
    >
      <FlaskConical className="w-4 h-4 mr-1" />
      {loading ? "Avvio..." : "Prova"}
    </Button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/quiz/test-quiz-button.tsx
git commit -m "feat(quiz): add TestQuizButton"
```

---

## Task 9: Wire `TestQuizButton` in the editor + quiz page

**Files:**
- Modify: `src/components/quiz/quiz-editor.tsx`
- Modify: `src/app/(dashboard)/dashboard/quiz/[id]/page.tsx`

- [ ] **Step 1: Add to quiz editor**

Open `src/components/quiz/quiz-editor.tsx`. Find where `StartSessionButton` (or `play-button`/`start-session-button`) is rendered. Import and render the new button next to it:

```tsx
import { TestQuizButton } from "@/components/quiz/test-quiz-button";
// ...
<TestQuizButton quizId={quiz.id} />
<StartSessionButton quizId={quiz.id} />
```

- [ ] **Step 2: Add to quiz detail page**

Open `src/app/(dashboard)/dashboard/quiz/[id]/page.tsx`. Locate where `StartSessionButton` is rendered and add `<TestQuizButton quizId={...} />` next to it (same pattern).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/quiz/quiz-editor.tsx src/app/\(dashboard\)/dashboard/quiz
git commit -m "feat(quiz): expose Prova button in editor and quiz page"
```

---

## Task 10: Wire `TestQuizButton` into library quiz card

**Files:**
- Modify: quiz card in `src/components/library/` (locate exact file)

- [ ] **Step 1: Locate the card**

Run: `grep -rn "StartSessionButton\|PlayButton" src/components/library src/app/\(dashboard\)/dashboard/library`
Pick the component that renders per-quiz actions on the library list.

- [ ] **Step 2: Add TestQuizButton**

Import `TestQuizButton` and render it next to the existing play/start action (a dropdown menu item "Prova" is also acceptable — follow the existing UI pattern of the card).

- [ ] **Step 3: Typecheck + manual smoke**

Run: `npx tsc --noEmit && npm run dev`
In the library, click "Prova" on one of the quizzes. Expected: redirects to `/live/test/[id]` and both panels render.

- [ ] **Step 4: Commit**

```bash
git add src/components/library src/app/\(dashboard\)/dashboard/library
git commit -m "feat(library): add Prova action to quiz card"
```

---

## Task 11: E2E test for test mode

**Files:**
- Create: `tests/e2e/quiz-test-mode.spec.ts`

- [ ] **Step 1: Write test**

```ts
import { test, expect } from "@playwright/test";

// Assumes a logged-in teacher fixture exists similarly to app.spec.ts.
// Adjust imports/fixtures to match the project's existing auth setup.

test.describe("Quiz test mode", () => {
  test("teacher can play their quiz solo with auto-advance and final stats", async ({ page }) => {
    // 1. Login + navigate to a quiz detail page (reuse helpers from app.spec.ts)
    // ...login fixture...
    await page.goto("/dashboard/quiz/<SEED_QUIZ_ID>");

    // 2. Click "Prova"
    await page.getByRole("button", { name: /Prova/i }).click();

    // 3. Expect test-mode banner
    await expect(
      page.getByText(/Modalità test/)
    ).toBeVisible();

    // 4. Start game from host panel
    await page.getByRole("button", { name: /Avvia|Start/i }).click();

    // 5. Submit one answer in the player panel (assuming multiple choice)
    const playerPanel = page.getByRole("region", { name: /Player panel/i });
    await playerPanel.getByRole("button").first().click();

    // 6. Expect reveal to appear without explicit host click (auto-advance)
    await expect(playerPanel.getByText(/Corretto|Sbagliato/i)).toBeVisible({
      timeout: 5000,
    });

    // 7. Walk through remaining questions by clicking next on host + answering player
    // ...loop...

    // 8. Verify final stats for the "Docente (test)" player
    await expect(playerPanel.getByText(/Punteggio|Totale/i)).toBeVisible();

    // 9. Verify the test session does NOT appear in /dashboard/sessions
    await page.goto("/dashboard/sessions");
    await expect(page.getByText("Docente (test)")).toHaveCount(0);
  });
});
```

Adapt fixture/login mechanics to match `tests/e2e/app.spec.ts` patterns.

- [ ] **Step 2: Run test**

Run: `npx playwright test tests/e2e/quiz-test-mode.spec.ts`
Expected: passes. If the existing e2e suite needs a quiz fixture, add one via `prisma/seed.ts` or a `beforeAll` hook.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/quiz-test-mode.spec.ts
git commit -m "test(e2e): cover quiz test mode end to end"
```

---

## Task 12: Final verification

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Full unit suite**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 3: Full e2e suite**

Run: `npx playwright test`
Expected: all green.

- [ ] **Step 4: Manual acceptance**

With `npm run dev`:
1. From quiz editor: click "Prova" → redirects to split view.
2. Play through: timer ticks, submitting answer auto-reveals.
3. Final screen shows personal stats for "Docente (test)".
4. `/dashboard/sessions` does NOT list the test session.
5. `/dashboard/stats` does NOT include test answers.

- [ ] **Step 5: No extra commit needed if suites were already green.**
