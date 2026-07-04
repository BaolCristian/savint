import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { savePublishDefaults } from "../publish-defaults";

const rid = () => Math.random().toString(36).slice(2);
const userIds: string[] = [];

async function user() {
  const u = await prisma.user.create({ data: { email: `u-${rid()}@x.it`, name: "U" } });
  userIds.push(u.id);
  return u;
}
afterAll(async () => { await prisma.user.deleteMany({ where: { id: { in: userIds } } }); });

describe("PublishDefaults model", () => {
  it("upsert crea e poi aggiorna", async () => {
    const u = await user();
    await prisma.publishDefaults.upsert({
      where: { userId: u.id },
      create: { userId: u.id, schoolLevel: "PRIMARIA", subject: "matematica", language: "it" },
      update: {},
    });
    let row = await prisma.publishDefaults.findUnique({ where: { userId: u.id } });
    expect(row?.subject).toBe("matematica");
    await prisma.publishDefaults.upsert({
      where: { userId: u.id },
      create: { userId: u.id },
      update: { subject: "storia" },
    });
    row = await prisma.publishDefaults.findUnique({ where: { userId: u.id } });
    expect(row?.subject).toBe("storia");
  });
});

describe("savePublishDefaults", () => {
  it("salva e sovrascrive i default dell'utente", async () => {
    const u = await user();
    await savePublishDefaults(u.id, { schoolLevel: "SECONDARIA_I", subject: "storia", language: "it", ageMin: 11, ageMax: 13 });
    let row = await prisma.publishDefaults.findUnique({ where: { userId: u.id } });
    expect(row).toMatchObject({ schoolLevel: "SECONDARIA_I", subject: "storia", language: "it", ageMin: 11, ageMax: 13 });
    await savePublishDefaults(u.id, { schoolLevel: "UNIVERSITA", subject: "matematica", language: "en" });
    row = await prisma.publishDefaults.findUnique({ where: { userId: u.id } });
    expect(row).toMatchObject({ schoolLevel: "UNIVERSITA", subject: "matematica", language: "en", ageMin: null, ageMax: null });
  });
});
