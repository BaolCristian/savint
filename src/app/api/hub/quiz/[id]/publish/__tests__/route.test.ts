import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { POST, DELETE } from "@/app/api/hub/quiz/[id]/publish/route";

// Mock auth so we can control the session
vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(async () => ({ user: { id: "proxy-test-user" } })),
}));

// Mock fetchWithTokenRefresh so tests don't hit a real hub
vi.mock("@/lib/hub/hub-client", () => ({
  fetchWithTokenRefresh: vi.fn(),
  HubLinkMissingError: class HubLinkMissingError extends Error {
    constructor() { super("hub_link_missing"); }
  },
  HubReauthRequiredError: class HubReauthRequiredError extends Error {
    constructor() { super("hub_reauth_required"); }
  },
  getAuthorizeUrl: vi.fn((quizId?: string) => `/api/hub/oauth/start?quizId=${quizId ?? ""}`),
}));

const USER_ID = "proxy-test-user";

function makePostReq(quizId: string, overrides: Record<string, unknown> = {}) {
  return {
    request: new Request(`http://localhost/api/hub/quiz/${quizId}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(overrides),
    }) as never,
    params: Promise.resolve({ id: quizId }),
  };
}

function makeDeleteReq(quizId: string) {
  return {
    request: new Request(`http://localhost/api/hub/quiz/${quizId}/publish`, {
      method: "DELETE",
    }) as never,
    params: Promise.resolve({ id: quizId }),
  };
}

describe("POST /api/hub/quiz/:id/publish", () => {
  let quizId: string;
  let quizWithHubId: string;

  beforeAll(async () => {
    await prisma.user.upsert({
      where: { id: USER_ID },
      create: { id: USER_ID, email: `proxy-test-${Date.now()}@test.invalid` },
      update: {},
    });

    // Create a quiz with required metadata for publish
    const quiz = await prisma.quiz.create({
      data: {
        authorId: USER_ID,
        title: "Proxy Test Quiz",
        description: "A test",
        schoolLevel: "SECONDARIA_I",
        subject: "matematica",
        language: "it",
        tags: ["test"],
        questions: {
          create: [
            {
              type: "TRUE_FALSE",
              text: "Is this true?",
              timeLimit: 20,
              points: 1000,
              order: 0,
              confidenceEnabled: false,
              options: { correct: true },
            },
          ],
        },
      },
    });
    quizId = quiz.id;

    // Create a quiz that is already published on the hub
    const quiz2 = await prisma.quiz.create({
      data: {
        authorId: USER_ID,
        title: "Already Published Quiz",
        schoolLevel: "PRIMARIA",
        subject: "italiano",
        language: "it",
        hubPublishedId: "existing-hub-quiz-id",
        questions: {
          create: [
            {
              type: "TRUE_FALSE",
              text: "Already published question?",
              timeLimit: 15,
              points: 500,
              order: 0,
              confidenceEnabled: false,
              options: { correct: false },
            },
          ],
        },
      },
    });
    quizWithHubId = quiz2.id;
  });

  afterAll(async () => {
    await prisma.quiz.deleteMany({ where: { authorId: USER_ID } });
    await prisma.user.deleteMany({ where: { id: USER_ID } });
  });

  it("happy publish: forwards to hub and updates quiz record", async () => {
    const { fetchWithTokenRefresh } = await import("@/lib/hub/hub-client");
    const mockFetch = fetchWithTokenRefresh as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          hubQuizId: "new-hub-quiz-id",
          version: 1,
          publishedAt: new Date().toISOString(),
          url: "https://hub.example/q/new-hub-quiz-id",
        }),
        { status: 201 },
      ),
    );

    const { request, params } = makePostReq(quizId);
    const res = await POST(request, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hubQuizId).toBe("new-hub-quiz-id");
    expect(body.version).toBe(1);

    // Verify quiz was updated in DB
    const updated = await prisma.quiz.findUnique({ where: { id: quizId } });
    expect(updated?.hubPublishedId).toBe("new-hub-quiz-id");
    expect(updated?.hubLastPublishedAt).toBeTruthy();
  });

  it("reauth-required: returns 401 with reauthUrl", async () => {
    const hubClientModule = await import("@/lib/hub/hub-client");
    const mockFetch = hubClientModule.fetchWithTokenRefresh as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValueOnce(new hubClientModule.HubReauthRequiredError());

    const { request, params } = makePostReq(quizId);
    const res = await POST(request, { params });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("reauth_required");
    expect(body.reauthUrl).toContain("/api/hub/oauth/start");
  });

  it("re-publish with If-Match: sends If-Match header when hubPublishedId set", async () => {
    const { fetchWithTokenRefresh } = await import("@/lib/hub/hub-client");
    const mockFetch = fetchWithTokenRefresh as ReturnType<typeof vi.fn>;

    let capturedInit: RequestInit | undefined;
    mockFetch.mockImplementationOnce(async (_userId: string, _path: string, init: RequestInit) => {
      capturedInit = init;
      return new Response(
        JSON.stringify({
          hubQuizId: "existing-hub-quiz-id",
          version: 2,
          publishedAt: new Date().toISOString(),
          url: "https://hub.example/q/existing-hub-quiz-id",
        }),
        { status: 200 },
      );
    });

    const { request, params } = makePostReq(quizWithHubId);
    const res = await POST(request, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe(2);

    // Check If-Match header was sent
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers?.["If-Match"]).toBe("existing-hub-quiz-id");
  });

  it("DELETE unpublish: clears hub fields in DB", async () => {
    // First set hubPublishedId on the quiz for this test
    await prisma.quiz.update({
      where: { id: quizId },
      data: { hubPublishedId: "hub-id-to-delete" },
    });

    const { fetchWithTokenRefresh } = await import("@/lib/hub/hub-client");
    const mockFetch = fetchWithTokenRefresh as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const { request, params } = makeDeleteReq(quizId);
    const res = await DELETE(request, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Verify hub fields cleared
    const updated = await prisma.quiz.findUnique({ where: { id: quizId } });
    expect(updated?.hubPublishedId).toBeNull();
    expect(updated?.hubLastPublishedAt).toBeNull();
    expect(updated?.hubAccountId).toBeNull();
  });
});
