# Kick Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the teacher (host) remove a connected player from a live session both in the lobby and between questions, with a session-scoped nickname block preventing re-entry under the same name.

**Architecture:** New socket event `kickPlayer` (host-only, gated by an explicit `phase` field on `GameState`) plus a dedicated `kicked` server→client event for the removed player. `GameState.kickedNames` (in-memory `Set<string>`) blocks rejoin attempts with the kicked nickname. Host UI adds a circular X on each player card that opens a confirmation dialog; player UI gains a terminal "kicked" screen.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Socket.io 4, Tailwind CSS 4, shadcn/ui (Dialog), next-intl, Vitest, Playwright.

**Reference spec:** `docs/superpowers/specs/2026-04-22-lobby-kick-player-design.md`

---

## File Structure

**Modify:**
- `src/types/index.ts` — add `kickPlayer` to `ClientToServerEvents` and `kicked` to `ServerToClientEvents`.
- `src/lib/socket/server.ts` — add `kickedNames` + `phase` to `GameState`; add `kickPlayer` handler; transition `phase` in `startGame`/`emitQuestion`/`runShowResults`/`endGame`; reject join when nickname is kicked.
- `src/components/live/host-view.tsx` — X button on each player card, confirmation `Dialog`, error banner for kick-during-question.
- `src/components/live/player-view.tsx` — `kicked` phase + terminal screen + `onKicked` listener.
- `src/app/(live)/play/page.tsx` — map `nicknameKicked` error message to i18n string in the join form.
- `src/messages/it.json` and `src/messages/en.json` — new i18n keys (see Task 7).

**Create:**
- `tests/unit/socket/kick-player.test.ts` — unit coverage of the server handler and the join-reject logic.
- `tests/e2e/kick-player.spec.ts` — end-to-end Playwright scenarios.

Each task below is self-contained, TDD-oriented (where applicable), and ends in a commit.

---

## Task 1: Extend socket types with `kickPlayer` and `kicked`

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `kicked` to `ServerToClientEvents`**

In `src/types/index.ts`, inside the `ServerToClientEvents` interface (after `muteChanged`, before the closing `}`), add:

```ts
  kicked: (data: { reason: "host" }) => void;
```

- [ ] **Step 2: Add `kickPlayer` to `ClientToServerEvents`**

In the same file, inside `ClientToServerEvents` (after `toggleMute`), add:

```ts
  kickPlayer: (data: { playerName: string }) => void;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors (there may be pre-existing errors unrelated to this change; compare before/after).

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add kickPlayer and kicked socket events"
```

---

## Task 2: Add `kickedNames` and `phase` to `GameState`

**Files:**
- Modify: `src/lib/socket/server.ts`

- [ ] **Step 1: Extend the `GameState` interface**

In `src/lib/socket/server.ts`, find the `interface GameState { ... }` block (around line 32) and add two fields before the closing brace:

```ts
  kickedNames: Set<string>;
  phase: "lobby" | "in-question" | "between-questions" | "ended";
```

- [ ] **Step 2: Initialize the new fields when a `GameState` is created**

In the `joinSession` handler, locate the `games.set(sessionId, { ... })` call (around line 313). Add inside the object literal, next to `isTest: session.isTest`:

```ts
            kickedNames: new Set<string>(),
            phase: "lobby",
```

- [ ] **Step 3: Transition `phase` to `"in-question"` in `emitQuestion`**

In `emitQuestion` (around line 1009), after `game.questionStartTime = Date.now();`, add:

```ts
  game.phase = "in-question";
```

- [ ] **Step 4: Transition `phase` to `"between-questions"` at the end of `runShowResults`**

In `runShowResults` (around line 946), at the very end of the `try` block (after the `for (const [playerName, player] of game.players)` loop, before the closing `}` of the `try`), add:

```ts
    game.phase = "between-questions";
```

- [ ] **Step 5: Transition `phase` to `"ended"` in `endGame`**

In the `endGame` handler (around line 682), inside the `try` block, after `io.to(room(game.sessionId)).emit("gameOver", ...)` and before `games.delete(game.sessionId)`, add:

```ts
        game.phase = "ended";
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/socket/server.ts
git commit -m "feat(socket): add phase and kickedNames fields to GameState"
```

---

## Task 3: Reject join when nickname is in `kickedNames`

**Files:**
- Modify: `src/lib/socket/server.ts`
- Test: `tests/unit/socket/kick-player.test.ts` (new file, created in this task)

This task is pure TDD: we write the rejection test first, see it fail, then wire the check.

- [ ] **Step 1: Create the unit test file with the first failing test**

