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
    "answerFeedback", "playerStats", "gameOver", "sessionError",
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

async function joinAs(socket: FakeSocket, playerName: string) {
  (prisma.session.findUnique as any).mockResolvedValue(makeSession());
  socket.emit("joinSession", { pin: "123456", playerName });
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
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
    setupSocketHandlers(io as any);
    io.fireConnection(hostSocket);
    io.fireConnection(playerSocket);
  });

  it("rejects a join when the nickname is present in kickedNames", async () => {
    await joinAs(hostSocket, "__host__");
    await joinAs(playerSocket, "Alice");

    hostSocket.emit("kickPlayer", { playerName: "Alice" });
    await new Promise((r) => setImmediate(r));

    const retrySocket = new FakeSocket("player-2");
    io.sockets.sockets.set(retrySocket.id, retrySocket);
    io.fireConnection(retrySocket);
    await joinAs(retrySocket, "Alice");

    const err = retrySocket.emitted.find((e) => e.event === "sessionError");
    expect(err?.payload.message).toBe("nicknameKicked");
  });
});
