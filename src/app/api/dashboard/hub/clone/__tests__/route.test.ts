import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import JSZip from "jszip";
import { createHash } from "crypto";
import { POST } from "@/app/api/dashboard/hub/clone/route";

const TEST_USER_ID = `clone-test-user-${Date.now()}`;

// Mock auth
vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(async () => ({ user: { id: TEST_USER_ID } })),
}));

// Mock fetchHubQuizDownload
const mockFetchHubQuizDownload = vi.fn();
vi.mock("@/lib/hub/hub-client", () => ({
  fetchHubQuizDownload: (...args: unknown[]) => mockFetchHubQuizDownload(...args),
  HubLinkMissingError: class HubLinkMissingError extends Error {
    constructor() { super("hub_link_missing"); }
  },
  HubReauthRequiredError: class HubReauthRequiredError extends Error {
    constructor() { super("hub_reauth_required"); }
  },
}));

async function makeQlzBase64(questionCount = 1): Promise<string> {
  const z = new JSZip();
  z.file(
    "manifest.json",
    JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      quiz: {
        title: "Cloned Quiz",
        description: "A cloned quiz",
        tags: ["math"],
        questions: Array.from({ length: questionCount }, (_, i) => ({
          type: "TRUE_FALSE",
          text: `Question ${i + 1}`,
          timeLimit: 20,
          points: 1000,
          confidenceEnabled: false,
          options: { correct: true },
        })),
      },
    }),
  );
  const buf = await z.generateAsync({ type: "nodebuffer" });
  return buf.toString("base64");
}

function makeReq(body: unknown) {
  return new Request("http://localhost/api/dashboard/hub/clone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("POST /api/dashboard/hub/clone", () => {
  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      create: { id: TEST_USER_ID, email: `clone-test-${Date.now()}@test.invalid` },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.quiz.deleteMany({ where: { authorId: TEST_USER_ID } });
    await prisma.user.delete({ where: { id: TEST_USER_ID } });
  });

  it("401 when not authenticated", async () => {
    const { auth } = await import("@/lib/auth/config");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValueOnce(null as any);
    const res = await POST(makeReq({ hubQuizId: "hq1" }));
    expect(res.status).toBe(401);
  });

  it("400 when hubQuizId missing", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_hubQuizId");
  });

  it("201 creates local quiz with hub attribution", async () => {
    const qlzBase64 = await makeQlzBase64(2);
    mockFetchHubQuizDownload.mockResolvedValueOnce({
      qlzBase64,
      hubQuizId: "hub-quiz-abc",
      hubAuthor: "Prof. Rossi",
      version: 3,
    });

    const res = await POST(makeReq({ hubQuizId: "hub-quiz-abc" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.localQuizId).toBeTruthy();

    const quiz = await prisma.quiz.findUnique({
      where: { id: body.localQuizId },
      include: { questions: { orderBy: { order: "asc" } } },
    });
    expect(quiz).toBeTruthy();
    expect(quiz!.title).toBe("Cloned Quiz");
    expect(quiz!.clonedFromHubId).toBe("hub-quiz-abc");
    expect(quiz!.clonedFromHubVersion).toBe(3);
    expect(quiz!.clonedFromHubAuthor).toBe("Prof. Rossi");
    expect(quiz!.questions.length).toBe(2);
    expect(quiz!.questions[0].confidenceEnabled).toBe(false);
  });

  it("409 when already cloned at same version", async () => {
    // First clone
    const qlzBase64 = await makeQlzBase64(1);
    mockFetchHubQuizDownload.mockResolvedValue({
      qlzBase64,
      hubQuizId: "hub-quiz-dedup",
      hubAuthor: "Author",
      version: 1,
    });

    const res1 = await POST(makeReq({ hubQuizId: "hub-quiz-dedup" }));
    expect(res1.status).toBe(201);
    const body1 = await res1.json();

    // Second clone same version → 409
    const res2 = await POST(makeReq({ hubQuizId: "hub-quiz-dedup" }));
    expect(res2.status).toBe(409);
    const body2 = await res2.json();
    expect(body2.error).toBe("already_cloned");
    expect(body2.localQuizId).toBe(body1.localQuizId);
  });
});
