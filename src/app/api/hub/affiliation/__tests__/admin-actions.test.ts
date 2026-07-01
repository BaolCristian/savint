import { describe, it, expect, vi, afterAll } from "vitest";
vi.mock("@/lib/auth/hub-session", () => ({ getHubSession: vi.fn() }));
vi.mock("@/lib/email/affiliation-emails", () => ({
  sendAffiliationCodeEmail: vi.fn(async () => undefined),
  sendAffiliationRejectEmail: vi.fn(async () => undefined),
}));
import { getHubSession } from "@/lib/auth/hub-session";
import { sendAffiliationCodeEmail } from "@/lib/email/affiliation-emails";
import { sendAffiliationRejectEmail } from "@/lib/email/affiliation-emails";
import { NextRequest } from "next/server";
import { POST as approveRoute } from "@/app/api/hub/affiliation/[id]/approve/route";
import { POST as rejectRoute } from "@/app/api/hub/affiliation/[id]/reject/route";
import { prisma } from "@/lib/db/client";

const mockSession = getHubSession as ReturnType<typeof vi.fn>;

afterAll(async () => {
  await prisma.affiliationRequest.deleteMany({ where: { schoolName: { in: ["IIS Adm", "IIS Rej"] } } });
  await prisma.installation.deleteMany({ where: { name: { in: ["IIS Adm", "IIS Rej"] } } });
});

describe("approve", () => {
  it("403 se non admin", async () => {
    mockSession.mockResolvedValue({ id: "u", role: "HUB_USER" });
    const res = await approveRoute(new NextRequest("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: "x" }) });
    expect(res.status).toBe(403);
  });

  it("admin approva → crea Installation + invia email", async () => {
    mockSession.mockResolvedValue({ id: "admin", role: "HUB_ADMIN" });
    const reqRow = await prisma.affiliationRequest.create({
      data: { schoolName: "IIS Adm", province: "UD", installationUrl: "https://q.adm.edu.it", contactEmail: "adm@test.edu.it", status: "PENDING_REVIEW", emailVerifiedAt: new Date() },
    });
    const res = await approveRoute(new NextRequest("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: reqRow.id }) });
    expect(res.status).toBe(200);
    const updated = await prisma.affiliationRequest.findUnique({ where: { id: reqRow.id } });
    expect(updated?.status).toBe("APPROVED");
    expect(updated?.installationId).toBeTruthy();
    expect(sendAffiliationCodeEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "adm@test.edu.it" }));
  });
});

describe("reject", () => {
  it("403 se non admin", async () => {
    mockSession.mockResolvedValue({ id: "u", role: "HUB_USER" });
    const res = await rejectRoute(new NextRequest("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: "x" }) });
    expect(res.status).toBe(403);
  });

  it("admin rifiuta PENDING_REVIEW → status REJECTED + email inviata", async () => {
    mockSession.mockResolvedValue({ id: "admin", role: "HUB_ADMIN" });
    const reqRow = await prisma.affiliationRequest.create({
      data: { schoolName: "IIS Rej", province: "UD", installationUrl: "https://q.rej.edu.it", contactEmail: "rej@test.edu.it", status: "PENDING_REVIEW", emailVerifiedAt: new Date() },
    });
    const res = await rejectRoute(
      new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify({ reason: "Dati incompleti" }), headers: { "content-type": "application/json" } }),
      { params: Promise.resolve({ id: reqRow.id }) },
    );
    expect(res.status).toBe(200);
    const updated = await prisma.affiliationRequest.findUnique({ where: { id: reqRow.id } });
    expect(updated?.status).toBe("REJECTED");
    expect(sendAffiliationRejectEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "rej@test.edu.it" }));
  });

  it("409 se stato non valido (già REJECTED o id inesistente)", async () => {
    mockSession.mockResolvedValue({ id: "admin", role: "HUB_ADMIN" });
    const res = await rejectRoute(new NextRequest("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: "non-existent-id" }) });
    expect(res.status).toBe(409);
  });
});
