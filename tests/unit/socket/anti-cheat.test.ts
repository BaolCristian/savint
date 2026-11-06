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

describe("live quiz anti-cheat", () => {
  let host: FakeSocket;
  let alice: FakeSocket;

  beforeEach(async () => {
    vi.clearAllMocks();
    (prisma.answer.findMany as any).mockResolvedValue([]);
    (prisma.answer.findUnique as any).mockResolvedValue(null);
    sessionCounter += 1;
    currentTestSessionId = `anti-${sessionCounter}`;
    currentTestPin = `pin-anti-${sessionCounter}`;
    io = new FakeIO();
    setupSocketHandlers(io as any);
    (prisma.session.findUnique as any).mockResolvedValue(
      makeSession({ status: "IN_PROGRESS", quiz: { questions: [QUESTION] } }),
    );
    (prisma.session.update as any).mockResolvedValue({});
    host = newSocket("host");
    alice = newSocket("alice");
    await join(host, "__host__", { hostToken: createHostToken(currentTestSessionId) });
    await join(alice, "Alice");
  });

  async function start() {
    host.emit("startGame");
    await tick();
  }

  describe("host identity", () => {
    it("joining as __host__ without the token is refused", async () => {
      const intruder = newSocket("intruder");
      await join(intruder, "__host__");
      expect(errorsOf(intruder)).toContain("hostAuthFailed");
      await join(intruder, "__host__", { hostToken: "f".repeat(64) });
      expect(errorsOf(intruder).filter((m) => m === "hostAuthFailed")).toHaveLength(2);
      expect(intruder.emitted.find((e) => e.event === "gameState")).toBeUndefined();
    });

    it("a student cannot start, advance, reveal or end the game", async () => {
      alice.emit("startGame");
      await tick();
      expect(prisma.session.update).not.toHaveBeenCalled();

      await start();
      for (const cmd of ["showResults", "nextQuestion", "endGame"]) alice.emit(cmd);
      await tick();
      expect(io.getRoomEmits().some((e) => e.event === "questionResult")).toBe(false);
      expect(io.getRoomEmits().some((e) => e.event === "gameOver")).toBe(false);
      expect(prisma.session.update).toHaveBeenCalledTimes(1); // only the host's start
    });
  });

  describe("answers", () => {
    it("an answer sent after the host revealed the results is ignored", async () => {
      const bob = newSocket("bob");
      await join(bob, "Bob");
      await start();
      host.emit("showResults");
      await tick();

      bob.emit("submitAnswer", { value: { selected: [0, 1] } });
      await tick();
      expect(prisma.answer.create).not.toHaveBeenCalled();
    });

    it("repeating a correct choice does not multiply the points", async () => {
      await start();
      alice.emit("submitAnswer", { value: { selected: [0, 0, 0, 0, 1, 1] } });
      await tick();
      const score = (prisma.answer.create as any).mock.calls[0][0].data.score;
      expect(score).toBeLessThanOrEqual(QUESTION.points);
      expect(score).toBeGreaterThan(0);
    });

    it("a malformed answer is ignored without breaking the game", async () => {
      await start();
      alice.emit("submitAnswer", { value: null });
      await tick();
      expect(prisma.answer.create).not.toHaveBeenCalled();
      alice.emit("submitAnswer", { value: { selected: [0, 1] } });
      await tick();
      expect(prisma.answer.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("player identity", () => {
    it("rejoining needs the player's token", async () => {
      const token = tokenOf(alice);
      expect(token).toMatch(/^[0-9a-f]{32}$/);

      const thief = newSocket("thief");
      thief.emit("rejoinSession", { sessionId: currentTestSessionId, playerName: "Alice" });
      await tick();
      thief.emit("rejoinSession", { sessionId: currentTestSessionId, playerName: "Alice", playerToken: "nope" });
      await tick();
      expect(thief.emitted.find((e) => e.event === "rejoinSuccess")).toBeUndefined();
      expect(errorsOf(thief)).toEqual(["Session not found or expired", "Session not found or expired"]);

      const back = newSocket("alice-back");
      back.emit("rejoinSession", { sessionId: currentTestSessionId, playerName: "Alice", playerToken: token });
      await tick();
      expect(back.emitted.find((e) => e.event === "rejoinSuccess")).toBeDefined();
    });

    it("mid-game, a classmate's name cannot be taken without the token", async () => {
      const token = tokenOf(alice);
      await start();
      alice.connected = false;
      alice.emit("disconnect");
      await tick();

      const thief = newSocket("thief");
      await join(thief, "Alice");
      expect(errorsOf(thief)).toContain("Name already taken");

      const back = newSocket("alice-back");
      await join(back, "Alice", { playerToken: token });
      expect(errorsOf(back)).toEqual([]);
      expect(tokenOf(back)).toBe(token);
    });

    it("renaming onto a name already used in the game is refused", async () => {
      const bob = newSocket("bob");
      await join(bob, "Bob");
      bob.connected = false;
      bob.emit("disconnect");
      await tick();

      alice.emit("renamePlayer", { newName: "Bob" });
      await tick();
      expect(errorsOf(alice)).toContain("nameAlreadyTaken");
    });
  });

  describe("changeAvatar", () => {
    it("broadcasts the new picture to the room", async () => {
      alice.emit("changeAvatar", { avatar: "🦊" });
      await tick();
      const ev = io.getRoomEmits().find((e) => e.event === "playerRenamed");
      expect(ev?.payload).toEqual({ oldName: "Alice", newName: "Alice", playerAvatar: "🦊" });
    });

    it("accepts the custom images and ignores anything else", async () => {
      alice.emit("changeAvatar", { avatar: "/emoticons/emo3.png" });
      for (const bad of ["/emoticons/../../etc/passwd", "<img src=x>", "x".repeat(200), 42]) {
        alice.emit("changeAvatar", { avatar: bad });
      }
      await tick();
      const evs = io.getRoomEmits().filter((e) => e.event === "playerRenamed");
      expect(evs.map((e) => e.payload.playerAvatar)).toEqual(["/emoticons/emo3.png"]);
    });
  });

  describe("ending early and cancelling", () => {
    it("the host can end the game in the middle of a question", async () => {
      await start();
      host.emit("endGame");
      await tick();
      expect(io.getRoomEmits().some((e) => e.event === "gameOver")).toBe(true);
    });

    it("cancelGame deletes the session and its answers and tells the room", async () => {
      await start();
      host.emit("cancelGame");
      await tick();
      expect(prisma.answer.deleteMany).toHaveBeenCalledWith({ where: { sessionId: currentTestSessionId } });
      expect(prisma.session.delete).toHaveBeenCalledWith({ where: { id: currentTestSessionId } });
      expect(io.getRoomEmits().some((e) => e.event === "gameCancelled")).toBe(true);

      // The game is gone: later commands do nothing
      alice.emit("submitAnswer", { value: { selected: [0] } });
      await tick();
      expect(prisma.answer.create).not.toHaveBeenCalled();
    });

    it("a student cannot cancel the game", async () => {
      await start();
      alice.emit("cancelGame");
      await tick();
      expect(prisma.session.delete).not.toHaveBeenCalled();
      expect(io.getRoomEmits().some((e) => e.event === "gameCancelled")).toBe(false);
    });
  });
});
