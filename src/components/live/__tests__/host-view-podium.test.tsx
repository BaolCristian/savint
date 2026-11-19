import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { EventEmitter } from "node:events";

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
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));
const sounds = vi.hoisted(() => ({
  playTick: vi.fn(), playTimeUp: vi.fn(), playDrumroll: vi.fn(), playFanfare: vi.fn(),
  isMuted: vi.fn(() => false), toggleMute: vi.fn(), startBgm: vi.fn(), stopBgm: vi.fn(),
}));
vi.mock("@/lib/sounds", () => sounds);

import { HostView } from "../host-view";
import { PODIUM_TIMELINE } from "@/lib/game-theme";

const SESSION = { id: "s1", pin: "123456", hostToken: "t", quiz: { title: "Quiz", questions: [] } };
const GAME_OVER = {
  podium: [
    { playerName: "Anna", score: 3000, position: 1 },
    { playerName: "Bruno", score: 2000, position: 2 },
    { playerName: "Carla", score: 1000, position: 3 },
  ],
  fullResults: [
    { playerName: "Anna", score: 3000 },
    { playerName: "Bruno", score: 2000 },
    { playerName: "Carla", score: 1000 },
    { playerName: "Dario", score: 500 },
  ],
};

const shown = (name: string) => screen.queryAllByText(name).length > 0;

describe("HostView: final podium reveal", () => {
  beforeEach(() => {
    fake.removeAllListeners();
    fake.sent = [];
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  });
  afterEach(() => vi.useRealTimers());

  it("reveals 3rd, 2nd, then the winner after a drumroll, then the full list", () => {
    render(<HostView session={SESSION} />);
    fake.fire("gameOver", GAME_OVER);

    // Intro: nobody revealed, three "?"
    expect(screen.getAllByText("?")).toHaveLength(3);
    expect(shown("Anna") || shown("Bruno") || shown("Carla")).toBe(false);
    expect(sounds.playDrumroll).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(PODIUM_TIMELINE.third); });
    expect(shown("Carla")).toBe(true);
    expect(shown("Bruno")).toBe(false);

    act(() => { vi.advanceTimersByTime(PODIUM_TIMELINE.second - PODIUM_TIMELINE.third); });
    expect(shown("Bruno")).toBe(true);
    expect(shown("Anna")).toBe(false);

    act(() => { vi.advanceTimersByTime(PODIUM_TIMELINE.firstTease - PODIUM_TIMELINE.second); });
    expect(screen.getByText("podiumFirstTease")).toBeTruthy();
    expect(sounds.playDrumroll).toHaveBeenCalledTimes(2);
    expect(shown("Anna")).toBe(false);

    act(() => { vi.advanceTimersByTime(PODIUM_TIMELINE.first - PODIUM_TIMELINE.firstTease); });
    expect(shown("Anna")).toBe(true);
    expect(sounds.playFanfare).toHaveBeenCalledTimes(1);
    expect(shown("Dario")).toBe(false);

    act(() => { vi.advanceTimersByTime(PODIUM_TIMELINE.list - PODIUM_TIMELINE.first); });
    expect(shown("Dario")).toBe(true);
  });

  it("«Skip» shows everything at once, with a single fanfare", () => {
    render(<HostView session={SESSION} />);
    fake.fire("gameOver", GAME_OVER);
    fireEvent.click(screen.getByRole("button", { name: /skipReveal/ }));
    expect(shown("Anna") && shown("Dario")).toBe(true);

    act(() => { vi.advanceTimersByTime(PODIUM_TIMELINE.list); });
    expect(sounds.playFanfare).toHaveBeenCalledTimes(1);
    expect(sounds.playDrumroll).toHaveBeenCalledTimes(1); // only the intro one
  });
});

describe("HostView: after every question, only that question's ranking", () => {
  beforeEach(() => {
    fake.removeAllListeners();
    fake.sent = [];
    vi.clearAllMocks();
  });

  const result = {
    correctAnswer: { choices: [{ text: "4", isCorrect: true }] },
    distribution: { "4": 2 },
    questionRanking: [
      { playerName: "Bruno", points: 800 },
      { playerName: "Anna", points: 200 },
    ],
  };

  function toResults(questionIndex: number, totalQuestions: number) {
    render(<HostView session={SESSION} />);
    fake.fire("questionStart", {
      questionIndex,
      totalQuestions,
      question: { text: "2+2?", type: "MULTIPLE_CHOICE", options: result.correctAnswer, timeLimit: 30, points: 1000, mediaUrl: null },
    });
    fireEvent.click(screen.getByRole("button", { name: /skipToResults/ }));
    fake.fire("questionResult", result);
  }

  it("shows only this question's best, ordered by points earned now", () => {
    toResults(1, 2);
    expect(screen.getByText("bestThisQuestion")).toBeTruthy();
    expect(screen.queryByText("top5")).toBeNull();
    const names = screen.getAllByText(/^(Anna|Bruno|Carla)$/).map((el) => el.textContent);
    expect(names).toEqual(["Bruno", "Anna"]);
    expect(screen.getByText("+800")).toBeTruthy();
  });

  it("the other questions show this question's best too, not the overall top 5", () => {
    toResults(0, 2);
    expect(screen.getByText("bestThisQuestion")).toBeTruthy();
    expect(screen.queryByText("top5")).toBeNull();
  });

  it("says so when nobody scored", () => {
    render(<HostView session={SESSION} />);
    fake.fire("questionStart", {
      questionIndex: 0,
      totalQuestions: 2,
      question: { text: "2+2?", type: "MULTIPLE_CHOICE", options: result.correctAnswer, timeLimit: 30, points: 1000, mediaUrl: null },
    });
    fireEvent.click(screen.getByRole("button", { name: /skipToResults/ }));
    fake.fire("questionResult", { ...result, questionRanking: [] });
    expect(screen.getByText("nobodyScored")).toBeTruthy();
  });
});


