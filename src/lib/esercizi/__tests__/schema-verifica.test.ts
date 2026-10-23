import { describe, it, expect, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";

const P = "schemaverificatest-";
let docenteId: string;
let studenteId: string;
let versioneId: string;

beforeEach(async () => {
  // Ordine obbligato: il compito blocca la batteria (Restrict) e chi l'ha
  // assegnato; verifica, prove, eventi e tentativi delle prove spariscono a
  // cascata con il compito, le misure PDP con la classe.
  await prisma.compito.deleteMany({ where: { classeId: { startsWith: P } } });
  await prisma.batteria.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.classe.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  docenteId = (await prisma.user.create({ data: { email: `${P}d@test.it`, name: "D", role: "TEACHER" } })).id;
  studenteId = (await prisma.user.create({ data: { email: `${P}s@test.it`, name: "S", role: "STUDENT" } })).id;
  await prisma.classe.create({ data: { id: `${P}classe`, name: `${P}2A`, yearLevel: 2 } });
  await prisma.batteria.create({ data: { id: `${P}bat`, name: "Copia", createdById: docenteId, automatica: true } });
  await prisma.esercizio.create({
    data: { id: `${P}es`, title: "E", yearLevel: 2, topic: "t", tags: [], difficulty: 1 },
  });
  versioneId = (await prisma.esercizioVersione.create({
    data: { esercizioId: `${P}es`, version: 1, content: {}, hash: "h" },
  })).id;
});

const compitoBase = () => ({
  batteriaId: `${P}bat`,
  classeId: `${P}classe`,
  assignedById: docenteId,
  drawSeed: "seme",
  drawnVersionIds: [],
});

const layout = [{ quanti: 2, punti: 3, quantiPdp: 1, scelti: false, nonPerPdp: [] }];

async function codiceErrore(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof Prisma.PrismaClientKnownRequestError ? e.code : "altro";
  }
}

describe("schema modalità verifica", () => {
  it("un compito creato senza tipo è un COMPITO", async () => {
    const c = await prisma.compito.create({ data: compitoBase() });
    expect(c.tipo).toBe("COMPITO");
  });

  it("verifica, prove ed eventi spariscono con il compito", async () => {
    const c = await prisma.compito.create({ data: { ...compitoBase(), tipo: "VERIFICA" } });
    const v = await prisma.verifica.create({ data: { compitoId: c.id, durataMinuti: 60, layout } });
    expect(v.minutiExtra).toBe(0);
    expect(v.calcolatrice).toBe("SOLO_PDP");
    expect(v.formulario).toBe("SOLO_PDP");
    expect(v.layout).toEqual(layout);
    const prova = await prisma.provaVerifica.create({ data: { compitoId: c.id, studentId: studenteId } });
    expect(prova.posizioni).toEqual([]);
    expect(prova.tempoExtraPct).toBe(0);
    expect(prova.recupero).toBe(false);
    await prisma.eventoVerifica.create({
      data: { provaId: prova.id, tipo: "USCITA", motivo: "SCHERMO_INTERO", at: new Date() },
    });
    await prisma.tentativo.create({
      data: { studentId: studenteId, esercizioVersioneId: versioneId, compitoId: c.id, provaId: prova.id, seed: "s" },
    });

    await prisma.compito.delete({ where: { id: c.id } });
    expect(await prisma.verifica.count({ where: { compitoId: c.id } })).toBe(0);
    expect(await prisma.provaVerifica.count({ where: { compitoId: c.id } })).toBe(0);
    expect(await prisma.eventoVerifica.count({ where: { provaId: prova.id } })).toBe(0);
    expect(await prisma.tentativo.count({ where: { provaId: prova.id } })).toBe(0);
  });

  it("una sola prova per studente e verifica", async () => {
    const c = await prisma.compito.create({ data: { ...compitoBase(), tipo: "VERIFICA" } });
    await prisma.provaVerifica.create({ data: { compitoId: c.id, studentId: studenteId } });
    expect(await codiceErrore(prisma.provaVerifica.create({ data: { compitoId: c.id, studentId: studenteId } })))
      .toBe("P2002");
  });

  it("un solo tentativo per esercizio dentro una prova; senza prova nessun limite", async () => {
    const c = await prisma.compito.create({ data: { ...compitoBase(), tipo: "VERIFICA" } });
    const prova = await prisma.provaVerifica.create({ data: { compitoId: c.id, studentId: studenteId } });
    const tentativo = { studentId: studenteId, esercizioVersioneId: versioneId, seed: "s" };
    const primo = await prisma.tentativo.create({ data: { ...tentativo, provaId: prova.id } });
    expect(primo.puntiManuali).toBeNull();
    expect(await codiceErrore(prisma.tentativo.create({ data: { ...tentativo, provaId: prova.id } })))
      .toBe("P2002");

    await prisma.tentativo.create({ data: tentativo });
    await prisma.tentativo.create({ data: tentativo });
    expect(await prisma.tentativo.count({ where: { esercizioVersioneId: versioneId, provaId: null } })).toBe(2);
  });

  it("le misure PDP sopravvivono alla disiscrizione e spariscono con la classe", async () => {
    await prisma.classeStudente.create({ data: { classeId: `${P}classe`, studentId: studenteId } });
    const m = await prisma.misurePdp.create({
      data: { classeId: `${P}classe`, studentId: studenteId, tempoExtraPct: 30, calcolatrice: true },
    });
    expect(m.menoEsercizi).toBe(false);
    expect(m.formulario).toBe(false);

    await prisma.classeStudente.delete({
      where: { classeId_studentId: { classeId: `${P}classe`, studentId: studenteId } },
    });
    expect(await prisma.misurePdp.count({ where: { classeId: `${P}classe` } })).toBe(1);

    await prisma.classe.delete({ where: { id: `${P}classe` } });
    expect(await prisma.misurePdp.count({ where: { classeId: `${P}classe` } })).toBe(0);
  });

  it("le misure PDP spariscono con lo studente", async () => {
    await prisma.misurePdp.create({ data: { classeId: `${P}classe`, studentId: studenteId } });
    await prisma.user.delete({ where: { id: studenteId } });
    expect(await prisma.misurePdp.count({ where: { classeId: `${P}classe` } })).toBe(0);
  });

  it("una regola senza i campi della verifica non ha punti né esclusioni PDP", async () => {
    const r = await prisma.batteriaRegola.create({
      data: { batteriaId: `${P}bat`, order: 0, count: 2, argomento: "prova" },
    });
    expect(r.punti).toBeNull();
    expect(r.quantiPdp).toBeNull();
    expect(r.nonPerPdp).toEqual([]);
  });
});
