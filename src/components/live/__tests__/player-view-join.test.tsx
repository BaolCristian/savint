import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { EventEmitter } from "node:events";

/** Fake socket: emit() from the component records; server events via fire() */
class FakeSocket extends EventEmitter {
  sent: { event: string; payload: unknown }[] = [];
  emit(event: string, payload?: unknown) {
    this.sent.push({ event, payload });
    return true;
  }
  fire(event: string, payload: unknown) {
    act(() => {
      super.emit(event, payload);
    });
  }
}

const fake = new FakeSocket();

vi.mock("@/lib/socket/client", () => ({
  useSocket: () => ({ socket: fake, connected: true, reconnecting: false }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("pin=123456"),
}));
vi.mock("@/lib/emoji-avatars", () => ({
  fetchCustomEmoticons: () => Promise.resolve([]),
  buildCategories: () => [{ name: "x", emojis: ["🙂", "🦊"] }],
  randomEmoji: () => "🙂",
  isCustomAvatar: () => false,
}));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => null }));

import { PlayerView } from "../player-view";

function joinAs(typedName: string) {
  render(<PlayerView />);
  fireEvent.change(screen.getByLabelText("yourName"), { target: { value: typedName } });
  const join = screen.getByRole("button", { name: /Entra nel quiz/ });
  fireEvent.click(join);
}

describe("PlayerView join: the player leaves the form once the server accepts", () => {
  beforeEach(() => {
    fake.removeAllListeners();
    fake.sent = [];
    sessionStorage.clear();
    localStorage.clear();
  });

  it("name typed with a trailing space (Chrome keyboard suggestion)", () => {
    joinAs("Mario ");
    const sent = fake.sent.find((e) => e.event === "joinSession");
    expect((sent?.payload as { playerName: string }).playerName).toBe("Mario");

    // Server echoes the trimmed name, then sends the game state
    fake.fire("playerJoined", { playerName: "Mario", playerCount: 1 });
    fake.fire("gameState", { sessionId: "s1", status: "WAITING" });

    expect(screen.queryByLabelText("yourName")).toBeNull();
    expect(JSON.parse(localStorage.getItem("savint-session")!).playerName).toBe("Mario");
  });

  it("second attempt: the server answers playerReconnected instead of playerJoined", () => {
    joinAs("Mario");
    fake.fire("playerReconnected", { playerName: "Mario", playerCount: 1 });
    fake.fire("gameState", { sessionId: "s1", status: "WAITING" });

    expect(screen.queryByLabelText("yourName")).toBeNull();
  });
});

describe("PlayerView: identity, one player per browser, waiting-room profile", () => {
  beforeEach(() => {
    fake.removeAllListeners();
    fake.sent = [];
    sessionStorage.clear();
    localStorage.clear();
  });

  it("saves the player's token and uses it to rejoin after a reload", () => {
    joinAs("Mario");
    fake.fire("gameState", { sessionId: "s1", status: "WAITING", playerToken: "tok-1" });
    expect(JSON.parse(localStorage.getItem("savint-session")!)).toMatchObject({
      sessionId: "s1", playerName: "Mario", playerToken: "tok-1", pin: "123456",
    });

    // "Reload": a fresh view on the same browser rejoins with the token
    fake.removeAllListeners();
    fake.sent = [];
    render(<PlayerView />);
    const rejoin = fake.sent.find((e) => e.event === "rejoinSession");
    expect(rejoin?.payload).toEqual({ sessionId: "s1", playerName: "Mario", playerToken: "tok-1" });
  });

  it("refuses a second name for the same game on this browser", () => {
    localStorage.setItem("savint-session", JSON.stringify({
      sessionId: "s1", playerName: "Mario", playerToken: "tok-1", pin: "123456",
    }));
    render(<PlayerView />);
    fake.fire("sessionError", { message: "Name already taken" }); // unrelated error: identity kept
    fake.sent = [];
    fireEvent.change(screen.getByLabelText("yourName"), { target: { value: "Luigi" } });
    fireEvent.click(screen.getByRole("button", { name: /Entra nel quiz/ }));

    expect(fake.sent.find((e) => e.event === "joinSession")).toBeUndefined();
    expect(screen.getByText("alreadyJoinedAs")).toBeTruthy();
  });

  it("a stale saved game is forgotten when the server says it is over", () => {
    localStorage.setItem("savint-session", JSON.stringify({ sessionId: "old", playerName: "Mario", pin: "1" }));
    render(<PlayerView />);
    fake.fire("sessionError", { message: "Session not found or expired" });
    expect(localStorage.getItem("savint-session")).toBeNull();
  });

  it("in the waiting room, name and picture can be changed together", () => {
    joinAs("Mario");
    fake.fire("gameState", { sessionId: "s1", status: "WAITING", playerToken: "tok-1" });
    fake.sent = [];

    fireEvent.click(screen.getByRole("button", { name: /editProfile/ }));
    fireEvent.change(screen.getByLabelText("yourName"), { target: { value: "Super Mario" } });
    fireEvent.click(screen.getByRole("button", { name: "Avatar 🦊" }));
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    expect(fake.sent).toEqual([
      { event: "changeAvatar", payload: { avatar: "🦊" } },
      { event: "renamePlayer", payload: { newName: "Super Mario" } },
    ]);

    fake.fire("renameSuccess", { newName: "Super Mario" });
    expect(screen.getByText("Super Mario")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("savint-session")!).playerName).toBe("Super Mario");
  });

  it("once the game has started only the picture can change", () => {
    joinAs("Mario");
    fake.fire("gameState", { sessionId: "s1", status: "IN_PROGRESS", playerToken: "tok-1" });
    fake.sent = [];

    fireEvent.click(screen.getByRole("button", { name: /changeAvatar/ }));
    expect(screen.queryByLabelText("yourName")).toBeNull();
  });
});

