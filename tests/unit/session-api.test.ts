import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    session: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: any) => ({ id: "s1", ...data })),
      findMany: vi.fn(),
    },
    quiz: {
      findUnique: vi.fn().mockResolvedValue({
        id: "q1",
        authorId: "u1",
        isPublic: false,
        suspended: false,
      }),
    },
  },
}));

vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "u1" } }),
}));

import { POST, GET } from "@/app/api/session/route";
import { prisma } from "@/lib/db/client";

function req(body: any) {
  return new Request("http://x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("POST /api/session", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a normal session with isTest=false by default", async () => {
    const res = await POST(req({ quizId: "q1" }));
    expect(res.status).toBe(201);
    const createCall = (prisma.session.create as any).mock.calls[0][0];
    expect(createCall.data.isTest).toBe(false);
  });

  it("creates a test session when isTest=true", async () => {
    const res = await POST(req({ quizId: "q1", isTest: true }));
    expect(res.status).toBe(201);
    const createCall = (prisma.session.create as any).mock.calls[0][0];
    expect(createCall.data.isTest).toBe(true);
  });
});

describe("GET /api/session", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters out isTest sessions from listing", async () => {
    (prisma.session.findMany as any).mockResolvedValue([]);
    await GET();
    const whereArg = (prisma.session.findMany as any).mock.calls[0][0].where;
    expect(whereArg.isTest).toBe(false);
  });
});
