import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db/client";
vi.mock("@/lib/auth/hub-session", () => ({ getHubSession: vi.fn() }));
import { POST as disable } from "../[id]/disable/route";
import { POST as enable } from "../[id]/enable/route";
import { getHubSession } from "@/lib/auth/hub-session";
import { NextRequest } from "next/server";

const rid = () => Math.random().toString(36).slice(2);
const req = () => new NextRequest("http://localhost/x", { method: "POST" });
const p = (id: string) => ({ params: Promise.resolve({ id }) });
const ids: { accounts: string[]; installations: string[] } = { accounts: [], installations: [] };

async function admin(role: "HUB_ADMIN" | "HUB_USER" = "HUB_ADMIN") {
  const a = await prisma.hubAccount.create({
    data: { email: `a-${rid()}@x.it`, name: "A", authMethod: "PASSWORD", linkedProviders: ["password"], role },
  });
  ids.accounts.push(a.id);
  (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue(a);
  return a;
}
async function installation() {
  const acc = await admin();
  const inst = await prisma.installation.create({
    data: { name: "Scuola", contactEmail: "s@x.it", clientId: `inst_${rid()}`, clientSecretHash: "h" },
  });
  ids.installations.push(inst.id);
  await prisma.hubAccessToken.create({
    data: {
      hubAccountId: acc.id, installationId: inst.id,
      accessTokenHash: `at-${rid()}`, refreshTokenHash: `rt-${rid()}`,
      accessTokenExpiresAt: new Date(Date.now() + 3600e3), refreshTokenExpiresAt: new Date(Date.now() + 7200e3),
      scopes: [],
    },
  });
  return inst;
}

afterAll(async () => {
  await prisma.installation.deleteMany({ where: { id: { in: ids.installations } } });
  await prisma.hubAccount.deleteMany({ where: { id: { in: ids.accounts } } });
});

describe("installations disable/enable", () => {
  it("disable: DISABLED + token revocati", async () => {
    const inst = await installation();
    const res = await disable(req(), p(inst.id));
    expect(res.status).toBe(200);
    const after = await prisma.installation.findUnique({ where: { id: inst.id } });
    expect(after?.status).toBe("DISABLED");
    expect(await prisma.hubAccessToken.count({ where: { installationId: inst.id } })).toBe(0);
  });
  it("enable: torna ACTIVE", async () => {
    const inst = await installation();
    await disable(req(), p(inst.id));
    const res = await enable(req(), p(inst.id));
    expect(res.status).toBe(200);
    expect((await prisma.installation.findUnique({ where: { id: inst.id } }))?.status).toBe("ACTIVE");
  });
  it("404 se assente", async () => {
    await admin();
    expect((await disable(req(), p("nope"))).status).toBe(404);
  });
  it("401 senza sessione, 403 se non admin", async () => {
    (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect((await disable(req(), p("x"))).status).toBe(401);
    await admin("HUB_USER");
    expect((await disable(req(), p("x"))).status).toBe(403);
  });
});

// --- DELETE installation (scuola collegata senza AffiliationRequest) ---
import { DELETE as deleteInst } from "../[id]/route";

describe("DELETE installation", () => {
  it("elimina installazione + token in cascata + eventuale richiesta collegata", async () => {
    const acc = await admin();
    const inst = await prisma.installation.create({
      data: { name: "S", contactEmail: "s@x.it", clientId: `inst_${rid()}`, clientSecretHash: "h" },
    });
    ids.installations.push(inst.id);
    await prisma.hubAccessToken.create({
      data: { hubAccountId: acc.id, installationId: inst.id, accessTokenHash: `at-${rid()}`, refreshTokenHash: `rt-${rid()}`,
        accessTokenExpiresAt: new Date(Date.now() + 3600e3), refreshTokenExpiresAt: new Date(Date.now() + 7200e3), scopes: [] },
    });
    const r = await prisma.affiliationRequest.create({
      data: { schoolName: "S", province: "UD", installationUrl: "https://s.it", contactEmail: "s@x.it", status: "REDEEMED", installationId: inst.id },
    });
    const res = await deleteInst(req(), p(inst.id));
    expect(res.status).toBe(200);
    expect(await prisma.installation.findUnique({ where: { id: inst.id } })).toBeNull();
    expect(await prisma.hubAccessToken.count({ where: { installationId: inst.id } })).toBe(0);
    expect(await prisma.affiliationRequest.findUnique({ where: { id: r.id } })).toBeNull();
  });
  it("elimina installazione 'nuda' (nessuna richiesta collegata)", async () => {
    await admin();
    const inst = await prisma.installation.create({
      data: { name: "Bare", contactEmail: "b@x.it", clientId: `inst_${rid()}`, clientSecretHash: "h" },
    });
    ids.installations.push(inst.id);
    expect((await deleteInst(req(), p(inst.id))).status).toBe(200);
    expect(await prisma.installation.findUnique({ where: { id: inst.id } })).toBeNull();
  });
  it("404 se assente", async () => { await admin(); expect((await deleteInst(req(), p("nope"))).status).toBe(404); });
  it("401 senza sessione", async () => {
    (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect((await deleteInst(req(), p("x"))).status).toBe(401);
  });
});
