import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  creaContenitore, elencoContenitori, contenutoContenitore,
  aggiungiEsercizi, togliEsercizio, eliminaContenitore,
} from "../contenitori";

const P = "conttest-";
let teacherId: string;
let es1: string;
let es2: string;

beforeEach(async () => {
  await prisma.batteriaRegola.deleteMany({ where: { contenitore: { name: { startsWith: P } } } });
  await prisma.batteria.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.contenitoreEsercizio.deleteMany({ where: { contenitore: { name: { startsWith: P } } } });
  await prisma.contenitore.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  teacherId = (await prisma.user.create({ data: { email: `${P}d@test.it`, name: "D", role: "TEACHER" } })).id;
  const base = { yearLevel: 2, topic: "prova", tags: [], difficulty: 1 };
  es1 = (await prisma.esercizio.create({ data: { id: `${P}uno`, title: "Uno", ...base } })).id;
  es2 = (await prisma.esercizio.create({ data: { id: `${P}due`, title: "Due", ...base } })).id;
});

describe("contenitori", () => {
  it("si crea e compare nell'elenco con zero esercizi", async () => {
    const c = await creaContenitore(teacherId, `${P}Equazioni`);
    const elenco = (await elencoContenitori()).filter((x) => x.name.startsWith(P));
    expect(elenco).toHaveLength(1);
    expect(elenco[0]!.id).toBe(c.id);
    expect(elenco[0]!.esercizi).toBe(0);
  });

  it("aggiunge esercizi e li elenca", async () => {
    const c = await creaContenitore(teacherId, `${P}Equazioni`);
    expect(await aggiungiEsercizi(c.id, [es1, es2])).toBe(2);
    const dett = await contenutoContenitore(c.id);
    expect(dett!.esercizi.map((e) => e.id).sort()).toEqual([es1, es2].sort());
  });

  it("aggiungere due volte lo stesso esercizio non lo duplica", async () => {
    const c = await creaContenitore(teacherId, `${P}Equazioni`);
    await aggiungiEsercizi(c.id, [es1]);
    expect(await aggiungiEsercizi(c.id, [es1, es2])).toBe(1);
    expect((await contenutoContenitore(c.id))!.esercizi).toHaveLength(2);
  });

  it("un esercizio puo' stare in due contenitori", async () => {
    const a = await creaContenitore(teacherId, `${P}A`);
    const b = await creaContenitore(teacherId, `${P}B`);
    await aggiungiEsercizi(a.id, [es1]);
    await aggiungiEsercizi(b.id, [es1]);
    expect((await contenutoContenitore(a.id))!.esercizi).toHaveLength(1);
    expect((await contenutoContenitore(b.id))!.esercizi).toHaveLength(1);
  });

  it("togliere un esercizio da un contenitore non lo cancella dal bacino", async () => {
    const c = await creaContenitore(teacherId, `${P}A`);
    await aggiungiEsercizi(c.id, [es1]);
    await togliEsercizio(c.id, es1);
    expect((await contenutoContenitore(c.id))!.esercizi).toHaveLength(0);
    expect(await prisma.esercizio.findUnique({ where: { id: es1 } })).not.toBeNull();
  });

  it("un contenitore libero si cancella", async () => {
    const c = await creaContenitore(teacherId, `${P}A`);
    expect(await eliminaContenitore(c.id)).toEqual({ ok: true });
  });

  it("un contenitore usato da una regola NON si cancella", async () => {
    const c = await creaContenitore(teacherId, `${P}A`);
    const b = await prisma.batteria.create({ data: { name: `${P}B`, createdById: teacherId } });
    await prisma.batteriaRegola.create({ data: { batteriaId: b.id, contenitoreId: c.id, order: 0, count: 1 } });
    expect(await eliminaContenitore(c.id)).toEqual({ ok: false, motivo: "in_uso" });
    expect(await prisma.contenitore.findUnique({ where: { id: c.id } })).not.toBeNull();
  });

  it("un contenitore inesistente da' null nel dettaglio", async () => {
    expect(await contenutoContenitore("non-esiste")).toBeNull();
  });
});
