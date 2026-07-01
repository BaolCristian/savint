import { describe, it, expect, vi, afterAll } from "vitest";
vi.mock("@/lib/auth/hub-session", () => ({ getHubSession: vi.fn() }));
vi.mock("@/lib/email/affiliation-emails", () => ({ sendAffiliationCodeEmail: vi.fn(async () => undefined), sendAffiliationRejectEmail: vi.fn(async () => undefined) }));
import { getHubSession } from "@/lib/auth/hub-session";
import { NextRequest } from "next/server";
import { POST as approveRoute } from "@/app/api/hub/affiliation/[id]/approve/route";
import { prisma } from "@/lib/db/client";

const mockSession = getHubSession as ReturnType<typeof vi.fn>;
afterAll(async () => { await prisma.affiliationRequest.deleteMany({ where: { schoolName: "IIS Adm" } }); await prisma.installation.deleteMany({ where: { name: "IIS Adm" } }); });

it("403 se non admin", async () => {
  mockSession.mockResolvedValue({ id: "u", role: "HUB_USER" });
  const res = await approveRoute(new NextRequest("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: "x" }) });
  expect(res.status).toBe(403);
});

it("admin approva → crea Installation", async () => {
  mockSession.mockResolvedValue({ id: "admin", role: "HUB_ADMIN" });
  const reqRow = await prisma.affiliationRequest.create({ data: { schoolName: "IIS Adm", province: "UD", installationUrl: "https://q.adm.edu.it", contactEmail: "adm@test.edu.it", status: "PENDING_REVIEW", emailVerifiedAt: new Date() } });
  const res = await approveRoute(new NextRequest("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: reqRow.id }) });
  expect(res.status).toBe(200);
  const updated = await prisma.affiliationRequest.findUnique({ where: { id: reqRow.id } });
  expect(updated?.status).toBe("APPROVED");
  expect(updated?.installationId).toBeTruthy();
});
