import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { creaBatteria, elencoBatterie, verificaBatteria, eliminaBatteria } from "../batterie";

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
  // Ognuno ha una versione: verificaBatteria conta solo esercizi con una
  // EsercizioVersione risolvibile come "disponibili" (Fix round 1).
  await prisma.esercizioVersione.createMany({
    data: [a1, a2, b1].map((esercizioId, i) => ({ esercizioId, version: 1, content: {}, hash: `h${i}` })),
  });
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

  it("verificaBatteria su una batteria inesistente lancia invece di dire ok in silenzio", async () => {
    await expect(verificaBatteria("non-esiste")).rejects.toThrow();
  });

  it("verificaBatteria non conta un esercizio senza versione come disponibile", async () => {
    const senzaVersione = (await prisma.esercizio.create({
      data: { id: `${P}senza-versione`, title: "Senza versione", yearLevel: 2, topic: "prova", tags: [], difficulty: 1 },
    })).id;
    await prisma.contenitoreEsercizio.create({ data: { contenitoreId: contA, esercizioId: senzaVersione } });
    // contA ha ora 3 membri (a1, a2 con versione, senza-versione senza): una
    // regola che ne chiede 3 deve vedersi dire che ne sono disponibili 2.
    const b = await creaBatteria(teacherId, `${P}TreSuTre`, [{ contenitoreId: contA, count: 3 }]);
    expect(await verificaBatteria(b.id)).toEqual({
      ok: false,
      mancanti: [{ contenitore: `${P}Equazioni`, richiesti: 3, disponibili: 2 }],
    });
  });

  it("una batteria libera si cancella", async () => {
    const b = await creaBatteria(teacherId, `${P}Libera`, [{ contenitoreId: contA, count: 1 }]);
    expect(await eliminaBatteria(b.id)).toEqual({ ok: true });
    expect(await prisma.batteria.findUnique({ where: { id: b.id } })).toBeNull();
  });

  it("una batteria con compiti assegnati NON si cancella", async () => {
    const b = await creaBatteria(teacherId, `${P}Assegnata`, [{ contenitoreId: contA, count: 1 }]);
    const classe = await prisma.classe.create({
      data: { googleGroupEmail: `${P}elimina@scuola.it`, name: "Elimina", yearLevel: 2 },
    });
    await prisma.compito.create({
      data: { batteriaId: b.id, classeId: classe.id, assignedById: teacherId, drawSeed: "s", drawnVersionIds: [] },
    });
    expect(await eliminaBatteria(b.id)).toEqual({ ok: false, motivo: "in_uso" });
    expect(await prisma.batteria.findUnique({ where: { id: b.id } })).not.toBeNull();
  });
});
