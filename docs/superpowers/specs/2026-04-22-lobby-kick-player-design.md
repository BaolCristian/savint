# Kick Player — Design Spec

**Date:** 2026-04-22
**Status:** Approved for implementation planning
**Scope:** Allow the teacher (host) to remove a connected player from a live session, both in the lobby and between questions during an ongoing quiz.

---

## 1. Goals and non-goals

### Goals

- The host can explicitly remove a player during the connection waiting phase (lobby).
- The host can also remove a player between questions during an ongoing quiz (after results reveal and before the next question starts).
- The removed player sees a dedicated screen explaining they were removed by the teacher.
- The removed nickname is blocked from rejoining the same session (session-scoped block, in-memory).
- A removed player can still rejoin the same session from the same device with a different nickname.

### Non-goals

- No device/IP/browser-level block (intentionally avoided: fragile, punishes shared devices, easily bypassed).
- No persistence of the kicked list in DB (session lives only in memory; a server restart ends the session anyway).
- No global or cross-session ban.
- No audit log (the project does not currently have one).
- No broadcast notification to other players ("X was kicked"); the existing `playerLeft` event is emitted silently, unchanged.
- No kick allowed while a question is open (answers in-flight would corrupt counters and statistics).

---

## 2. User-facing behavior

### Host — lobby and between questions

- Each player card in the host view shows a small circular **X** icon in the top-right corner.
- The X is always visible (not hover-only), because the host view runs on interactive whiteboards where hover is not reliable.
- Clicking the X opens a confirmation dialog:
  - Title: "Espellere {name}?" / "Kick {name}?"
  - Description: "Il giocatore verrà rimosso dalla sessione e non potrà rientrare con lo stesso nome." / "The player will be removed from the session and won't be able to rejoin with the same name."
  - Actions: "Annulla" / "Cancel" (secondary), "Espelli" / "Kick" (destructive).
- During an active question, the X is visually disabled (grey, `cursor-not-allowed`) with a tooltip "Attendi la fine della domanda" / "Wait for the question to end".

### Removed player

- The player immediately sees a dedicated terminal screen with:
  - `UserX` icon (amber/soft-red tone, non-aggressive).
  - Title: "Sei stato rimosso dalla sessione" / "You were removed from the session".
  - Subtitle: "Il docente ti ha rimosso da questo quiz." / "The teacher removed you from this quiz."
  - Primary button "Torna alla home" / "Back to home" → navigates to `/`.
- The client's `sessionStorage` savint-session entry is cleared so the auto-rejoin flow does not fire on a subsequent page load.

### Removed nickname rejoin attempt

- If the same (or any) user tries to join the same session with the exact kicked nickname, the existing join form displays an error:
  "Questo nome non è più disponibile per questa sessione. Scegli un altro nickname." / "This name is no longer available for this session. Choose another nickname."
- Joining with a different nickname from the same device works normally.

---

## 3. Architecture

### 3.1 Server state changes — `src/lib/socket/server.ts`

Add two fields to `GameState`:

```ts
interface GameState {
  // ...existing fields
  kickedNames: Set<string>;                       // nicknames kicked for this session
  phase: "lobby" | "in-question" | "between-questions" | "ended";
}
```

- `kickedNames` is initialized as an empty `Set` when a `GameState` is first created.
- `phase` is initialized to `"lobby"` and transitioned at the existing lifecycle points:
  - `startGame` → the game enters `"between-questions"` just before the first `nextQuestion` is processed.
  - `nextQuestion` → transitions to `"in-question"` after sending the question payload.
  - `showResults` → transitions to `"between-questions"`.
  - `endGame` → transitions to `"ended"`.

Phase is explicit state rather than derived to keep kick-gate logic trivially readable and resilient to future additions.

### 3.2 New socket events — `src/types/index.ts`

Add to `ClientToServerEvents`:

```ts
kickPlayer: (data: { playerName: string }) => void;
```

Add to `ServerToClientEvents`:

```ts
kicked: (data: { reason: "host" }) => void;
```

A dedicated `kicked` event (instead of reusing `sessionError`) lets the player UI branch to a specific terminal screen, and leaves `reason` open for future causes (e.g., `"inactivity"`).

### 3.3 Server handler — `kickPlayer`

Placement: next to the existing `leaveSession` handler in `src/lib/socket/server.ts`.

Logic outline:

1. Authorization: `currentPlayerName === "__host__"` and `currentSessionId` present. Otherwise silently ignore.
2. Self-kick guard: `playerName !== "__host__"`. Silently ignore.
3. Phase gate: if `game.phase === "in-question"`, emit `sessionError` to the host socket with `message: "kickDuringQuestion"` (i18n key) and return.
4. Lookup target in `game.players`. If missing, return (already gone).
5. Add nickname to `game.kickedNames`.
6. Delete target from `game.players`.
7. Clear any pending entry in `disconnectedPlayers` (cancel the grace-period timer).
8. If target has a live socket, emit `kicked` to that socket only, then remove it from the session room.
9. Emit `playerLeft` to the session room (reuses existing event; the UI counter updates automatically).

### 3.4 Server handler — `joinSession` modification

After the existing duplicate-name check in `joinSession`, add:

```ts
if (game.kickedNames.has(playerName)) {
  socket.emit("sessionError", { message: "nicknameKicked" });
  return;
}
```

