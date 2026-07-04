import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/client";
vi.mock("@/lib/auth/hub-session", () => ({ getHubSession: vi.fn() }));
import { POST as transfer } from "../transfer-content/route";
import { getHubSession } from "@/lib/auth/hub-session";
import { SYSTEM_ACCOUNT_EMAIL, getSystemHubAccount } from "@/lib/hub/system-account";
import { NextRequest } from "next/server";

const rid = () => Math.random().toString(36).slice(2);
const accIds: string[] = [];
const req = (email: unknown) =>
  new NextRequest("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });

async function account(email: string) {
  const a = await prisma.hubAccount.create({
    data: { email, name: email === SYSTEM_ACCOUNT_EMAIL ? "SAVINT" : "T", authMethod: "PASSWORD", linkedProviders: ["password"], role: "HUB_ADMIN" },
  });
  accIds.push(a.id);
  return a;
}
function asAdmin(a: { id: string }) { (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue(a); }

async function quiz(hubAccountId: string) {
  return prisma.hubQuiz.create({
    data: {
      hubAccountId, title: "Q", schoolLevel: "PRIMARIA", subject: "storia", language: "it",
      questionCount: 1, estimatedDurationSec: 60, payloadBlob: Buffer.from("x"), payloadHash: `h-${rid()}`, payloadSize: 1,
    },
  });
}

afterEach(async () => {
  await prisma.hubAccount.deleteMany({ where: { id: { in: accIds } } }); // cascata su HubQuiz
  accIds.length = 0;
});

describe("transfer-content", () => {
  it("sposta i quiz del docente su SAVINT", async () => {
    const savint = await account(SYSTEM_ACCOUNT_EMAIL);
    const admin = await account(`a-${rid()}@x.it`); asAdmin(admin);
    const teacher = await account(`t-${rid()}@x.it`);
    await quiz(teacher.id); await quiz(teacher.id);
    const res = await transfer(req(teacher.email));
    expect(res.status).toBe(200);
    expect((await res.json()).moved).toBe(2);
    expect(await prisma.hubQuiz.count({ where: { hubAccountId: teacher.id } })).toBe(0);
    expect(await prisma.hubQuiz.count({ where: { hubAccountId: savint.id } })).toBe(2);
  });
  it("409 se l'account SAVINT non esiste", async () => {
    const admin = await account(`a-${rid()}@x.it`); asAdmin(admin);
    expect((await transfer(req(`t-${rid()}@x.it`))).status).toBe(409);
  });
  it("400 se trasferisci da SAVINT a se stesso", async () => {
    await account(SYSTEM_ACCOUNT_EMAIL);
    const admin = await account(`a-${rid()}@x.it`); asAdmin(admin);
    expect((await transfer(req(SYSTEM_ACCOUNT_EMAIL))).status).toBe(400);
  });
  it("404 se l'email non esiste", async () => {
    await account(SYSTEM_ACCOUNT_EMAIL);
    const admin = await account(`a-${rid()}@x.it`); asAdmin(admin);
    expect((await transfer(req(`nobody-${rid()}@x.it`))).status).toBe(404);
  });
  it("403 se non admin", async () => {
    await account(SYSTEM_ACCOUNT_EMAIL);
    (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "u", role: "HUB_USER" });
    expect((await transfer(req(`x@x.it`))).status).toBe(403);
  });
});

// Nello stesso file (esecuzione seriale) per non contendere l'email SAVINT fissa
// con un altro file di test sul DB condiviso.
describe("getSystemHubAccount", () => {
  it("null quando l'account non esiste", async () => {
    expect(await getSystemHubAccount()).toBeNull();
  });
  it("ritorna l'account SAVINT quando esiste", async () => {
    await account(SYSTEM_ACCOUNT_EMAIL);
    const acc = await getSystemHubAccount();
    expect(acc?.email).toBe(SYSTEM_ACCOUNT_EMAIL);
    expect(acc?.name).toBe("SAVINT");
  });
});
