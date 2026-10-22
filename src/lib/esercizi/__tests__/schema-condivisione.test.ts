import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";

const P = "schemacond-";
let docenteId: string;

beforeEach(async () => {
  // Le condivisioni e i commenti spariscono a cascata con esercizi e utenti.
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  docenteId = (await prisma.user.create({ data: { email: `${P}d@test.it`, name: "D", role: "TEACHER" } })).id;
});

const base = { yearLevel: 2, topic: "prova", tags: [], difficulty: 1 };

describe("schema condivisione esercizi", () => {
  it("un esercizio nuovo nasce privato (accessoScuola null) e con il suo autore", async () => {
    const es = await prisma.esercizio.create({
      data: { id: `${P}uno`, title: "Uno", authorId: docenteId, ...base },
      include: { author: true },
    });
    expect(es.accessoScuola).toBeNull();
    expect(es.author?.id).toBe(docenteId);
  });

  it("cancellando l'autore l'esercizio resta, senza autore", async () => {
    const autore = await prisma.user.create({ data: { email: `${P}a@test.it`, name: "A", role: "TEACHER" } });
    await prisma.esercizio.create({ data: { id: `${P}uno`, title: "Uno", authorId: autore.id, ...base } });
    await prisma.user.delete({ where: { id: autore.id } });
    const es = await prisma.esercizio.findUnique({ where: { id: `${P}uno` } });
    expect(es).not.toBeNull();
    expect(es!.authorId).toBeNull();
  });

  it("cancellando l'utente la sua condivisione sparisce", async () => {
    const collega = await prisma.user.create({ data: { email: `${P}c@test.it`, name: "C", role: "TEACHER" } });
    await prisma.esercizio.create({ data: { id: `${P}uno`, title: "Uno", authorId: docenteId, ...base } });
    await prisma.condivisioneEsercizio.create({
      data: { esercizioId: `${P}uno`, userId: collega.id, ruolo: "COMMENTATORE" },
    });
    expect(await prisma.condivisioneEsercizio.count({ where: { esercizioId: `${P}uno` } })).toBe(1);
    await prisma.user.delete({ where: { id: collega.id } });
    expect(await prisma.condivisioneEsercizio.count({ where: { esercizioId: `${P}uno` } })).toBe(0);
  });

  it("cancellando l'esercizio spariscono commento e risposta", async () => {
    await prisma.esercizio.create({ data: { id: `${P}uno`, title: "Uno", authorId: docenteId, ...base } });
    const c = await prisma.commentoEsercizio.create({
      data: { esercizioId: `${P}uno`, autoreId: docenteId, testo: "Manca un caso" },
    });
    await prisma.commentoEsercizio.create({
      data: { esercizioId: `${P}uno`, autoreId: docenteId, parentId: c.id, testo: "Aggiunto" },
    });
    expect(await prisma.commentoEsercizio.count({ where: { esercizioId: `${P}uno` } })).toBe(2);
    await prisma.esercizio.delete({ where: { id: `${P}uno` } });
    expect(await prisma.commentoEsercizio.count({ where: { esercizioId: `${P}uno` } })).toBe(0);
  });
});