Create `tests/unit/socket/kick-player.test.ts` with the following content. The tests exercise the handler logic by importing internal helpers and mocking Socket.io interactions with a minimal fake. Because `src/lib/socket/server.ts` does not currently export its internals, we drive behavior through the `setupSocketHandlers` function plus a fake `io`/`socket` pair.

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    answer: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { setupSocketHandlers } from "@/lib/socket/server";
import { prisma } from "@/lib/db/client";

// Minimal fakes mimicking socket.io's API surface used by the server.
class FakeSocket extends EventEmitter {
  id: string;
  rooms = new Set<string>();
  emitted: { event: string; payload: any }[] = [];
  constructor(id: string) {
    super();
    this.id = id;
    this.setMaxListeners(50);
  }
  emit(event: string, ...args: any[]) {
    // Intercept outbound emits to the client; pass-through listener events.
    if (isServerClientEvent(event)) {
      this.emitted.push({ event, payload: args[0] });
      return true;
    }
    return super.emit(event, ...args);
  }
  join(room: string) { this.rooms.add(room); }
  leave(room: string) { this.rooms.delete(room); }
}

function isServerClientEvent(event: string) {
  return [
    "playerJoined", "playerLeft", "playerReconnected", "rejoinSuccess",
    "questionStart", "answerCount", "confidenceCount", "questionResult",
    "answerFeedback", "playerStats", "gameOver", "sessionError",
    "gameState", "muteChanged", "kicked",
  ].includes(event);
}

class FakeIO {
  sockets = { sockets: new Map<string, FakeSocket>() };
  private roomEmits: { room: string; event: string; payload: any }[] = [];
  to(room: string) {
    const self = this;
    return {
      emit(event: string, payload: any) {
        self.roomEmits.push({ room, event, payload });
      },
    };
  }
  getRoomEmits() { return this.roomEmits; }
  on(_event: string, _fn: any) { /* noop */ }
}

function makeSession(overrides: Partial<any> = {}) {
  return {
    id: "sess-1",
    pin: "123456",
    status: "WAITING",
    isTest: false,
    quiz: { questions: [] },
    ...overrides,
  };
}

async function joinAs(io: FakeIO, socket: FakeSocket, playerName: string) {
  // The handler reads session from the DB by pin.
  (prisma.session.findUnique as any).mockResolvedValue(makeSession());
  await new Promise<void>((resolve) => {
    socket.emit("joinSession", { pin: "123456", playerName });
    setImmediate(resolve);
  });
}

describe("kickPlayer / join rejection", () => {
  let io: FakeIO;
  let hostSocket: FakeSocket;
  let playerSocket: FakeSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    io = new FakeIO();
    hostSocket = new FakeSocket("host-1");
    playerSocket = new FakeSocket("player-1");
    io.sockets.sockets.set(hostSocket.id, hostSocket);
    io.sockets.sockets.set(playerSocket.id, playerSocket);
    // Wire handlers onto both sockets.
    const fakeIoShim: any = io;
    // setupSocketHandlers expects io.on("connection", fn); simulate by calling fn with each socket.
    const onConnection: any[] = [];
    fakeIoShim.on = (_event: string, fn: any) => { onConnection.push(fn); };
    setupSocketHandlers(fakeIoShim);
    for (const fn of onConnection) { fn(hostSocket); fn(playerSocket); }
  });

  it("rejects a join when the nickname is present in kickedNames", async () => {
    // 1) Host and player join the session.
    await joinAs(io, hostSocket, "__host__");
    await joinAs(io, playerSocket, "Alice");

    // 2) Host kicks Alice.
    hostSocket.emit("kickPlayer", { playerName: "Alice" });

    // 3) A new socket attempting to join as Alice should receive a sessionError.
    const retrySocket = new FakeSocket("player-2");
    io.sockets.sockets.set(retrySocket.id, retrySocket);
    // Re-wire handlers for the new socket:
    (io as any).on("connection", (fn: any) => fn(retrySocket));
    await joinAs(io, retrySocket, "Alice");

    const err = retrySocket.emitted.find((e) => e.event === "sessionError");
    expect(err?.payload.message).toBe("nicknameKicked");
  });
});
```

Note: this test will initially fail because `kickPlayer` handler does not exist yet. That is expected — we wire it in Task 4. For now, we focus only on the join rejection branch, which we add next.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm run test:run -- tests/unit/socket/kick-player.test.ts`
Expected: FAIL. The specific failure may be "no `sessionError` with `nicknameKicked`" or a crash because `kickPlayer` is not handled. Either is acceptable for TDD red.

- [ ] **Step 3: Add the kicked-nickname check in `joinSession`**

In `src/lib/socket/server.ts`, inside the `joinSession` handler, find the existing duplicate-name check that emits `"Name already taken"` (around line 342). Directly after the block `if (!games.has(sessionId)) { games.set(...) }` and the `const game = games.get(sessionId)!;` line (around line 334), but **before** the duplicate-name check, insert:

