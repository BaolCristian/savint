import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { creaBatteria, elencoBatterie, verificaBatteria } from "../batterie";

const P = "battest-";
let teacherId: string;
let contA: string;
let contB: string;

beforeEach(async () => {
  await prisma.tentativo.deleteMany({ where: { student: { email: { startsWith: P } } } });
  await prisma.compito.deleteMany({ where: { batteria: { name: { startsWith: P } } } });
  await prisma.batteriaRegola.deleteMany({ where: { batteria: { name: { startsWith: P } } } });
  await prisma.batteria.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.contenitoreEsercizio.deleteMany({ where: { contenitore: { name: { startsWith: P } } } });
  await prisma.contenitore.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.classeStudente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.classeDocente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.classe.deleteMany({ where: { googleGroupEmail: { startsWith: P } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });

  teacherId = (await prisma.user.create({ data: { email: `${P}d@test.it`, name: "D", role: "TEACHER" } })).id;

  contA = (await prisma.contenitore.create({ data: { name: `${P}Equazioni`, createdById: teacherId } })).id;
  contB = (await prisma.contenitore.create({ data: { name: `${P}Sistemi`, createdById: teacherId } })).id;

  const base = { yearLevel: 2, topic: "prova", tags: [], difficulty: 1 };
  const a1 = (await prisma.esercizio.create({ data: { id: `${P}a1`, title: "A1", ...base } })).id;
  const a2 = (await prisma.esercizio.create({ data: { id: `${P}a2`, title: "A2", ...base } })).id;
  const b1 = (await prisma.esercizio.create({ data: { id: `${P}b1`, title: "B1", ...base } })).id;
  await prisma.contenitoreEsercizio.createMany({
    data: [
      { contenitoreId: contA, esercizioId: a1 },
      { contenitoreId: contA, esercizioId: a2 },
      { contenitoreId: contB, esercizioId: b1 },
    ],
  });
});

describe("batterie", () => {
  it("si crea con le regole in ordine progressivo", async () => {
    const b = await creaBatteria(teacherId, `${P}Mista`, [
      { contenitoreId: contA, count: 2 },
      { contenitoreId: contB, count: 1 },
    ]);
    const regole = await prisma.batteriaRegola.findMany({ where: { batteriaId: b.id }, orderBy: { order: "asc" } });
    expect(regole).toHaveLength(2);
    expect(regole[0]).toMatchObject({ order: 0, contenitoreId: contA, count: 2 });
    expect(regole[1]).toMatchObject({ order: 1, contenitoreId: contB, count: 1 });
  });

  it("l'elenco riporta le regole col nome del contenitore e il conteggio dei compiti", async () => {
    const b = await creaBatteria(teacherId, `${P}Mista`, [{ contenitoreId: contA, count: 2 }]);
    const elenco = (await elencoBatterie()).filter((x) => x.name.startsWith(P));
    expect(elenco).toHaveLength(1);
    expect(elenco[0]).toMatchObject({
      id: b.id,
      name: `${P}Mista`,
      regole: [{ contenitore: `${P}Equazioni`, count: 2 }],
      compiti: 0,
    });
  });

  it("il conteggio dei compiti sale quando la batteria viene assegnata", async () => {
    const b = await creaBatteria(teacherId, `${P}Mista`, [{ contenitoreId: contA, count: 1 }]);
    const classe = await prisma.classe.create({
      data: { googleGroupEmail: `${P}c@scuola.it`, name: "C", yearLevel: 2 },
    });
    await prisma.compito.create({
      data: { batteriaId: b.id, classeId: classe.id, assignedById: teacherId, drawSeed: "s", drawnVersionIds: [] },
    });
    const elenco = (await elencoBatterie()).filter((x) => x.name.startsWith(P));
    expect(elenco[0]!.compiti).toBe(1);
  });

  it("verificaBatteria dice ok quando ogni contenitore ne ha abbastanza", async () => {
    const b = await creaBatteria(teacherId, `${P}Ok`, [
      { contenitoreId: contA, count: 2 },
      { contenitoreId: contB, count: 1 },
    ]);
    expect(await verificaBatteria(b.id)).toEqual({ ok: true });
  });

  it("verificaBatteria elenca il contenitore e i due numeri quando manca qualcosa", async () => {
    const b = await creaBatteria(teacherId, `${P}Corta`, [
      { contenitoreId: contA, count: 2 },
      { contenitoreId: contB, count: 5 },
    ]);
    const r = await verificaBatteria(b.id);
    expect(r).toEqual({
      ok: false,
      mancanti: [{ contenitore: `${P}Sistemi`, richiesti: 5, disponibili: 1 }],
    });
  });
});