describe("PlayerView: game cancelled by the teacher", () => {
  beforeEach(() => {
    fake.removeAllListeners();
    fake.sent = [];
    localStorage.clear();
  });

  it("shows the cancelled screen and forgets the game", () => {
    joinAs("Mario");
    fake.fire("gameState", { sessionId: "s1", status: "IN_PROGRESS", playerToken: "tok-1" });
    fake.fire("gameCancelled", undefined);
    expect(screen.getByText("gameCancelledTitle")).toBeTruthy();
    expect(localStorage.getItem("savint-session")).toBeNull();
  });
});

describe("PlayerView: a second game on the same page", () => {
  beforeEach(() => {
    fake.removeAllListeners();
    fake.sent = [];
    localStorage.clear();
  });

  it("after a finished game, the name can be changed again in the next waiting room", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      joinAs("Mario");
      fake.fire("gameState", { sessionId: "s1", status: "IN_PROGRESS", playerToken: "tok-1" });
      fake.fire("gameOver", { podium: [], fullResults: [{ playerName: "Mario", score: 900 }] });
      act(() => { vi.advanceTimersByTime(11000); });
      fireEvent.click(screen.getByRole("button", { name: "playAgain" }));

      // New game, still in its waiting room
      fireEvent.change(screen.getByLabelText("pinLabel"), { target: { value: "654321" } });
      fireEvent.click(screen.getByRole("button", { name: /Entra nel quiz/ }));
      fake.fire("gameState", { sessionId: "s2", status: "WAITING", playerToken: "tok-2" });

      fireEvent.click(screen.getByRole("button", { name: /editProfile/ }));
      expect(screen.getByLabelText("yourName")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a rename refused because the name was removed by the teacher shows why, in the panel", () => {
    joinAs("Mario");
    fake.fire("gameState", { sessionId: "s1", status: "WAITING", playerToken: "tok-1" });
    fireEvent.click(screen.getByRole("button", { name: /editProfile/ }));
    fireEvent.change(screen.getByLabelText("yourName"), { target: { value: "Luigi" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    fake.fire("sessionError", { message: "nameRemoved" });

    expect(screen.getByText("nicknameKicked")).toBeTruthy();
    // Still in the game: the saved identity is kept
    expect(localStorage.getItem("savint-session")).not.toBeNull();
  });
});

describe("PlayerView: podium suspense", () => {
  beforeEach(() => {
    fake.removeAllListeners();
    fake.sent = [];
    localStorage.clear();
  });

  it("keeps a suspense screen until the teacher's screen reveals the winner", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      joinAs("Mario");
      fake.fire("gameState", { sessionId: "s1", status: "IN_PROGRESS", playerToken: "tok-1" });
      fake.fire("gameOver", {
        podium: [{ playerName: "Mario", score: 900, position: 1 }],
        fullResults: [{ playerName: "Mario", score: 900 }],
      });
      expect(screen.getByText("podiumSuspenseTitle")).toBeTruthy();
      expect(screen.queryByText("youFinished")).toBeNull();

      act(() => { vi.advanceTimersByTime(11000); });
      expect(screen.queryByText("podiumSuspenseTitle")).toBeNull();
      expect(screen.getByText("youFinished")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

