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
  emitted: { event: string; payload: unknown }[] = [];
  constructor(id: string) {
    super();
    this.id = id;
    this.setMaxListeners(50);
  }
  emit(event: string, ...args: unknown[]) {
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
    "gameState", "muteChanged", "kicked", "playerRenamed", "renameSuccess",
  ].includes(event);
}

type RoomPayload = { playerName?: string; playerCount?: number };

class FakeIO {
  sockets = { sockets: new Map<string, FakeSocket>() };
  private roomEmits: { room: string; event: string; payload: RoomPayload }[] = [];
  private connectionHandlers: ((socket: FakeSocket) => void)[] = [];
  to(room: string) {
    return {
      emit: (event: string, payload: RoomPayload) => {
        this.roomEmits.push({ room, event, payload });
      },
    };
  }
  getRoomEmits() { return this.roomEmits; }
  on(_event: string, fn: (socket: FakeSocket) => void) { this.connectionHandlers.push(fn); }
  fireConnection(socket: FakeSocket) {
    for (const fn of this.connectionHandlers) fn(socket);
  }
}

let counter = 0;
let sessionId = "riservato-0";
let pin = "pin-riservato-0";

const tick = () => new Promise<void>((r) => setImmediate(r));

function joinEvents(io: FakeIO) {
  return io
    .getRoomEmits()
    .filter((e) => e.event === "playerJoined" || e.event === "playerReconnected");
}

describe("live quiz: the host's reserved name cannot be taken by a player", () => {
  let io: FakeIO;
  let hostSocket: FakeSocket;

  function newSocket(label: string) {
    const s = new FakeSocket(`${label}-${counter}`);
    io.sockets.sockets.set(s.id, s);
    io.fireConnection(s);
    return s;
  }

  async function join(socket: FakeSocket, playerName: unknown, hostToken?: string) {
    socket.emit("joinSession", { pin, playerName, hostToken });
    await tick();
    await tick();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    counter += 1;
    sessionId = `riservato-${counter}`;
    pin = `pin-riservato-${counter}`;
    io = new FakeIO();
    setupSocketHandlers(io as unknown as Parameters<typeof setupSocketHandlers>[0]);
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: sessionId,
      pin,
      status: "WAITING",
      isTest: false,
      quiz: { questions: [] },
    } as never);
    hostSocket = newSocket("host");
    await join(hostSocket, "__host__", createHostToken(sessionId));
    io.getRoomEmits().length = 0;
  });

  it.each([
    ["leading space", " __host__"],
    ["trailing space", "__host__ "],
    ["tab and newline", "\t__host__\n"],
    ["non-string value", ["__host__"]],
  ])("a join with the reserved name (%s) and no host token is rejected", async (_label, name) => {
    const intruder = newSocket("intruder");
    await join(intruder, name);

    expect(intruder.emitted).toContainEqual({
      event: "sessionError",
      payload: { message: "invalidName" },
    });
    // Never entered the game: no join broadcast, not in the room
    expect(joinEvents(io)).toEqual([]);
    expect(intruder.rooms.size).toBe(0);
  });

  it("the legitimate host join (exact name + valid token) still works", async () => {
    const host2 = newSocket("host2");
    await join(host2, "__host__", createHostToken(sessionId));

    expect(host2.emitted.find((e) => e.event === "sessionError")).toBeUndefined();
    expect(joinEvents(io).map((e) => e.payload.playerName)).toEqual(["__host__"]);
    expect(host2.rooms.size).toBe(1);
  });

  it("an ordinary player name still joins", async () => {
    const alice = newSocket("alice");
    await join(alice, "  Alice ");

    expect(alice.emitted.find((e) => e.event === "sessionError")).toBeUndefined();
    const joined = joinEvents(io);
    expect(joined.map((e) => e.payload.playerName)).toEqual(["Alice"]);
    expect(joined[0].payload.playerCount).toBe(1);
  });

  it("renaming to the reserved name is rejected", async () => {
    const alice = newSocket("alice");
    await join(alice, "Alice");
    io.getRoomEmits().length = 0;

    for (const newName of [" __host__", "__host__\t"]) {
      alice.emitted = [];
      alice.emit("renamePlayer", { newName });
      await tick();
      expect(alice.emitted).toContainEqual({
        event: "sessionError",
        payload: { message: "nameRemoved" },
      });
    }
    expect(io.getRoomEmits().filter((e) => e.event === "playerRenamed")).toEqual([]);
  });
});
