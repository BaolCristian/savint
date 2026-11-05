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
  buildCategories: () => [{ name: "x", emojis: ["🙂"] }],
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
  });

  it("name typed with a trailing space (Chrome keyboard suggestion)", () => {
    joinAs("Mario ");
    const sent = fake.sent.find((e) => e.event === "joinSession");
    expect((sent?.payload as { playerName: string }).playerName).toBe("Mario");

    // Server echoes the trimmed name, then sends the game state
    fake.fire("playerJoined", { playerName: "Mario", playerCount: 1 });
    fake.fire("gameState", { sessionId: "s1", status: "WAITING" });

    expect(screen.queryByLabelText("yourName")).toBeNull();
    expect(JSON.parse(sessionStorage.getItem("savint-session")!).playerName).toBe("Mario");
  });

  it("second attempt: the server answers playerReconnected instead of playerJoined", () => {
    joinAs("Mario");
    fake.fire("playerReconnected", { playerName: "Mario", playerCount: 1 });
    fake.fire("gameState", { sessionId: "s1", status: "WAITING" });

    expect(screen.queryByLabelText("yourName")).toBeNull();
  });
});
