import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue({}),
    },
    answer: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { setupSocketHandlers } from "@/lib/socket/server";
import { createHostToken } from "@/lib/socket/host-token";

process.env.AUTH_SECRET = "test-secret-live-host";
import { prisma } from "@/lib/db/client";

class FakeSocket extends EventEmitter {
  id: string;
  rooms = new Set<string>();
  connected = true;
  emitted: { event: string; payload: any }[] = [];
  constructor(id: string) {
    super();
    this.id = id;
    this.setMaxListeners(50);
  }
  emit(event: string, ...args: any[]) {
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
    "answerReceived", "answerFeedback", "playerStats", "playerRenamed", "renameSuccess", "gameOver", "sessionError",
    "gameState", "muteChanged", "kicked",
  ].includes(event);
}

class FakeIO {
  sockets = { sockets: new Map<string, FakeSocket>() };
  private roomEmits: { room: string; event: string; payload: any }[] = [];
  private connectionHandlers: any[] = [];
  to(room: string) {
    const self = this;
    return {
      emit(event: string, payload: any) {
        self.roomEmits.push({ room, event, payload });
      },
    };
  }
  getRoomEmits() { return this.roomEmits; }
  on(_event: string, fn: any) { this.connectionHandlers.push(fn); }
  fireConnection(socket: FakeSocket) {
    for (const fn of this.connectionHandlers) fn(socket);
  }
}

let sessionCounter = 0;
let currentTestSessionId = "sess-1";
let currentTestPin = "123456";

function makeSession(overrides: Partial<any> = {}) {
  return {
    id: currentTestSessionId,
    pin: currentTestPin,
    status: "WAITING",
    isTest: false,
    quiz: { questions: [] },
    ...overrides,
  };
}

