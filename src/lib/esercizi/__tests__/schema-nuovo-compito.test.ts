import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";

const P = "schemanc-";
let docenteId: string;
let studenteId: string;

beforeEach(async () => {
  // Ordine obbligato: il compito blocca la batteria (Restrict) e chi l'ha
  // assegnato; le estrazioni spariscono a cascata con il compito.
  await prisma.compito.deleteMany({ where: { classeId: { startsWith: P } } });
  await prisma.batteria.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.classe.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  docenteId = (await prisma.user.create({ data: { email: `${P}d@test.it`, name: "D", role: "TEACHER" } })).id;
  studenteId = (await prisma.user.create({ data: { email: `${P}s@test.it`, name: "S", role: "STUDENT" } })).id;
  await prisma.classe.create({ data: { id: `${P}classe`, name: "2A", yearLevel: 2 } });
  await prisma.batteria.create({ data: { id: `${P}bat`, name: "Copia", createdById: docenteId, automatica: true } });
});

const compitoBase = () => ({
  batteriaId: `${P}bat`,
  classeId: `${P}classe`,
  assignedById: docenteId,
  drawSeed: "seme",
  drawnVersionIds: [],
});

describe("schema nuovo compito", () => {
  it("un compito creato senza modo è CLASSE, senza bacini né modello", async () => {
    const c = await prisma.compito.create({ data: compitoBase() });
    expect(c.modo).toBe("CLASSE");
    expect(c.bacini).toBeNull();
    expect(c.modelloId).toBeNull();
  });

  it("un compito STUDENTE conserva i bacini come scritti", async () => {
    const bacini = [{ count: 2, versionIds: ["v1", "v2", "v3"] }, { count: 1, versionIds: ["v4"] }];
    const c = await prisma.compito.create({ data: { ...compitoBase(), modo: "STUDENTE", bacini } });
    const letto = await prisma.compito.findUniqueOrThrow({ where: { id: c.id } });
    expect(letto.modo).toBe("STUDENTE");
    expect(letto.bacini).toEqual(bacini);
  });

  it("l'estrazione di uno studente sparisce con il compito", async () => {
    const c = await prisma.compito.create({ data: { ...compitoBase(), modo: "STUDENTE" } });
    await prisma.estrazioneStudente.create({
      data: { compitoId: c.id, studentId: studenteId, versionIds: ["v1", "v2"] },
    });
    const e = await prisma.estrazioneStudente.findUniqueOrThrow({
      where: { compitoId_studentId: { compitoId: c.id, studentId: studenteId } },
    });
    expect(e.versionIds).toEqual(["v1", "v2"]);
    await prisma.compito.delete({ where: { id: c.id } });
    expect(await prisma.estrazioneStudente.count({ where: { compitoId: c.id } })).toBe(0);
  });

  it("l'estrazione di uno studente sparisce con lo studente", async () => {
    const c = await prisma.compito.create({ data: { ...compitoBase(), modo: "STUDENTE" } });
    await prisma.estrazioneStudente.create({ data: { compitoId: c.id, studentId: studenteId, versionIds: ["v1"] } });
    await prisma.user.delete({ where: { id: studenteId } });
    expect(await prisma.estrazioneStudente.count({ where: { compitoId: c.id } })).toBe(0);
  });

  it("cancellando il modello il compito resta, senza modello", async () => {
    await prisma.batteria.create({ data: { id: `${P}modello`, name: "Modello", createdById: docenteId } });
    const c = await prisma.compito.create({ data: { ...compitoBase(), modelloId: `${P}modello` } });
    await prisma.batteria.delete({ where: { id: `${P}modello` } });
    const letto = await prisma.compito.findUnique({ where: { id: c.id } });
    expect(letto).not.toBeNull();
    expect(letto!.modelloId).toBeNull();
    expect(letto!.batteriaId).toBe(`${P}bat`);
  });

  it("una regola 'scelti a mano' rilegge i suoi esercizi; le altre nascono con elenco vuoto", async () => {
    const mano = await prisma.batteriaRegola.create({
      data: { batteriaId: `${P}bat`, order: 0, count: 2, esercizioIds: ["a", "b"] },
    });
    const argomento = await prisma.batteriaRegola.create({
      data: { batteriaId: `${P}bat`, order: 1, count: 3, argomento: "prova" },
    });
    expect((await prisma.batteriaRegola.findUniqueOrThrow({ where: { id: mano.id } })).esercizioIds).toEqual(["a", "b"]);
    expect(argomento.esercizioIds).toEqual([]);
  });
});
