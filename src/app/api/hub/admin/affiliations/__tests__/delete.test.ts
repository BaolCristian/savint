import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db/client";
vi.mock("@/lib/auth/hub-session", () => ({ getHubSession: vi.fn() }));
import { DELETE } from "../[id]/route";
import { getHubSession } from "@/lib/auth/hub-session";
import { NextRequest } from "next/server";

const rid = () => Math.random().toString(36).slice(2);
const req = () => new NextRequest("http://localhost/x", { method: "DELETE" });
const p = (id: string) => ({ params: Promise.resolve({ id }) });
const accIds: string[] = [];

async function admin() {
  const a = await prisma.hubAccount.create({
    data: { email: `a-${rid()}@x.it`, name: "A", authMethod: "PASSWORD", linkedProviders: ["password"], role: "HUB_ADMIN" },
  });
  accIds.push(a.id);
  (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue(a);
  return a;
}
afterAll(async () => { await prisma.hubAccount.deleteMany({ where: { id: { in: accIds } } }); });

describe("DELETE affiliation", () => {
  it("elimina richiesta + installazione (cascade token)", async () => {
    const acc = await admin();
    const inst = await prisma.installation.create({
      data: { name: "S", contactEmail: "s@x.it", clientId: `inst_${rid()}`, clientSecretHash: "h" },
    });
    await prisma.hubAccessToken.create({
      data: { hubAccountId: acc.id, installationId: inst.id, accessTokenHash: `at-${rid()}`, refreshTokenHash: `rt-${rid()}`,
        accessTokenExpiresAt: new Date(Date.now() + 3600e3), refreshTokenExpiresAt: new Date(Date.now() + 7200e3), scopes: [] },
    });
    const r = await prisma.affiliationRequest.create({
      data: { schoolName: "S", province: "UD", installationUrl: "https://s.it", contactEmail: "s@x.it", status: "REDEEMED", installationId: inst.id },
    });
    const res = await DELETE(req(), p(r.id));
    expect(res.status).toBe(200);
    expect(await prisma.affiliationRequest.findUnique({ where: { id: r.id } })).toBeNull();
    expect(await prisma.installation.findUnique({ where: { id: inst.id } })).toBeNull();
    expect(await prisma.hubAccessToken.count({ where: { installationId: inst.id } })).toBe(0);
  });
  it("elimina richiesta senza installazione (es. REJECTED)", async () => {
    await admin();
    const r = await prisma.affiliationRequest.create({
      data: { schoolName: "S", province: "UD", installationUrl: "https://s.it", contactEmail: "s@x.it", status: "REJECTED" },
    });
    expect((await DELETE(req(), p(r.id))).status).toBe(200);
    expect(await prisma.affiliationRequest.findUnique({ where: { id: r.id } })).toBeNull();
  });
  it("404 se assente", async () => { await admin(); expect((await DELETE(req(), p("nope"))).status).toBe(404); });
  it("401 senza sessione", async () => {
    (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect((await DELETE(req(), p("x"))).status).toBe(401);
  });
});