async function joinAs(socket: FakeSocket, playerName: string) {
  (prisma.session.findUnique as any).mockResolvedValue(makeSession());
  socket.emit("joinSession", { pin: currentTestPin, playerName });
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

const tick = async (n = 3) => {
  for (let i = 0; i < n; i++) await new Promise<void>((r) => setImmediate(r));
};

const QUESTION = {
  id: "q1",
  text: "Scegli i numeri pari",
  type: "MULTIPLE_CHOICE",
  options: {
    choices: [
      { text: "2", isCorrect: true },
      { text: "4", isCorrect: true },
      { text: "5", isCorrect: false },
      { text: "7", isCorrect: false },
    ],
  },
  timeLimit: 30,
  points: 1000,
  mediaUrl: null,
  order: 0,
  confidenceEnabled: false,
};

let io: FakeIO;

function newSocket(id: string) {
  const s = new FakeSocket(`${id}-${sessionCounter}`);
  io.sockets.sockets.set(s.id, s);
  io.fireConnection(s);
  return s;
}

async function join(s: FakeSocket, playerName: string, extra: Record<string, unknown> = {}) {
  s.emit("joinSession", { pin: currentTestPin, playerName, ...extra });
  await tick();
}

const tokenOf = (s: FakeSocket) =>
  s.emitted.find((e) => e.event === "gameState")?.payload.playerToken as string | undefined;

const errorsOf = (s: FakeSocket) =>
  s.emitted.filter((e) => e.event === "sessionError").map((e) => e.payload.message);

describe("live quiz: scores and reconnections", () => {
  let host: FakeSocket;
  let alice: FakeSocket;

  async function setup(question: any = QUESTION) {
    sessionCounter += 1;
    currentTestSessionId = `gara-${sessionCounter}`;
    currentTestPin = `pin-gara-${sessionCounter}`;
    io = new FakeIO();
    setupSocketHandlers(io as any);
    (prisma.session.findUnique as any).mockResolvedValue(
      makeSession({ status: "IN_PROGRESS", quiz: { questions: [question] } }),
    );
    host = newSocket("host");
    alice = newSocket("alice");
    await join(host, "__host__", { hostToken: createHostToken(currentTestSessionId) });
    await join(alice, "Alice");
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    (prisma.answer.findMany as any).mockResolvedValue([]);
    (prisma.answer.findUnique as any).mockResolvedValue(null);
    (prisma.session.update as any).mockResolvedValue({});
    await setup();
  });

  async function start() {
    host.emit("startGame");
    await tick();
  }

  async function finalResults() {
    host.emit("endGame");
    await tick(6);
    const over = io.getRoomEmits().find((e) => e.event === "gameOver")!;
    return over.payload.fullResults as { playerName: string; score: number }[];
  }
  const finalScore = async (name: string) =>
    (await finalResults()).find((r) => r.playerName === name)?.score;

  const rejoin = async (s: FakeSocket, token: string | undefined) => {
    s.emit("rejoinSession", { sessionId: currentTestSessionId, playerName: "Alice", playerToken: token });
    await tick(6);
  };

  describe("points", () => {
    it("an answer sent twice at once counts once", async () => {
      await start();
      alice.emit("submitAnswer", { value: { selected: [0, 1] } });
      alice.emit("submitAnswer", { value: { selected: [0, 1] } });
      await tick();
      expect(prisma.answer.create).toHaveBeenCalledTimes(1);
      const counts = io.getRoomEmits().filter((e) => e.event === "answerCount");
      expect(counts.at(-1)!.payload.count).toBe(1);
      expect(await finalScore("Alice")).toBeLessThanOrEqual(1000);
    });

    it("confidence sent many times at once is applied once", async () => {
      await setup({ ...QUESTION, confidenceEnabled: true });
      await start();
      alice.emit("submitAnswer", { value: { selected: [0, 1] } });
      await tick();
      (prisma.answer.findUnique as any).mockResolvedValue({ score: 1000, isCorrect: true, confidenceLevel: null });
      for (let i = 0; i < 5; i++) alice.emit("submitConfidence", { confidenceLevel: 3 });
      await tick();
      expect(prisma.answer.update).toHaveBeenCalledTimes(1);
      expect((prisma.answer.update as any).mock.calls[0][0].data.score).toBe(1200);
      expect(await finalScore("Alice")).toBe(1200);
    });

    it("confidence after re-entering from the join form keeps the answer's points", async () => {
      await setup({ ...QUESTION, confidenceEnabled: true });
      await start();
      const token = tokenOf(alice);
      alice.emit("submitAnswer", { value: { selected: [0, 1] } });
      await tick();
      (prisma.answer.findUnique as any).mockResolvedValue({ score: 1000, isCorrect: true, confidenceLevel: null });
      const back = newSocket("alice-back");
      await join(back, "Alice", { playerToken: token });
      back.emit("submitConfidence", { confidenceLevel: 3 });
      await tick();
      expect((prisma.answer.update as any).mock.calls[0][0].data.score).toBe(1200);
    });

    it("a wrong answer given as very sure costs 200 points of the total", async () => {
      const q2 = { ...QUESTION, id: "q2", order: 1, confidenceEnabled: true };
      // setup() loads a single question: build a game with two
      sessionCounter += 1;
      currentTestSessionId = `gara-${sessionCounter}`;
      currentTestPin = `pin-gara-${sessionCounter}`;
      io = new FakeIO();
      setupSocketHandlers(io as any);
      (prisma.session.findUnique as any).mockResolvedValue(
        makeSession({ status: "IN_PROGRESS", quiz: { questions: [QUESTION, q2] } }),
      );
      host = newSocket("host");
      alice = newSocket("alice");
      await join(host, "__host__", { hostToken: createHostToken(currentTestSessionId) });
      await join(alice, "Alice");
      await start();
      alice.emit("submitAnswer", { value: { selected: [0, 1] } }); // right: 1000
      await tick();
      host.emit("showResults");
      await tick(6);
      host.emit("nextQuestion");
      await tick();
      alice.emit("submitAnswer", { value: { selected: [2] } }); // wrong: 0
      await tick();
      (prisma.answer.findUnique as any).mockResolvedValue({ score: 0, isCorrect: false, confidenceLevel: null });
      alice.emit("submitConfidence", { confidenceLevel: 3 });
      await tick();
      expect((prisma.answer.update as any).mock.calls[0][0].data.score).toBe(-200);
      expect(await finalScore("Alice")).toBe(800);
    });

    it("the confidence malus never takes the total below zero", async () => {
      await setup({ ...QUESTION, confidenceEnabled: true });
      await start();
      alice.emit("submitAnswer", { value: { selected: [2] } });
      await tick();
      (prisma.answer.findUnique as any).mockResolvedValue({ score: 0, isCorrect: false, confidenceLevel: null });
      alice.emit("submitConfidence", { confidenceLevel: 3 });
      await tick();
      expect((prisma.answer.update as any).mock.calls[0][0].data.score).toBe(0);
      expect(await finalScore("Alice")).toBe(0);
    });

    it("an answer sent as soon as the reveal goes out is refused", async () => {
      await start();
      host.emit("showResults");
      for (let i = 0; i < 50 && !io.getRoomEmits().some((e) => e.event === "questionResult"); i++) {
        await Promise.resolve();
      }
      expect(io.getRoomEmits().some((e) => e.event === "questionResult")).toBe(true);
      alice.emit("submitAnswer", { value: { selected: [0, 1] } });
      await tick(6);
      expect(prisma.answer.create).not.toHaveBeenCalled();
    });

    it("a kicked player cannot come back with the old token", async () => {
      await start();
      const token = tokenOf(alice);
      host.emit("showResults");
      await tick(6);
      host.emit("kickPlayer", { playerName: "Alice" });
      await tick();
      (prisma.answer.findMany as any).mockResolvedValue([{ score: 500 }]);
      const back = newSocket("alice-back");
      await rejoin(back, token);
      expect(back.emitted.some((e) => e.event === "rejoinSuccess")).toBe(false);
    });
  });

  describe("reconnections", () => {
    it("the old socket closing late does not detach the reconnected player", async () => {
      await start();
      const alice2 = newSocket("alice-new");
      await rejoin(alice2, tokenOf(alice));
      alice.emit("disconnect");
      await tick();
      host.emit("showResults");
      await tick(6);
      expect(alice2.emitted.some((e) => e.event === "playerStats")).toBe(true);
    });

    it("coming back mid-question, the timer resumes from the time really left", async () => {
      await start();
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now + 10_000);
      const alice2 = newSocket("alice-new");
      await rejoin(alice2, tokenOf(alice));
      const q = alice2.emitted.find((e) => e.event === "questionStart")!;
      expect(q.payload.remainingSeconds).toBe(20);
    });

    it("coming back after the reveal without an answer, the closed question is not reopened", async () => {
      await start();
      host.emit("showResults");
      await tick(6);
      const alice2 = newSocket("alice-new");
      await rejoin(alice2, tokenOf(alice));
      expect(alice2.emitted.some((e) => e.event === "rejoinSuccess")).toBe(true);
      expect(alice2.emitted.some((e) => e.event === "questionStart")).toBe(false);
    });

    it("the host reloading after the reveal gets the question with no time left", async () => {
      await start();
      host.emit("showResults");
      await tick(6);
      const host2 = newSocket("host-new");
      await join(host2, "__host__", { hostToken: createHostToken(currentTestSessionId) });
      const q = host2.emitted.find((e) => e.event === "questionStart")!;
      expect(q.payload.remainingSeconds).toBe(0);
    });

    it("the final results include who answered and then stayed away", async () => {
      await start();
      (prisma.answer.findMany as any).mockResolvedValue([
        { playerName: "Bruno", score: 700 },
        { playerName: "Bruno", score: 200 },
        { playerName: "Alice", score: 999 },
      ]);
      const results = await finalResults();
      expect(results.find((r) => r.playerName === "Bruno")?.score).toBe(900);
      // Who is still in the game keeps the live score, counted once
      expect(results.filter((r) => r.playerName === "Alice")).toHaveLength(1);
      expect(results.find((r) => r.playerName === "Alice")?.score).toBe(0);
    });
  });
});
