import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { creaBatteria } from "../batterie";
import { aggiungiEsercizi } from "../contenitori";
import {
  assegna, compitiDellaClasse, compitiDelloStudente, consegneDelCompito,
} from "../compiti";

const P = "compititest-";
let teacherId: string;
let studentId: string;
let studentId2: string;
let classeId: string;
let classeAltrui: string;
let contenitoreId: string;
let esercizioExtra: string;
let batteriaId: string;
let batteriaTroppoGrande: string;

async function creaEsercizioConVersione(id: string, title: string) {
  const e = await prisma.esercizio.create({
    data: { id, title, yearLevel: 2, topic: "prova", tags: [], difficulty: 1 },
  });
  await prisma.esercizioVersione.create({
    data: { esercizioId: e.id, version: 1, content: { testo: title }, hash: `h-${id}` },
  });
  return e.id;
}

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
  await prisma.esercizioVersione.deleteMany({ where: { esercizio: { id: { startsWith: P } } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });

  teacherId = (await prisma.user.create({ data: { email: `${P}d@test.it`, name: "D", role: "TEACHER" } })).id;
  studentId = (await prisma.user.create({ data: { email: `${P}s1@test.it`, name: "S1", role: "STUDENT" } })).id;
  studentId2 = (await prisma.user.create({ data: { email: `${P}s2@test.it`, name: "S2", role: "STUDENT" } })).id;

  classeId = (await prisma.classe.create({
    data: { googleGroupEmail: `${P}classe@scuola.it`, name: "Classe", yearLevel: 2 },
  })).id;
  await prisma.classeDocente.create({ data: { classeId, teacherId } });
  await prisma.classeStudente.createMany({
    data: [{ classeId, studentId }, { classeId, studentId: studentId2 }],
  });

  // Una classe che esiste ma che il docente non insegna.
  classeAltrui = (await prisma.classe.create({
    data: { googleGroupEmail: `${P}altrui@scuola.it`, name: "Altrui", yearLevel: 2 },
  })).id;

  contenitoreId = (await prisma.contenitore.create({ data: { name: `${P}Equazioni`, createdById: teacherId } })).id;
  const es = await Promise.all([
    creaEsercizioConVersione(`${P}es0`, "Es 0"),
    creaEsercizioConVersione(`${P}es1`, "Es 1"),
    creaEsercizioConVersione(`${P}es2`, "Es 2"),
    creaEsercizioConVersione(`${P}es3`, "Es 3"),
    creaEsercizioConVersione(`${P}es4`, "Es 4"),
  ]);
  await prisma.contenitoreEsercizio.createMany({
    data: es.map((esercizioId) => ({ contenitoreId, esercizioId })),
  });

  esercizioExtra = await creaEsercizioConVersione(`${P}extra`, "Extra");

  batteriaId = (await creaBatteria(teacherId, `${P}Batteria`, [{ contenitoreId, count: 3 }])).id;
  batteriaTroppoGrande = (await creaBatteria(teacherId, `${P}Troppo`, [{ contenitoreId, count: 100 }])).id;
});

