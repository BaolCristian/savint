import { describe, it, expect, vi, afterAll } from "vitest";
vi.mock("@/lib/email/affiliation-emails", () => ({ sendAffiliationVerifyEmail: vi.fn(async () => undefined) }));
import { NextRequest } from "next/server";
import { POST } from "@/app/api/hub/affiliation/request/route";
import { GET } from "@/app/api/hub/affiliation/verify/route";
import { prisma } from "@/lib/db/client";
import { resetRateLimitsByPrefix } from "@/lib/rate-limit/hub-rate-limit";
import { sendAffiliationVerifyEmail } from "@/lib/email/affiliation-emails";

afterAll(async () => {
  await prisma.affiliationRequest.deleteMany({ where: { contactEmail: "req@test.edu.it" } });
  await resetRateLimitsByPrefix("affiliation-request:");
});

const validBody = {
  schoolName: "IIS Req",
  province: "UD",
  installationUrl: "https://quiz.req.edu.it",
  contactEmail: "req@test.edu.it",
};

function makePostReq(body: unknown, ip = "1.2.3.4") {
  return new NextRequest("http://localhost/api/hub/affiliation/request", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "x-forwarded-for": ip },
  });
}

it("crea una richiesta (201)", async () => {
  const req = makePostReq(validBody);
  const res = await POST(req);
  expect(res.status).toBe(201);
  const saved = await prisma.affiliationRequest.findFirst({ where: { contactEmail: "req@test.edu.it" } });
  expect(saved?.status).toBe("PENDING_EMAIL");
  expect(sendAffiliationVerifyEmail).toHaveBeenCalledOnce();
});

it("restituisce 400 per input non valido", async () => {
  const req = makePostReq({ schoolName: "", contactEmail: "not-an-email" }, "2.2.2.2");
  const res = await POST(req);
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toBe("invalid_input");
});

it("restituisce 400 per body non JSON", async () => {
  const req = new NextRequest("http://localhost/api/hub/affiliation/request", {
    method: "POST",
    body: "not json",
    headers: { "x-forwarded-for": "3.3.3.3" },
  });
  const res = await POST(req);
  expect(res.status).toBe(400);
});

it("rate-limita dopo 5 richieste dallo stesso IP", async () => {
  const ip = "9.9.9.9";
  // First 5 may succeed or fail on validation — we just need to exhaust the window
  for (let i = 0; i < 5; i++) {
    await POST(makePostReq(validBody, ip));
  }
  const res = await POST(makePostReq(validBody, ip));
  expect(res.status).toBe(429);
  const body = await res.json();
  expect(body.error).toBe("rate_limited");
});

describe("verify route", () => {
  it("redirige a /affiliazione?error=invalid per token invalido", async () => {
    const req = new NextRequest("http://localhost/api/hub/affiliation/verify?token=badtoken");
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/affiliazione?error=invalid");
  });

  it("verifica un token valido e porta lo stato a PENDING_REVIEW", async () => {
    // Create a fresh request to get a real token
    const { createRequest } = await import("@/lib/hub/affiliation");
    const { request, emailToken } = await createRequest({
      schoolName: "IIS Verify",
      province: "UD",
      installationUrl: "https://quiz.verify.edu.it",
      contactEmail: "req@test.edu.it",
    });
    const req = new NextRequest(`http://localhost/api/hub/affiliation/verify?token=${emailToken}`);
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/affiliazione?verified=1");
    const updated = await prisma.affiliationRequest.findUnique({ where: { id: request.id } });
    expect(updated?.status).toBe("PENDING_REVIEW");
  });
});
