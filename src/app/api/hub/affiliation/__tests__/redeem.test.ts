import { describe, it, expect, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/hub/affiliation/redeem/route";
import { createRequest, verifyEmail, approve } from "@/lib/hub/affiliation";
import { prisma } from "@/lib/db/client";
import { resetRateLimitsByPrefix } from "@/lib/rate-limit/hub-rate-limit";

afterAll(async () => {
  await prisma.affiliationRequest.deleteMany({ where: { contactEmail: { endsWith: "@redeem.test.edu.it" } } });
  await prisma.installation.deleteMany({ where: { contactEmail: { endsWith: "@redeem.test.edu.it" } } });
  await resetRateLimitsByPrefix("affiliation-redeem:");
});

function makeRedeemReq(body: unknown, ip = "1.2.3.4") {
  return new NextRequest("http://localhost/api/hub/affiliation/redeem", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
  });
}

async function buildApprovedSetupCode(emailSuffix: string) {
  const { request, emailToken } = await createRequest({
    schoolName: `IIS Redeem ${emailSuffix}`,
    province: "UD",
    installationUrl: `https://quiz.${emailSuffix}.edu.it`,
    contactEmail: `${emailSuffix}@redeem.test.edu.it`,
  });
  await verifyEmail(emailToken);
  const result = await approve(request.id, "admin");
  if (!result.ok) throw new Error("approve failed");
  return result.setupCode;
}

describe("POST /api/hub/affiliation/redeem", () => {
  it("400 se setupCode mancante", async () => {
    const res = await POST(makeRedeemReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_code");
  });

  it("400 se setupCode non valido (inesistente)", async () => {
    const res = await POST(makeRedeemReq({ setupCode: "invalidcode123" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_code");
  });

  it("200 con credenziali e hubUrl su codice valido", async () => {
    const setupCode = await buildApprovedSetupCode("valid");
    const res = await POST(makeRedeemReq({ setupCode }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientId).toMatch(/^inst_/);
    expect(typeof body.clientSecret).toBe("string");
    expect(body.clientSecret.length).toBeGreaterThan(0);
    expect(typeof body.hubUrl).toBe("string");
    expect(body.hubUrl).not.toMatch(/\/$/);
  });

  it("400 al secondo tentativo di redeem dello stesso codice (single-use)", async () => {
    const setupCode = await buildApprovedSetupCode("singleuse");
    // First redeem succeeds
    const res1 = await POST(makeRedeemReq({ setupCode }));
    expect(res1.status).toBe(200);
    // Second redeem must fail
    const res2 = await POST(makeRedeemReq({ setupCode }));
    expect(res2.status).toBe(400);
    const body2 = await res2.json();
    expect(body2.error).toBe("invalid_code");
  });
});
