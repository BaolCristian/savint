import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { allineaClassi, classiDelDocente, dichiaraInsegnamento } from "../classi";

const P = "classitest-";
const email = (n: string) => `${P}${n}@test.it`;
let studentId: string;
let teacherId: string;

const g = (slug: string, nome: string, anno: number | null) => ({ email: `${P}${slug}@scuola.it`, name: nome, yearLevel: anno });

beforeEach(async () => {
  await prisma.classeStudente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.classeDocente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.classe.deleteMany({ where: { googleGroupEmail: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  studentId = (await prisma.user.create({ data: { email: email("s"), name: "S", role: "STUDENT" } })).id;
  teacherId = (await prisma.user.create({ data: { email: email("d"), name: "D", role: "TEACHER" } })).id;
});

describe("allineamento delle classi", () => {
  it("il primo accesso crea la classe e iscrive", async () => {
    const r = await allineaClassi(studentId, [g("2a", "2A", 2)]);
    expect(r.entrate).toHaveLength(1);
    expect(r.uscite).toHaveLength(0);
    const c = await prisma.classe.findUnique({ where: { googleGroupEmail: `${P}2a@scuola.it` } });
    expect(c?.name).toBe("2A");
    expect(c?.yearLevel).toBe(2);
  });

  it("un secondo accesso con gli stessi gruppi non cambia niente", async () => {
    await allineaClassi(studentId, [g("2a", "2A", 2)]);
    const r = await allineaClassi(studentId, [g("2a", "2A", 2)]);
    expect(r).toEqual({ entrate: [], uscite: [] });
    expect(await prisma.classe.count({ where: { googleGroupEmail: { startsWith: P } } })).toBe(1);
  });

  it("un gruppo nuovo iscrive, uno perso disiscrive", async () => {
    await allineaClassi(studentId, [g("2a", "2A", 2)]);
    const r = await allineaClassi(studentId, [g("3b", "3B", 3)]);
    expect(r.entrate).toHaveLength(1);
    expect(r.uscite).toHaveLength(1);
    const iscrizioni = await prisma.classeStudente.findMany({ where: { studentId }, include: { classe: true } });
    expect(iscrizioni.map((i) => i.classe.name)).toEqual(["3B"]);
  });

  it("la classe resta anche quando l'ultimo studente esce", async () => {
    await allineaClassi(studentId, [g("2a", "2A", 2)]);
    await allineaClassi(studentId, []);
    expect(await prisma.classe.count({ where: { googleGroupEmail: `${P}2a@scuola.it` } })).toBe(1);
  });

  it("un gruppo che cambia nome aggiorna la classe senza crearne una nuova", async () => {
    await allineaClassi(studentId, [g("2a", "2A", 2)]);
    await allineaClassi(studentId, [g("2a", "2A Nuova", 2)]);
    expect(await prisma.classe.count({ where: { googleGroupEmail: { startsWith: P } } })).toBe(1);
    const c = await prisma.classe.findUnique({ where: { googleGroupEmail: `${P}2a@scuola.it` } });
    expect(c?.name).toBe("2A Nuova");
  });

  it("il docente dichiara le classi che insegna e le rivede col conteggio degli studenti", async () => {
    await allineaClassi(studentId, [g("2a", "2A", 2)]);
    const c = await prisma.classe.findUniqueOrThrow({ where: { googleGroupEmail: `${P}2a@scuola.it` } });
    await dichiaraInsegnamento(teacherId, [c.id]);
    const mie = await classiDelDocente(teacherId);
    expect(mie).toHaveLength(1);
    expect(mie[0]!.name).toBe("2A");
    expect(mie[0]!.studenti).toBe(1);
  });

  it("dichiarare di nuovo sostituisce l'elenco invece di accumularlo", async () => {
    await allineaClassi(studentId, [g("2a", "2A", 2), g("3b", "3B", 3)]);
    const tutte = await prisma.classe.findMany({ where: { googleGroupEmail: { startsWith: P } } });
    await dichiaraInsegnamento(teacherId, tutte.map((c) => c.id));
    await dichiaraInsegnamento(teacherId, [tutte[0]!.id]);
    expect(await classiDelDocente(teacherId)).toHaveLength(1);
  });
});
