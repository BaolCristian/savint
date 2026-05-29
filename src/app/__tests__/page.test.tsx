import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/components/live/player-view", () => ({
  PlayerView: () => <div data-testid="player-view" />,
}));
vi.mock("@/components/hub/hub-landing", () => ({
  HubLanding: () => <div data-testid="hub-landing" />,
}));

const setMode = (m: "hub" | "installation") =>
  vi.doMock("@/lib/config/savint-mode", () => ({
    getSavintMode: () => m,
    isHubMode: () => m === "hub",
    isInstallationMode: () => m === "installation",
  }));

describe("HomePage", () => {
  beforeEach(() => vi.resetModules());

  it("renders the hub landing in hub mode", async () => {
    setMode("hub");
    const { default: HomePage } = await import("../page");
    const out = await HomePage();
    expect(out.type.name).toBe("HubLanding");
  });

  it("renders the player view in installation mode", async () => {
    setMode("installation");
    const { default: HomePage } = await import("../page");
    const out = await HomePage();
    expect(out.type.name).toBe("PlayerView");
  });
});