The `rejoinSession` path requires the player to still be in `game.players` or in `disconnectedPlayers`. Kicking removes them from both, so auto-rejoin with the same nickname already fails naturally — no change needed there.

### 3.5 Host UI — `src/components/live/host-view.tsx`

- Player card at lines around 501-512 gains a small `X` icon (`lucide-react`) positioned absolute top-right, circular, red-tinted background with hover darkening.
- Clicking the X opens an `AlertDialog` (shadcn, already in the project) with the copy from §2.
- Confirming emits `socket.emit("kickPlayer", { playerName })`.
- `playerLeft` handler (already registered in the component) is the single source of truth for removing the card from the UI — no optimistic update needed.
- During `phase === "question"` (host view local state), the X is rendered disabled with a tooltip.
- `sessionError` with `message: "kickDuringQuestion"` triggers a non-blocking `sonner` toast.

### 3.6 Player UI — `src/components/live/player-view.tsx`

- Extend the `Phase` union with `"kicked"`.
- Register an `onKicked` listener that clears `sessionStorage` and sets `phase = "kicked"`.
- Add a terminal screen rendered when `phase === "kicked"` with the copy from §2 and a button routing to `/`.
- `sessionError` with `message: "nicknameKicked"` displays via the existing `error` state in the join form path (`src/app/(live)/play/page.tsx`), mapped through i18n.

### 3.7 i18n additions — `src/messages/{it,en}.json`

- `kickPlayer`
- `kickConfirmTitle` (with `{name}` placeholder)
- `kickConfirmDescription`
- `kickConfirmAction`
- `kickDuringQuestion` (toast)
- `kickDuringQuestionDisabled` (tooltip on disabled X)
- `kickedTitle`
- `kickedSubtitle`
- `kickedBackHome`
- `nicknameKicked`

Copy as shown in §2.

---

## 4. Data flow — kick in lobby (happy path)

1. Host clicks X on player A's card → confirms dialog.
2. Client emits `kickPlayer({ playerName: "A" })`.
3. Server validates: host authorized, phase is `lobby`, A exists.
4. Server: `kickedNames.add("A")`, `players.delete("A")`, cancel any disconnect timer for A.
5. Server emits `kicked` to A's socket only, removes A from the room.
6. Server emits `playerLeft` to the room → all UIs update counters/lists.
7. A's client: `onKicked` fires → clears sessionStorage → renders kicked screen.
8. If A reloads and tries to join the same PIN with nickname "A", the join form shows the `nicknameKicked` error. With a different nickname, join succeeds.

---

## 5. Edge cases

- **Kick during a question**: rejected by phase gate; host sees a toast explaining they must wait.
- **Kick of a player already in grace period (disconnected)**: handler cancels the grace timer and adds the nickname to `kickedNames`. When they attempt to reconnect, both the rejoin and the fresh-join paths fail naturally.
- **Kick of a player that just left voluntarily**: the lookup in `game.players` returns nothing; handler returns silently. The nickname is not added to `kickedNames` (they left on their own; no reason to block them).
- **Host refresh after kicking**: server `hostSocketId` recovery logic is unchanged; `kickedNames` lives in `GameState`, so the block persists across host reconnects.
- **Server restart**: `GameState` is in-memory; a server restart destroys the session entirely, including `kickedNames`. Accepted; players would have to rejoin a fresh session anyway.
- **Case sensitivity of nickname match**: consistent with the server's existing player-name handling (no additional normalization introduced by this change).

---

## 6. Test plan

### Unit tests — `tests/unit/socket/kick-player.test.ts`

Using the mock patterns established by existing unit tests in `tests/unit`:

1. `kickPlayer` removes the player from `game.players` and adds the name to `kickedNames`.
2. `kickPlayer` rejected when the caller is not `__host__` (game state unchanged).
3. `kickPlayer` rejected when `phase === "in-question"` (game state unchanged, `sessionError` emitted to the host).
4. `kickPlayer` accepted in `phase === "lobby"` and `phase === "between-questions"`.
5. `kickPlayer` cancels a pending `disconnectedPlayers` entry when the target was in the grace period.
6. `joinSession` rejects a name present in `kickedNames` with `sessionError: "nicknameKicked"`.
7. `joinSession` accepts a different nickname from the same device after a kick.
8. `kickPlayer` with `playerName === "__host__"` is a no-op.

### E2E tests — `tests/e2e/kick-player.spec.ts`

Multi-context Playwright pattern already in use:

1. **Lobby kick happy path**: host creates session → player A joins → host clicks X → confirms → player A sees the kicked screen → host lobby `playerCount` decreases to 0.
2. **Same-nickname rejoin blocked**: after scenario 1, player A returns to the join form and tries the same nickname → sees the `nicknameKicked` error.
3. **Different-nickname rejoin allowed**: same player retries with a different nickname → enters the lobby successfully.
4. **Kick between questions**: host starts quiz → answers first question → reveals results → host kicks a player → player sees kicked screen; the quiz continues for the remaining players.
5. **Kick disabled during a question**: while a question is open, verify the X is rendered disabled (or not actionable) in the host view and becomes active again once results are revealed.

---

## 7. Out of scope / future considerations

- Persistent bans across sessions (would require a new DB table and UX for lifting the ban).
- IP/device-level kick (rejected during brainstorming as too fragile for a classroom setting).
- Broadcasting a visible "player X was kicked" message to remaining players.
- Kick with custom reason text typed by the host.
- Audit log of kick actions.