describe("HostView: how the points of a question were earned", () => {
  beforeEach(() => {
    fake.removeAllListeners();
    fake.sent = [];
    vi.clearAllMocks();
  });

  function toResults(payload: unknown, questionIndex = 0, totalQuestions = 10) {
    render(<HostView session={SESSION} />);
    fake.fire("questionStart", {
      questionIndex,
      totalQuestions,
      question: { text: "2+2?", type: "TRUE_FALSE", options: { correct: true }, timeLimit: 20, points: 1000, mediaUrl: null },
    });
    fireEvent.click(screen.getByRole("button", { name: /skipToResults/ }));
    fake.fire("questionResult", payload);
  }

  it("each row shows correctness, speed, confidence and time", () => {
    toResults({
      correctAnswer: { correct: true },
      distribution: {},
      questionRanking: [
        { playerName: "Bruno", points: 960, breakdown: { correctness: 500, speed: 300, confidence: 160, responseTimeMs: 8000 } },
        { playerName: "Anna", points: 700, breakdown: { correctness: 500, speed: 200, confidence: null, responseTimeMs: 12000 } },
      ],
    });
    expect(screen.getAllByText(/breakdownCorrectness \+500/)).toHaveLength(2);
    expect(screen.getByText(/breakdownSpeed \+300/)).toBeTruthy();
    // Confidence only where it was asked and given
    expect(screen.getAllByText(/breakdownConfidence/)).toHaveLength(1);
    expect(screen.getByText(/breakdownConfidence \+160/)).toBeTruthy();
    expect(screen.getByText(/breakdownTime:\{"seconds":"8,0"\}/)).toBeTruthy();
  });

  it("a wrong 'very sure' answer shows the penalty with a minus", () => {
    toResults({
      correctAnswer: { correct: true },
      distribution: {},
      questionRanking: [
        { playerName: "Bruno", points: 300, breakdown: { correctness: 250, speed: 250, confidence: -200, responseTimeMs: 1000 } },
      ],
    });
    expect(screen.getByText(/breakdownConfidence −200/)).toBeTruthy();
  });
});

describe("HostView: overall standings every third question", () => {
  beforeEach(() => {
    fake.removeAllListeners();
    fake.sent = [];
    vi.clearAllMocks();
  });

  const base = {
    correctAnswer: { correct: true },
    distribution: {},
    questionRanking: [{ playerName: "Bruno", points: 800 }],
  };

  function toResults(payload: unknown) {
    render(<HostView session={SESSION} />);
    fake.fire("questionStart", {
      questionIndex: 2,
      totalQuestions: 10,
      question: { text: "2+2?", type: "TRUE_FALSE", options: { correct: true }, timeLimit: 20, points: 1000, mediaUrl: null },
    });
    fireEvent.click(screen.getByRole("button", { name: /skipToResults/ }));
    fake.fire("questionResult", payload);
  }

  it("without the overall standings, the button goes straight to the next question", () => {
    toResults(base);
    expect(screen.queryByText(/showOverallStandings/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "nextQuestion" }));
    expect(fake.sent.some((m) => m.event === "nextQuestion")).toBe(true);
  });

  it("with them, the button first shows the overall standings, then the next question", () => {
    toResults({
      ...base,
      overallRanking: [
        { playerName: "Carla", score: 2400 },
        { playerName: "Bruno", score: 1800 },
      ],
    });
    expect(screen.queryByRole("button", { name: "nextQuestion" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /showOverallStandings/ }));
    expect(screen.getByText(/overallStandings/)).toBeTruthy();
    expect(screen.getByText("2400")).toBeTruthy();
    const names = screen.getAllByText(/^(Bruno|Carla)$/).map((el) => el.textContent);
    expect(names).toEqual(["Carla", "Bruno"]);
    expect(fake.sent.some((m) => m.event === "nextQuestion")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "nextQuestion" }));
    expect(fake.sent.some((m) => m.event === "nextQuestion")).toBe(true);
  });
});