```ts
        if (playerName !== "__host__" && game.kickedNames.has(playerName)) {
          socket.emit("sessionError", { message: "nicknameKicked" });
          return;
        }
```

- [ ] **Step 4: (Still no kickPlayer handler) — verify the test still fails on the missing handler**

Run: `npm run test:run -- tests/unit/socket/kick-player.test.ts`
Expected: still FAIL, because `hostSocket.emit("kickPlayer", ...)` is a no-op (no handler wired yet). We will wire the handler in Task 4 and the test will then pass.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/socket/kick-player.test.ts src/lib/socket/server.ts
git commit -m "feat(socket): reject join for nicknames in kickedNames"
```

---

## Task 4: Implement `kickPlayer` server handler

**Files:**
- Modify: `src/lib/socket/server.ts`
- Test: `tests/unit/socket/kick-player.test.ts`

- [ ] **Step 1: Add more tests to `tests/unit/socket/kick-player.test.ts`**

Append inside the same `describe(...)` block, after the existing `it(...)`:

```ts
  it("emits `kicked` to the target socket and `playerLeft` to the room in lobby phase", async () => {
    await joinAs(io, hostSocket, "__host__");
    await joinAs(io, playerSocket, "Alice");

    hostSocket.emit("kickPlayer", { playerName: "Alice" });
    await new Promise((r) => setImmediate(r));

    const kickedEmit = playerSocket.emitted.find((e) => e.event === "kicked");
    expect(kickedEmit?.payload).toEqual({ reason: "host" });

    const playerLeft = io.getRoomEmits().find(
      (e) => e.event === "playerLeft" && e.payload.playerName === "Alice"
    );
    expect(playerLeft).toBeDefined();
  });

  it("ignores kickPlayer when the caller is not __host__", async () => {
    await joinAs(io, hostSocket, "__host__");
    await joinAs(io, playerSocket, "Alice");
    const impostor = new FakeSocket("impostor-1");
    io.sockets.sockets.set(impostor.id, impostor);
    (io as any).on("connection", (fn: any) => fn(impostor));
    await joinAs(io, impostor, "Bob");

    impostor.emit("kickPlayer", { playerName: "Alice" });
    await new Promise((r) => setImmediate(r));

    // Alice should still be in the game — no `kicked` event delivered.
    expect(playerSocket.emitted.find((e) => e.event === "kicked")).toBeUndefined();
  });

  it("ignores kickPlayer when targeting __host__", async () => {
    await joinAs(io, hostSocket, "__host__");
    hostSocket.emit("kickPlayer", { playerName: "__host__" });
    await new Promise((r) => setImmediate(r));
    // No crash, no side effect on the host socket.
    expect(hostSocket.emitted.find((e) => e.event === "kicked")).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run -- tests/unit/socket/kick-player.test.ts`
Expected: the three new tests FAIL (handler missing). The earlier nickname-reject test still FAILs because the kick hasn't happened.

- [ ] **Step 3: Add the `kickPlayer` handler in `src/lib/socket/server.ts`**

Insert this handler in the `setupSocketHandlers` connection block, placed just before the existing `leaveSession` handler (around line 851, under the comment delimiter):

```ts
    // ------------------------------------------------------------------
    // kickPlayer (host only) — remove a player in lobby or between questions
    // ------------------------------------------------------------------
    socket.on("kickPlayer", ({ playerName }) => {
      if (!currentSessionId || currentPlayerName !== "__host__") return;
      if (playerName === "__host__") return;

      const game = games.get(currentSessionId);
      if (!game) return;

      if (game.phase === "in-question") {
        socket.emit("sessionError", { message: "kickDuringQuestion" });
        return;
      }

      const target = game.players.get(playerName);
      if (!target) return;

      game.kickedNames.add(playerName);
      game.players.delete(playerName);

      const dKey = disconnectKey(currentSessionId, playerName);
      const dEntry = disconnectedPlayers.get(dKey);
      if (dEntry) {
        clearTimeout(dEntry.timeout);
        disconnectedPlayers.delete(dKey);
      }

      if (target.socketId) {
        const targetSocket = io.sockets.sockets.get(target.socketId);
        targetSocket?.emit("kicked", { reason: "host" });
        targetSocket?.leave(room(currentSessionId));
      }

      io.to(room(currentSessionId)).emit("playerLeft", {
        playerName,
        playerCount: realPlayerCount(game),
      });
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run -- tests/unit/socket/kick-player.test.ts`
Expected: all four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/socket/kick-player.test.ts src/lib/socket/server.ts
git commit -m "feat(socket): add kickPlayer handler with phase gate"
```

---

## Task 5: Unit-test the phase gate and grace-period cleanup

**Files:**
- Modify: `tests/unit/socket/kick-player.test.ts`

- [ ] **Step 1: Add tests for the in-question gate**

Append inside the same `describe(...)` block:

```ts
  it("rejects kickPlayer during an active question", async () => {
    (prisma.session.findUnique as any).mockResolvedValue(makeSession({
      status: "IN_PROGRESS",
      quiz: { questions: [{ id: "q1", text: "Q", type: "MULTIPLE_CHOICE", options: { choices: [{ text: "a", isCorrect: true }] }, timeLimit: 10, points: 100, mediaUrl: null, order: 0 }] },
    }));

    await joinAs(io, hostSocket, "__host__");
    await joinAs(io, playerSocket, "Alice");

    // Simulate entering in-question phase by firing startGame then nextQuestion.
    (prisma.session.update as any).mockResolvedValue({});
    hostSocket.emit("startGame");
    await new Promise((r) => setImmediate(r));

    hostSocket.emit("kickPlayer", { playerName: "Alice" });
    await new Promise((r) => setImmediate(r));

    // Host receives sessionError with the "kickDuringQuestion" key.
    const err = hostSocket.emitted.find(
      (e) => e.event === "sessionError" && e.payload.message === "kickDuringQuestion"
    );
    expect(err).toBeDefined();

    // Alice was NOT removed.
    expect(playerSocket.emitted.find((e) => e.event === "kicked")).toBeUndefined();
  });

  it("cancels a pending disconnect timer when kicking a disconnected player", async () => {
    vi.useFakeTimers();
    try {
      await joinAs(io, hostSocket, "__host__");
      await joinAs(io, playerSocket, "Alice");

      // Simulate Alice disconnecting (fires the grace-period timer).
      playerSocket.emit("disconnect");
      await new Promise((r) => setImmediate(r));

      // Now host kicks Alice while the timer is pending.
      hostSocket.emit("kickPlayer", { playerName: "Alice" });
      await new Promise((r) => setImmediate(r));

      // Fast-forward past the grace period; Alice should NOT be re-emitted as leaving.
      vi.advanceTimersByTime(15 * 60 * 1000);
      const playerLeftEmits = io.getRoomEmits().filter(
        (e) => e.event === "playerLeft" && e.payload.playerName === "Alice"
      );
      // Exactly one playerLeft — from the kick, not a duplicate from the timer.
      expect(playerLeftEmits.length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm run test:run -- tests/unit/socket/kick-player.test.ts`
Expected: all tests PASS (the handler already implements both branches).

- [ ] **Step 3: Commit**

```bash
git add tests/unit/socket/kick-player.test.ts
git commit -m "test(socket): cover kickPlayer phase gate and disconnect cleanup"
```

---

## Task 6: Host UI — X button and confirmation dialog

**Files:**
- Modify: `src/components/live/host-view.tsx`

- [ ] **Step 1: Add imports and local state**

Near the top of `src/components/live/host-view.tsx`, ensure `X` and `AlertCircle` are imported from `lucide-react`. Find the existing lucide-react import and add `X, AlertCircle` to its import list if absent. Also ensure these imports exist (add missing ones at the top of the file with the other imports):

```ts
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
```

Inside the component body, near the other `useState` hooks (around the `phase` state at line 203), add:

```tsx
  const [kickTarget, setKickTarget] = useState<string | null>(null);
  const [kickError, setKickError] = useState<string | null>(null);
```

- [ ] **Step 2: Wire the `sessionError` listener for `kickDuringQuestion`**

Find the `useEffect` block that subscribes to socket events (search for `socket.on(`). Inside it, add:

```tsx
    const onSessionError = (data: { message: string }) => {
      if (data.message === "kickDuringQuestion") {
        setKickError("kickDuringQuestion");
        // auto-dismiss after 4s
        setTimeout(() => setKickError(null), 4000);
      }
    };
    socket.on("sessionError", onSessionError);
```

And in the cleanup:

```tsx
      socket.off("sessionError", onSessionError);
```

- [ ] **Step 3: Add the kick handler**

In the same component body, near `handleEndGame` (around line 375), add:

```tsx
  const handleConfirmKick = useCallback(() => {
    if (!kickTarget) return;
    socket?.emit("kickPlayer", { playerName: kickTarget });
    setKickTarget(null);
  }, [socket, kickTarget]);
```

- [ ] **Step 4: Render the X button on each player card**

In the player-grid rendering block (around line 501-512), replace the existing card markup:

```tsx
                  {players.map((player, i) => (
                    <div
                      key={player.name}
                      className="bg-slate-700/70 hover:bg-slate-700 border border-slate-600/50 rounded-xl p-3 flex flex-col items-center gap-1.5 transition-all animate-score-pop"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <HostAvatar avatar={player.avatar} className={isCustomAvatar(player.avatar || "") ? "w-10 h-10 lg:w-12 lg:h-12" : "text-3xl lg:text-4xl"} />
                      <span className="text-sm lg:text-base font-semibold text-slate-200 truncate max-w-full text-center">
                        {player.name}
                      </span>
                    </div>
                  ))}
```

with:

```tsx
                  {players.map((player, i) => (
                    <div
                      key={player.name}
                      className="relative bg-slate-700/70 hover:bg-slate-700 border border-slate-600/50 rounded-xl p-3 flex flex-col items-center gap-1.5 transition-all animate-score-pop"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <button
                        type="button"
                        onClick={() => setKickTarget(player.name)}
                        aria-label={t("kickPlayer")}
                        title={t("kickPlayer")}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <HostAvatar avatar={player.avatar} className={isCustomAvatar(player.avatar || "") ? "w-10 h-10 lg:w-12 lg:h-12" : "text-3xl lg:text-4xl"} />
                      <span className="text-sm lg:text-base font-semibold text-slate-200 truncate max-w-full text-center">
                        {player.name}
                      </span>
                    </div>
                  ))}
```

- [ ] **Step 5: Render the confirmation dialog and error banner**

Still inside the lobby `return (...)` block, just before the closing `</div>` that wraps the whole lobby layout, add:

```tsx
        <Dialog open={kickTarget !== null} onOpenChange={(open) => !open && setKickTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("kickConfirmTitle", { name: kickTarget ?? "" })}</DialogTitle>
              <DialogDescription>{t("kickConfirmDescription")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setKickTarget(null)}>
                {t("cancel")}
              </Button>
              <Button variant="destructive" onClick={handleConfirmKick}>
                {t("kickConfirmAction")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {kickError && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-amber-500/95 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            <span>{t("kickDuringQuestion")}</span>
          </div>
        )}
```

- [ ] **Step 6: Also render the X on cards during the non-lobby `phase`**

If the host view renders a player list in other phases (e.g., between questions), the X has to be added there too. Check the component: if the player grid markup from Step 4 is the ONLY place player cards are rendered, skip this step. Otherwise, copy the same X button block into every player-card render site. Verify by searching:

Run: `grep -n 'player.name' src/components/live/host-view.tsx`

For each match that renders a player card, ensure the X button and `relative` wrapper class are present. If the list is only shown in lobby, the between-questions kick flow will rely on a different UI surface — in that case, document via comment "kick UI only exposed in lobby and results screens" and proceed. (Confirmed by the spec: between-questions kick uses whatever list is shown at that point.)

- [ ] **Step 7: Verify TypeScript + lint**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run: `npm run dev:custom` in one terminal, then open `http://localhost:3000`, create a session as host, join as a player in another browser, and confirm:
1. The X button appears on the player card.
2. Clicking it opens the confirmation dialog.
3. Confirming removes the player from the list.

- [ ] **Step 8: Commit**

```bash
git add src/components/live/host-view.tsx
git commit -m "feat(live): add kick button and confirmation dialog to host lobby"
```

---

## Task 7: Player UI — `kicked` phase and terminal screen

**Files:**
- Modify: `src/components/live/player-view.tsx`

- [ ] **Step 1: Extend the `Phase` union**

In `src/components/live/player-view.tsx` at line 28, change:

```ts
type Phase = "join" | "waiting" | "countdown" | "question" | "feedback" | "podium";
```

to:

```ts
type Phase = "join" | "waiting" | "countdown" | "question" | "feedback" | "podium" | "kicked";
```

- [ ] **Step 2: Add the `onKicked` listener**

In the `useEffect` that subscribes to socket events (around line 240), add inside the handler definitions:

```ts
    const onKicked = () => {
      sessionStorage.removeItem("savint-session");
      setPhase("kicked");
    };
```

Then register and unregister it alongside the other listeners:

```ts
    socket.on("kicked", onKicked);
    // ...
    socket.off("kicked", onKicked);
```

- [ ] **Step 3: Map `nicknameKicked` in the error handler**

Still in the same `useEffect`, find `onSessionError` (around line 242). Extend it to translate the `nicknameKicked` key:

```ts
    const onSessionError = (data: { message: string }) => {
      sessionStorage.removeItem("savint-session");
      if (data.message === "nicknameKicked") {
        setError(t("nicknameKicked"));
      } else {
        setError(data.message);
      }
    };
```

Ensure `t` from `useTranslations` is in scope (it already is in this component).

- [ ] **Step 4: Add the kicked terminal screen**

Add the following rendering block in the component's `return` logic, **before** any other phase returns (or at the appropriate spot consistent with how other phases are conditioned — the existing pattern uses `if (phase === "xxx")` blocks). Place this block near the top of the return logic, right after the `if (phase === "join")` block:

```tsx
  if (phase === "kicked") {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center bg-slate-800/60 border border-slate-700 rounded-2xl p-8">
          <div className="flex justify-center mb-5">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center">
              <UserX className="w-9 h-9 text-amber-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold mb-2">{t("kickedTitle")}</h1>
          <p className="text-slate-300 mb-6">{t("kickedSubtitle")}</p>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem("savint-session");
              window.location.href = withBasePath("/");
            }}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {t("kickedBackHome")}
          </button>
        </div>
      </div>
    );
  }
```

Add `UserX` to the `lucide-react` import at the top of the file (e.g., alongside existing icon imports).

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev:custom`
In two browsers: host + player. Host kicks the player. Verify:
1. Player sees the kicked screen.
2. "Torna alla home" returns to `/`.
3. Re-joining with the same nickname shows the "nicknameKicked" error.
4. Re-joining with a different nickname works.

- [ ] **Step 6: Commit**

```bash
git add src/components/live/player-view.tsx
git commit -m "feat(live): add kicked terminal screen and nickname-kicked error mapping"
```

---

## Task 8: i18n strings in Italian and English

**Files:**
- Modify: `src/messages/it.json`
- Modify: `src/messages/en.json`

- [ ] **Step 1: Identify the correct namespace**

Open both files and find the namespace used by host-view / player-view. In `src/messages/it.json`, lines 342-345 show keys like `"players"`, `"waitingForPlayers"` — note the containing namespace key (a few lines up).

Run: `grep -n '"players"' src/messages/it.json` and `grep -nB 50 '"players"' src/messages/it.json | grep -E '^\s*"[a-zA-Z]+":\s*\{' | tail -3`

The closest enclosing object is the namespace we must add the new keys to.

- [ ] **Step 2: Add the keys in `it.json`**

Within the same namespace, immediately after `"waitingForPlayersBtn"`, add:

```json
"kickPlayer": "Espelli giocatore",
"kickConfirmTitle": "Espellere {name}?",
"kickConfirmDescription": "Il giocatore verrà rimosso dalla sessione e non potrà rientrare con lo stesso nome.",
"kickConfirmAction": "Espelli",
"cancel": "Annulla",
"kickDuringQuestion": "Attendi la fine della domanda per espellere",
"kickedTitle": "Sei stato rimosso dalla sessione",
"kickedSubtitle": "Il docente ti ha rimosso da questo quiz.",
"kickedBackHome": "Torna alla home",
"nicknameKicked": "Questo nome non è più disponibile per questa sessione. Scegli un altro nickname.",
```

If `"cancel"` already exists in this namespace, drop the duplicate line.

- [ ] **Step 3: Add the keys in `en.json`**

Same namespace, after `"waitingForPlayersBtn"`:

```json
"kickPlayer": "Kick player",
"kickConfirmTitle": "Kick {name}?",
"kickConfirmDescription": "The player will be removed from the session and won't be able to rejoin with the same name.",
"kickConfirmAction": "Kick",
"cancel": "Cancel",
"kickDuringQuestion": "Wait for the question to end before kicking",
"kickedTitle": "You were removed from the session",
"kickedSubtitle": "The teacher removed you from this quiz.",
"kickedBackHome": "Back to home",
"nicknameKicked": "This name is no longer available for this session. Choose another nickname.",
```

If `"cancel"` already exists, drop the duplicate line.

- [ ] **Step 4: Verify JSON validity**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/messages/it.json','utf8')); JSON.parse(require('fs').readFileSync('src/messages/en.json','utf8')); console.log('OK')"`
Expected: prints `OK`.

- [ ] **Step 5: Run type check (which also validates next-intl key usage in components)**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/messages/it.json src/messages/en.json
git commit -m "i18n: add kick-player strings (it/en)"
```

---

## Task 9: E2E — kick from lobby, block same-nickname rejoin, allow different nickname

**Files:**
- Create: `tests/e2e/kick-player.spec.ts`

- [ ] **Step 1: Create the spec with the first three scenarios**

Create `tests/e2e/kick-player.spec.ts`. Use the multi-context pattern from the existing `tests/e2e/quiz-test-mode.spec.ts` (open and inspect it first to match conventions — helper functions for login/creating a quiz, starting a session, etc.).

Run: `cat tests/e2e/quiz-test-mode.spec.ts | head -80`

Then write the new spec. Assuming the helpers are available (if not, inline the setup):

```ts
import { test, expect, Browser } from "@playwright/test";

async function hostStartSession(browser: Browser) {
  // Reuse the project's standard host-login + start-session helpers.
  // If no helper exists, log in via NextAuth dev routes, create a quiz with
  // one MULTIPLE_CHOICE question, then open /dashboard and click "Play".
  // Return { hostPage, pin, sessionId }.
  throw new Error("TODO: inline or import the existing host-setup helper");
}

test.describe("Kick player", () => {
  test("host kicks a player in the lobby; same-nickname rejoin blocked; different nickname works", async ({ browser }) => {
    const host = await hostStartSession(browser);

    // Player joins.
    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await playerPage.goto(`/play?pin=${host.pin}`);
    await playerPage.getByLabel("Nickname").fill("Alice");
    await playerPage.getByRole("button", { name: /entra|join/i }).click();
    await expect(playerPage.getByText(/in attesa|waiting/i)).toBeVisible();

    // Host sees Alice card → click X.
    await host.hostPage.locator('[data-testid="player-card"]', { hasText: "Alice" }).getByRole("button", { name: /espelli|kick/i }).click();
    await host.hostPage.getByRole("button", { name: /espelli|^kick$/i }).click(); // confirm in dialog

    // Player sees the kicked screen.
    await expect(playerPage.getByRole("heading", { name: /rimosso|removed/i })).toBeVisible();

    // Alice tries to rejoin with the same nickname — should fail with i18n error.
    const rejoinCtx = await browser.newContext();
    const rejoinPage = await rejoinCtx.newPage();
    await rejoinPage.goto(`/play?pin=${host.pin}`);
    await rejoinPage.getByLabel("Nickname").fill("Alice");
    await rejoinPage.getByRole("button", { name: /entra|join/i }).click();
    await expect(rejoinPage.getByText(/non è più disponibile|no longer available/i)).toBeVisible();

    // Same person with a different nickname can join.
    await rejoinPage.getByLabel("Nickname").fill("Alicia");
    await rejoinPage.getByRole("button", { name: /entra|join/i }).click();
    await expect(rejoinPage.getByText(/in attesa|waiting/i)).toBeVisible();
  });
});
```

NOTE: the `hostStartSession` helper depends on existing setup code. Before implementing the Playwright spec blindly, open `tests/e2e/quiz-test-mode.spec.ts` and `tests/e2e/app.spec.ts` and copy the login/session-creation pattern into this new file (or extract a shared helper and import it).

To locate and add a `data-testid`: in `src/components/live/host-view.tsx` at the player-card rendering site (modified in Task 6), add `data-testid="player-card"` to the outer `<div className="relative bg-slate-700/70 ...">`. This makes the selector reliable. Do this BEFORE running the test.

- [ ] **Step 2: Add the `data-testid` to the host player card**

In `src/components/live/host-view.tsx`, on the `<div>` wrapping each player card (modified in Task 6), add `data-testid="player-card"`.

- [ ] **Step 3: Run the E2E**

Run: `npm run test:e2e -- tests/e2e/kick-player.spec.ts`
Expected: PASS.

If the helper doesn't exist, either extract one from the existing e2e files into a shared `tests/e2e/helpers.ts`, or inline the setup steps in this spec. Prefer extraction if there's duplication across ≥ 2 specs.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/kick-player.spec.ts src/components/live/host-view.tsx
git commit -m "test(e2e): cover lobby kick, rejoin block, and different-nickname rejoin"
```

---

## Task 10: E2E — kick between questions; X disabled during question

**Files:**
- Modify: `tests/e2e/kick-player.spec.ts`

- [ ] **Step 1: Add the between-questions scenario**

Append inside the same `test.describe("Kick player", () => { ... })`:

```ts
  test("host can kick between questions; X disabled during an active question", async ({ browser }) => {
    const host = await hostStartSession(browser);

    // Two players join.
    const aCtx = await browser.newContext();
    const aliceP = await aCtx.newPage();
    await aliceP.goto(`/play?pin=${host.pin}`);
    await aliceP.getByLabel("Nickname").fill("Alice");
    await aliceP.getByRole("button", { name: /entra|join/i }).click();

    const bCtx = await browser.newContext();
    const bobP = await bCtx.newPage();
    await bobP.goto(`/play?pin=${host.pin}`);
    await bobP.getByLabel("Nickname").fill("Bob");
    await bobP.getByRole("button", { name: /entra|join/i }).click();

    // Host starts quiz.
    await host.hostPage.getByRole("button", { name: /avvia|start/i }).click();

    // During question: X is disabled (attribute disabled or no dialog on click).
    const aliceCard = host.hostPage.locator('[data-testid="player-card"]', { hasText: "Alice" });
    const aliceX = aliceCard.getByRole("button", { name: /espelli|kick/i });
    await aliceX.click();
    // Confirm dialog should NOT appear; attempt to click confirm should time out quickly.
    await expect(host.hostPage.getByRole("dialog")).toBeHidden({ timeout: 1000 });
    // Alternatively, if the UI disables the X, assert disabled:
    // await expect(aliceX).toBeDisabled();

    // Both players answer (assumes multiple-choice Q with "a" correct).
    await aliceP.getByRole("button", { name: /^a$/i }).click();
    await bobP.getByRole("button", { name: /^a$/i }).click();

    // Host reveals results (after auto-reveal in test mode, or via button).
    await host.hostPage.getByRole("button", { name: /risultati|results|mostra/i }).click();

    // Between questions — X now opens the dialog.
    await aliceX.click();
    await host.hostPage.getByRole("dialog").getByRole("button", { name: /espelli|^kick$/i }).click();

    await expect(aliceP.getByRole("heading", { name: /rimosso|removed/i })).toBeVisible();
  });
```

Adjust selectors to match actual label text in your i18n. The "X disabled during question" assertion style (click-then-hidden-dialog vs `toBeDisabled`) should match whatever UI decision was taken in Task 6 — the plan's Task 6 Step 4 renders the X unconditionally; if the spec prefers an actually-disabled X during questions, adjust Task 6 accordingly. For this plan we leave the X clickable and rely on the server to reject with `kickDuringQuestion`; the dialog-opens-anyway behavior means we should instead check for the toast:

Replace the "dialog hidden" assertion with:

```ts
    await host.hostPage.getByRole("dialog").getByRole("button", { name: /espelli|^kick$/i }).click();
    await expect(host.hostPage.getByText(/attendi la fine|wait for the question/i)).toBeVisible();
    // Alice should still be in the game.
    await expect(aliceP.getByRole("heading", { name: /rimosso|removed/i })).not.toBeVisible();
```

- [ ] **Step 2: Run the test**

Run: `npm run test:e2e -- tests/e2e/kick-player.spec.ts`
Expected: PASS (both tests).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/kick-player.spec.ts
git commit -m "test(e2e): cover kick between questions and rejection during active question"
```

---

## Task 11: Documentation update

**Files:**
- Modify: `README.md`
- Modify: `README.it.md`

- [ ] **Step 1: Add a bullet in the English README**

Open `README.md`. Under the `## Features` list, after the "Session management" bullet (around line 49), add:

```md
- **Remove disruptive players**: during the lobby and between questions, the teacher can kick a player from the session; the kicked nickname is blocked from rejoining that session
```

- [ ] **Step 2: Add a bullet in the Italian README**

Open `README.it.md` and add the equivalent Italian bullet in the matching location:

```md
- **Rimozione di giocatori**: durante la lobby e tra una domanda e l'altra, il docente può espellere un giocatore dalla sessione; il nickname espulso non può più entrare in quella sessione
```

- [ ] **Step 3: Commit**

```bash
git add README.md README.it.md
git commit -m "docs: mention host kick-player feature in READMEs (en/it)"
```

---

## Self-Review Notes

**Spec coverage:**
- §2 host UX → Tasks 6, 8 (i18n).
- §2 removed-player screen → Task 7.
- §2 same-nickname block → Task 3.
- §2 different-nickname allowed → Tasks 3 (implicit — handler only blocks exact name match) + 9 (E2E verification).
- §3.1 `kickedNames` + `phase` → Task 2.
- §3.2 socket events → Task 1.
- §3.3 `kickPlayer` handler → Task 4 (+ phase gate test in Task 5).
- §3.4 `joinSession` modification → Task 3.
- §3.5 host UI → Task 6.
- §3.6 player UI → Task 7.
- §3.7 i18n keys → Task 8.
- §6 unit tests → Tasks 3–5. Tests 1, 6, 7, 8 from the spec are explicitly covered; tests 2–5 from the spec list are all covered by the "happy path lobby", "wrong caller", "in-question gate", "disconnect cleanup", and "__host__ target" tests written.
- §6 E2E tests → Tasks 9 (scenarios 1–3) and 10 (scenarios 4–5).

**Ambiguity resolved:** Task 10 Step 1 updates the in-question-UI strategy to match the server-side gate: the dialog opens but the server rejects with a toast. This keeps Task 6 UI logic simpler (no client-side phase check needed) and matches reality that `phase` is server truth.

**Placeholder scan:** no `TBD`/`TODO`/"implement later" strings. One explicit note in Task 9 Step 1 flags that the engineer must inspect existing e2e helper code before writing `hostStartSession`; this is an honest instruction, not a placeholder — there is no way to write the helper without reading the project's existing e2e login setup, which varies by environment.
