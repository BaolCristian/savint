import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";

const TEST_ADMIN_ID = `connect-test-admin-${Date.now()}`;
const TEST_TEACHER_ID = `connect-test-teacher-${Date.now()}`;

// Mock auth — will be overridden per-test
vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(),
}));

beforeAll(async () => {
  // Create real users so prisma.user.findUnique for role check works
  await prisma.user.createMany({
    data: [
      { id: TEST_ADMIN_ID, email: `connect-admin-${Date.now()}@test.invalid`, role: "ADMIN" },
      { id: TEST_TEACHER_ID, email: `connect-teacher-${Date.now()}@test.invalid`, role: "TEACHER" },
    ],
  });
});

afterAll(async () => {
  await prisma.hubConfig.deleteMany({ where: { id: "singleton" } });
  await prisma.user.deleteMany({ where: { id: { in: [TEST_ADMIN_ID, TEST_TEACHER_ID] } } });
});

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/installation/hub/connect", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/installation/hub/connect", () => {
  it("401 quando non autenticato", async () => {
    const { auth } = await import("@/lib/auth/config");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(auth).mockResolvedValueOnce(null as any);

    const { POST } = await import("@/app/api/installation/hub/connect/route");
    const res = await POST(makeReq({ setupCode: "code123" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("403 quando utente non è ADMIN", async () => {
    const { auth } = await import("@/lib/auth/config");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: TEST_TEACHER_ID } } as never);

    const { POST } = await import("@/app/api/installation/hub/connect/route");
    const res = await POST(makeReq({ setupCode: "code123" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });

  it("200 e upsert HubConfig quando ADMIN e redeem ok", async () => {
    const { auth } = await import("@/lib/auth/config");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: TEST_ADMIN_ID } } as never);

    const fakeCreds = {
      clientId: "inst_testclientid",
      clientSecret: "supersecret123",
      hubUrl: "https://savint.it",
    };

    // Mock global.fetch for the redeem call
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => fakeCreds,
    } as Response);

    const { POST } = await import("@/app/api/installation/hub/connect/route");
    const res = await POST(makeReq({ setupCode: "validcode123" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.hubUrl).toBe(fakeCreds.hubUrl);

    // Verify HubConfig was upserted in the real DB
    const saved = await prisma.hubConfig.findUnique({ where: { id: "singleton" } });
    expect(saved?.clientId).toBe(fakeCreds.clientId);
    expect(saved?.clientSecret).toBe(fakeCreds.clientSecret);
    expect(saved?.hubUrl).toBe(fakeCreds.hubUrl);

    fetchSpy.mockRestore();
  });

  it("400 se setupCode mancante", async () => {
    const { auth } = await import("@/lib/auth/config");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: TEST_ADMIN_ID } } as never);

    const { POST } = await import("@/app/api/installation/hub/connect/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_code");
  });

  it("400 se il redeem remoto fallisce", async () => {
    const { auth } = await import("@/lib/auth/config");
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: TEST_ADMIN_ID } } as never);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "invalid_code" }),
    } as Response);

    const { POST } = await import("@/app/api/installation/hub/connect/route");
    const res = await POST(makeReq({ setupCode: "badcode" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_code");

    fetchSpy.mockRestore();
  });
});
