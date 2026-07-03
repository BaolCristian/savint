import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db/client";
vi.mock("@/lib/auth/hub-session", () => ({ getHubSession: vi.fn() }));
import { POST as promote } from "../promote/route";
import { POST as demote } from "../[id]/demote/route";
import { getHubSession } from "@/lib/auth/hub-session";
import { NextRequest } from "next/server";

const rid = () => Math.random().toString(36).slice(2);
const accIds: string[] = [];

function promoteReq(email: unknown) {
  return new NextRequest("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
}
const demoteReq = () => new NextRequest("http://localhost/x", { method: "POST" });
const p = (id: string) => ({ params: Promise.resolve({ id }) });

async function account(role: "HUB_ADMIN" | "HUB_USER") {
  const a = await prisma.hubAccount.create({
    data: { email: `u-${rid()}@x.it`, name: "U", authMethod: "PASSWORD", linkedProviders: ["password"], role },
  });
  accIds.push(a.id);
  return a;
}
function asAdmin(a: { id: string }) {
  (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue(a);
}

afterAll(async () => { await prisma.hubAccount.deleteMany({ where: { id: { in: accIds } } }); });

describe("promote", () => {
  it("promuove un utente per email", async () => {
    asAdmin(await account("HUB_ADMIN"));
    const target = await account("HUB_USER");
    const res = await promote(promoteReq(target.email.toUpperCase())); // case-insensitive
    expect(res.status).toBe(200);
    expect((await prisma.hubAccount.findUnique({ where: { id: target.id } }))?.role).toBe("HUB_ADMIN");
  });
  it("404 se l'email non esiste", async () => {
    asAdmin(await account("HUB_ADMIN"));
    expect((await promote(promoteReq("nobody@x.it"))).status).toBe(404);
  });
  it("400 se email mancante", async () => {
    asAdmin(await account("HUB_ADMIN"));
    expect((await promote(promoteReq(""))).status).toBe(400);
  });
  it("403 se non admin", async () => {
    asAdmin(await account("HUB_USER"));
    expect((await promote(promoteReq("x@x.it"))).status).toBe(403);
  });
});

describe("demote", () => {
  it("rimuove l'admin a un altro account", async () => {
    asAdmin(await account("HUB_ADMIN"));
    const other = await account("HUB_ADMIN");
    const res = await demote(demoteReq(), p(other.id));
    expect(res.status).toBe(200);
    expect((await prisma.hubAccount.findUnique({ where: { id: other.id } }))?.role).toBe("HUB_USER");
  });
  it("400 se provi a togliere l'admin a te stesso", async () => {
    const me = await account("HUB_ADMIN");
    asAdmin(me);
    const res = await demote(demoteReq(), p(me.id));
    expect(res.status).toBe(400);
    expect((await prisma.hubAccount.findUnique({ where: { id: me.id } }))?.role).toBe("HUB_ADMIN");
  });
  it("404 se l'account non esiste", async () => {
    asAdmin(await account("HUB_ADMIN"));
    expect((await demote(demoteReq(), p("nope"))).status).toBe(404);
  });
  it("401 senza sessione", async () => {
    (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect((await demote(demoteReq(), p("x"))).status).toBe(401);
  });
});