describe("assegna", () => {
  it("assegnare pesca una volta e fissa le versioni", async () => {
    const r = await assegna(batteriaId, classeId, teacherId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } });
    expect(c.drawnVersionIds).toHaveLength(3);
    expect(c.drawSeed).toMatch(/.+/);
  });

  it("due assegnazioni della stessa batteria pescano in modo diverso", async () => {
    const a = await assegna(batteriaId, classeId, teacherId);
    const b = await assegna(batteriaId, classeId, teacherId);
    if (!a.ok || !b.ok) throw new Error("assegnazione fallita");
    const ca = await prisma.compito.findUniqueOrThrow({ where: { id: a.compitoId } });
    const cb = await prisma.compito.findUniqueOrThrow({ where: { id: b.compitoId } });
    expect(ca.drawSeed).not.toBe(cb.drawSeed);
  });

  it("la pesca non cambia se il contenitore cambia dopo", async () => {
    const r = await assegna(batteriaId, classeId, teacherId);
    if (!r.ok) throw new Error("assegnazione fallita");
    const prima = (await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } })).drawnVersionIds;
    await aggiungiEsercizi(contenitoreId, [esercizioExtra]);
    const dopo = (await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } })).drawnVersionIds;
    expect(dopo).toEqual(prima);
  });

  it("un contenitore che non basta blocca l'assegnazione e dice quale", async () => {
    const r = await assegna(batteriaTroppoGrande, classeId, teacherId);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("esercizi_insufficienti");
  });

  it("il motivo per cui non basta nomina il contenitore e i due numeri", async () => {
    const r = await assegna(batteriaTroppoGrande, classeId, teacherId);
    if (r.ok) throw new Error("doveva fallire");
    expect(r.dettaglio).toEqual({ contenitore: `${P}Equazioni`, richiesti: 100, disponibili: 5 });
    // Nessun compito scritto quando l'assegnazione fallisce.
    expect(await prisma.compito.count({ where: { batteriaId: batteriaTroppoGrande } })).toBe(0);
  });

  it("un docente non puo' assegnare a una classe che non insegna", async () => {
    const r = await assegna(batteriaId, classeAltrui, teacherId);
    expect(r).toMatchObject({ ok: false, motivo: "non_insegni_questa_classe" });
  });

  it("una batteria inesistente non si assegna", async () => {
    const r = await assegna("non-esiste", classeId, teacherId);
    expect(r).toMatchObject({ ok: false, motivo: "batteria_non_trovata" });
  });

  it("una classe inesistente non si assegna", async () => {
    const r = await assegna(batteriaId, "non-esiste", teacherId);
    expect(r).toMatchObject({ ok: false, motivo: "classe_non_trovata" });
  });

  it("lo studente vede il compito della sua classe e quanti esercizi ha fatto", async () => {
    const r = await assegna(batteriaId, classeId, teacherId);
    if (!r.ok) throw new Error("assegnazione fallita");
    const suoi = await compitiDelloStudente(studentId);
    expect(suoi).toHaveLength(1);
    expect(suoi[0]!.esercizi).toHaveLength(3);
    expect(suoi[0]!.fatti).toBe(0);
  });

  it("le consegne elencano tutti gli studenti, anche chi non ha iniziato", async () => {
    const r = await assegna(batteriaId, classeId, teacherId);
    if (!r.ok) throw new Error("assegnazione fallita");
    const righe = await consegneDelCompito(r.compitoId);
    expect(righe).toHaveLength(2);
    expect(righe.every((x) => x.fatti === 0)).toBe(true);
  });

  it("compitiDellaClasse riporta il nome della batteria e il numero di esercizi", async () => {
    const r = await assegna(batteriaId, classeId, teacherId);
    if (!r.ok) throw new Error("assegnazione fallita");
    const dellaClasse = await compitiDellaClasse(classeId);
    expect(dellaClasse).toHaveLength(1);
    expect(dellaClasse[0]).toMatchObject({ id: r.compitoId, batteria: `${P}Batteria`, esercizi: 3 });
  });

  // I tre casi limite che la spec dichiara e che senza un test resterebbero
  // opinioni.

  it("chi entra nella classe DOPO l'assegnazione vede comunque il compito", async () => {
    const r = await assegna(batteriaId, classeId, teacherId);
    if (!r.ok) throw new Error("assegnazione fallita");
    const tardivo = await prisma.user.create({ data: { email: `${P}tardivo@test.it`, name: "T", role: "STUDENT" } });
    await prisma.classeStudente.create({ data: { classeId, studentId: tardivo.id } });
    const suoi = await compitiDelloStudente(tardivo.id);
    expect(suoi.map((c) => c.id)).toContain(r.compitoId);
    expect(await consegneDelCompito(r.compitoId)).toHaveLength(3);
  });

  it("chi esce dalla classe sparisce dalle consegne ma i suoi tentativi restano", async () => {
    const r = await assegna(batteriaId, classeId, teacherId);
    if (!r.ok) throw new Error("assegnazione fallita");
    const versione = (await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } })).drawnVersionIds[0]!;
    const t = await prisma.tentativo.create({
      data: { studentId, esercizioVersioneId: versione, compitoId: r.compitoId, seed: "x" },
    });
    await prisma.classeStudente.delete({ where: { classeId_studentId: { classeId, studentId } } });
    expect((await consegneDelCompito(r.compitoId)).map((x) => x.studentId)).not.toContain(studentId);
    expect(await prisma.tentativo.findUnique({ where: { id: t.id } })).not.toBeNull();
  });

  it("una classe senza studenti si assegna lo stesso, con zero consegne", async () => {
    const vuota = await prisma.classe.create({
      data: { googleGroupEmail: `${P}vuota@scuola.it`, name: "Vuota", yearLevel: 1 },
    });
    await prisma.classeDocente.create({ data: { classeId: vuota.id, teacherId } });
    const r = await assegna(batteriaId, vuota.id, teacherId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await consegneDelCompito(r.compitoId)).toEqual([]);
  });

  // Prova di composizione oltre i test del brief: due contenitori con
  // esercizi che si sovrappongono, una batteria che pesca da entrambi, e la
  // verifica che le versioni pescate siano reali, distinte e appartengano al
  // contenitore giusto.
  it("una batteria con piu' regole pesca da entrambi i contenitori con versioni reali e distinte", async () => {
    const overlap = await creaEsercizioConVersione(`${P}overlap`, "Overlap");
    const soloB = await creaEsercizioConVersione(`${P}soloB`, "Solo B");
    const soloB2 = await creaEsercizioConVersione(`${P}soloB2`, "Solo B2");

    const contB = (await prisma.contenitore.create({ data: { name: `${P}Sistemi`, createdById: teacherId } })).id;
    // "overlap" sta in entrambi i contenitori: anche se il sorteggio di
    // Equazioni lo pesca (escludendolo così dal bacino di Sistemi), a Sistemi
    // restano comunque due esercizi propri per soddisfare la regola.
    await prisma.contenitoreEsercizio.createMany({
      data: [
        { contenitoreId: contB, esercizioId: overlap },
        { contenitoreId: contB, esercizioId: soloB },
        { contenitoreId: contB, esercizioId: soloB2 },
      ],
    });
    await aggiungiEsercizi(contenitoreId, [overlap]);

    const batteriaMista = (await creaBatteria(teacherId, `${P}Mista`, [
      { contenitoreId, count: 2 },
      { contenitoreId: contB, count: 2 },
    ])).id;

    const r = await assegna(batteriaMista, classeId, teacherId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const c = await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } });
    expect(c.drawnVersionIds).toHaveLength(4);
    // Distinte: nessuna versione ripetuta.
    expect(new Set(c.drawnVersionIds).size).toBe(4);

    const versioni = await prisma.esercizioVersione.findMany({ where: { id: { in: c.drawnVersionIds } } });
    expect(versioni).toHaveLength(4); // reali: esistono davvero nel database

    // Le prime due (regola sul primo contenitore, order 0) vengono da
    // esercizi che stanno in `contenitoreId`; le ultime due (order 1) da
    // esercizi che stanno in `contB`.
    const contenitoreIdDelleVersioni = await Promise.all(
      c.drawnVersionIds.map(async (vid) => {
        const v = versioni.find((x) => x.id === vid)!;
        return v.esercizioId;
      }),
    );
    const inContA = new Set(
      (await prisma.contenitoreEsercizio.findMany({ where: { contenitoreId } })).map((x) => x.esercizioId),
    );
    const inContB = new Set(
      (await prisma.contenitoreEsercizio.findMany({ where: { contenitoreId: contB } })).map((x) => x.esercizioId),
    );
    const [primaMeta, secondaMeta] = [contenitoreIdDelleVersioni.slice(0, 2), contenitoreIdDelleVersioni.slice(2, 4)];
    expect(primaMeta.every((eid) => inContA.has(eid))).toBe(true);
    expect(secondaMeta.every((eid) => inContB.has(eid))).toBe(true);
  });
});
