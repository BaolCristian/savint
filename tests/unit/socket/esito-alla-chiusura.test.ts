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
import { createHostToken } from "@/lib/socket/host-token";

process.env.AUTH_SECRET = "test-secret-live-host";
import { prisma } from "@/lib/db/client";

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
    "answerReceived", "answerFeedback", "playerStats", "gameOver", "sessionError",
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

const tick = () => new Promise<void>((r) => setImmediate(r));

const QUESTION = {
  id: "q1",
  text: "2+2?",
  type: "MULTIPLE_CHOICE",
  options: { choices: [{ text: "4", isCorrect: true }, { text: "5", isCorrect: false }] },
  timeLimit: 30,
  points: 1000,
  mediaUrl: null,
  order: 0,
  confidenceEnabled: true,
};

describe("live quiz: outcome revealed only when the host shows the answer", () => {
  let io: FakeIO;
  let hostSocket: FakeSocket;
  let playerSocket: FakeSocket;

  beforeEach(async () => {
    vi.clearAllMocks();
    sessionCounter += 1;
    currentTestSessionId = `esito-${sessionCounter}`;
    currentTestPin = `pin-esito-${sessionCounter}`;
    io = new FakeIO();
    hostSocket = new FakeSocket(`host-${sessionCounter}`);
    playerSocket = new FakeSocket(`player-${sessionCounter}`);
    io.sockets.sockets.set(hostSocket.id, hostSocket);
    io.sockets.sockets.set(playerSocket.id, playerSocket);
    setupSocketHandlers(io as any);
    io.fireConnection(hostSocket);
    io.fireConnection(playerSocket);

    (prisma.session.findUnique as any).mockResolvedValue(
      makeSession({ status: "IN_PROGRESS", quiz: { questions: [QUESTION] } }),
    );
    for (const [s, name] of [[hostSocket, "__host__"], [playerSocket, "Alice"]] as const) {
      s.emit("joinSession", {
        pin: currentTestPin,
        playerName: name,
        hostToken: createHostToken(currentTestSessionId),
      });
      await tick();
      await tick();
    }
    (prisma.session.update as any).mockResolvedValue({});
    hostSocket.emit("startGame");
    await tick();
    playerSocket.emitted = [];
  });

  it("after answering, the player gets only a receipt — no right/wrong, no points", async () => {
    playerSocket.emit("submitAnswer", { value: [0] });
    await tick();
    await tick();

    const events = playerSocket.emitted.map((e) => e.event);
    expect(events).toContain("answerReceived");
    expect(events).not.toContain("answerFeedback");
    const receipt = playerSocket.emitted.find((e) => e.event === "answerReceived")!;
    expect(receipt.payload).toEqual({ confidenceEnabled: true });

    // Confidence while the question is open: still no outcome
    (prisma.answer.findUnique as any).mockResolvedValueOnce({ confidenceLevel: null });
    playerSocket.emit("submitConfidence", { confidenceLevel: 3 });
    await tick();
    await tick();
    expect(playerSocket.emitted.map((e) => e.event)).not.toContain("answerFeedback");
  });

  it("showResults sends each player their own outcome", async () => {
    playerSocket.emit("submitAnswer", { value: [0] });
    await tick();
    await tick();

    (prisma.answer.findMany as any).mockResolvedValue([
      { value: [0], isCorrect: true, playerName: "Alice", score: 900, questionId: "q1", responseTimeMs: 100 },
    ]);
    hostSocket.emit("showResults");
    await tick();
    await tick();
    await tick();

    const feedback = playerSocket.emitted.find((e) => e.event === "answerFeedback");
    expect(feedback?.payload).toMatchObject({ isCorrect: true, score: 900, classCorrectPercent: 100 });
  });

  it("confidence sent after the answer is revealed is ignored", async () => {
    playerSocket.emit("submitAnswer", { value: [1] });
    await tick();
    await tick();
    (prisma.answer.findMany as any).mockResolvedValue([]);
    hostSocket.emit("showResults");
    await tick();
    await tick();
    await tick();

    (prisma.answer.update as any).mockClear();
    (prisma.answer.findUnique as any).mockResolvedValue({ confidenceLevel: null });
    playerSocket.emit("submitConfidence", { confidenceLevel: 3 });
    await tick();
    await tick();
    expect(prisma.answer.update).not.toHaveBeenCalled();
  });
});
