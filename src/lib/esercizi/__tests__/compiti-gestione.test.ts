import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  modificaDateCompito, ritiraCompito,
  compitiDellaClasse, compitiDelloStudente, compitoApribile, consegneDelCompito,
} from "../compiti";
import { percorsoCompitoStudente } from "../percorso-compito";
import { avviaORiprendi } from "../tentativo";

// Prefisso proprio di questo file (vedi il commento in seed.test.ts): i file
// di test girano in parallelo sullo stesso database, e ogni cancellazione
// qui sotto filtra su questo prefisso per non toccare righe di altri file.
const P = "compitigestionetest-";

let assegnatore: string;      // ha assegnato il compito E insegna la classe
let collega: string;          // insegna la classe, ma non l'ha assegnato lui
let exAssegnatore: string;    // l'ha assegnato, ma non insegna più la classe
let estraneo: string;         // né l'una né l'altra cosa
let studentId: string;
let classeId: string;
let batteriaId: string;
let esercizioId: string;
let versioneId: string;

const GIORNO = 86_400_000;
const fra = (giorni: number) => new Date(Date.now() + giorni * GIORNO);

async function nuovoCompito(dati: { assignedById?: string; opensAt?: Date | null; dueAt?: Date | null } = {}) {
  return (await prisma.compito.create({
    data: {
      batteriaId,
      classeId,
      assignedById: dati.assignedById ?? assegnatore,
      drawSeed: "seme",
      drawnVersionIds: [versioneId],
      opensAt: dati.opensAt ?? null,
      dueAt: dati.dueAt ?? null,
    },
  })).id;
}

beforeEach(async () => {
  await prisma.tentativo.deleteMany({ where: { student: { email: { startsWith: P } } } });
  await prisma.compito.deleteMany({ where: { batteria: { name: { startsWith: P } } } });
  await prisma.batteria.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.classeStudente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.classeDocente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.classe.deleteMany({ where: { googleGroupEmail: { startsWith: P } } });
  await prisma.esercizioVersione.deleteMany({ where: { esercizio: { id: { startsWith: P } } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });

  const utente = async (nome: string, role: "TEACHER" | "STUDENT") =>
    (await prisma.user.create({ data: { email: `${P}${nome}@test.it`, name: nome, role } })).id;
  assegnatore = await utente("assegnatore", "TEACHER");
  collega = await utente("collega", "TEACHER");
  exAssegnatore = await utente("ex", "TEACHER");
  estraneo = await utente("estraneo", "TEACHER");
  studentId = await utente("studente", "STUDENT");

  classeId = (await prisma.classe.create({
    data: { googleGroupEmail: `${P}classe@scuola.it`, name: "Classe", yearLevel: 2 },
  })).id;
  await prisma.classeDocente.createMany({ data: [{ classeId, teacherId: assegnatore }, { classeId, teacherId: collega }] });
  await prisma.classeStudente.create({ data: { classeId, studentId } });

  batteriaId = (await prisma.batteria.create({ data: { name: `${P}batteria`, createdById: assegnatore } })).id;
  esercizioId = (await prisma.esercizio.create({
    data: { id: `${P}e1`, title: "Uno", yearLevel: 2, topic: "prova", tags: [], difficulty: 1 },
  })).id;
  versioneId = (await prisma.esercizioVersione.create({
    data: { esercizioId, version: 1, content: { testo: "Uno" }, hash: `h-${P}e1` },
  })).id;
});

describe("modificaDateCompito", () => {
  it("cambia apertura e scadenza di un compito assegnato", async () => {
    const id = await nuovoCompito({ dueAt: fra(3) });
    const opensAt = fra(1);
    const dueAt = fra(10);
    expect(await modificaDateCompito(id, assegnatore, { opensAt, dueAt })).toEqual({ ok: true });
    const riga = await prisma.compito.findUniqueOrThrow({ where: { id } });
    expect(riga.opensAt).toEqual(opensAt);
    expect(riga.dueAt).toEqual(dueAt);
  });

  it("toglie la scadenza (e l'apertura) quando arrivano null", async () => {
    const id = await nuovoCompito({ opensAt: fra(-1), dueAt: fra(3) });
    expect(await modificaDateCompito(id, assegnatore, { opensAt: null, dueAt: null })).toEqual({ ok: true });
    const riga = await prisma.compito.findUniqueOrThrow({ where: { id } });
    expect(riga.opensAt).toBeNull();
    expect(riga.dueAt).toBeNull();
  });

  it("non tocca gli esercizi pescati né il seme: sono congelati", async () => {
    const id = await nuovoCompito();
    await modificaDateCompito(id, assegnatore, { opensAt: null, dueAt: fra(5) });
    const riga = await prisma.compito.findUniqueOrThrow({ where: { id } });
    expect(riga.drawnVersionIds).toEqual([versioneId]);
    expect(riga.drawSeed).toBe("seme");
  });

  it("rifiuta una scadenza prima dell'apertura, come l'assegnazione", async () => {
    const id = await nuovoCompito({ dueAt: fra(3) });
    expect(await modificaDateCompito(id, assegnatore, { opensAt: fra(5), dueAt: fra(4) }))
      .toEqual({ ok: false, motivo: "scadenza_prima_apertura" });
    expect((await prisma.compito.findUniqueOrThrow({ where: { id } })).dueAt).not.toBeNull();
  });

  it("rifiuta una scadenza nuova già nel passato, come l'assegnazione", async () => {
    const dueAt = fra(3);
    const id = await nuovoCompito({ dueAt });
    expect(await modificaDateCompito(id, assegnatore, { opensAt: null, dueAt: fra(-2) }))
      .toEqual({ ok: false, motivo: "scadenza_nel_passato" });
    expect((await prisma.compito.findUniqueOrThrow({ where: { id } })).dueAt).toEqual(dueAt);
  });

  // Un compito già scaduto a cui il docente cambia solo l'apertura: la
  // scadenza passata è quella che c'era, non un anno digitato male adesso.
  it("accetta una scadenza passata se è quella già salvata, invariata", async () => {
    const scaduta = fra(-2);
    const id = await nuovoCompito({ dueAt: scaduta });
    expect(await modificaDateCompito(id, assegnatore, { opensAt: fra(-5), dueAt: scaduta })).toEqual({ ok: true });
  });

  it("chi insegna la classe può modificare anche un compito assegnato da un collega", async () => {
    const id = await nuovoCompito();
    expect(await modificaDateCompito(id, collega, { opensAt: null, dueAt: fra(4) })).toEqual({ ok: true });
  });

  it("chi l'ha assegnato può modificarlo anche se non insegna più la classe", async () => {
    const id = await nuovoCompito({ assignedById: exAssegnatore });
    expect(await modificaDateCompito(id, exAssegnatore, { opensAt: null, dueAt: fra(4) })).toEqual({ ok: true });
  });

  it("un docente estraneo riceve 'non trovato', e la riga resta com'era", async () => {
    const id = await nuovoCompito();
    expect(await modificaDateCompito(id, estraneo, { opensAt: null, dueAt: fra(4) }))
      .toEqual({ ok: false, motivo: "compito_non_trovato" });
    expect((await prisma.compito.findUniqueOrThrow({ where: { id } })).dueAt).toBeNull();
  });

  it("un id inesistente riceve 'non trovato'", async () => {
    expect(await modificaDateCompito(`${P}nessuno`, assegnatore, { opensAt: null, dueAt: null }))
      .toEqual({ ok: false, motivo: "compito_non_trovato" });
  });

  it("un compito ritirato non si modifica più", async () => {
    const id = await nuovoCompito();
    await ritiraCompito(id, assegnatore);
    expect(await modificaDateCompito(id, assegnatore, { opensAt: null, dueAt: fra(4) }))
      .toEqual({ ok: false, motivo: "compito_non_trovato" });
  });
});

describe("ritiraCompito", () => {
  it("segna il compito come ritirato senza cancellare la riga né i tentativi", async () => {
    const id = await nuovoCompito();
    await prisma.tentativo.create({
      data: { studentId, esercizioVersioneId: versioneId, seed: "s", compitoId: id, status: "COMPLETED", score: 1, maxScore: 1 },
    });
    expect(await ritiraCompito(id, assegnatore)).toEqual({ ok: true });
    const riga = await prisma.compito.findUniqueOrThrow({ where: { id } });
    expect(riga.ritiratoAt).toBeInstanceOf(Date);
    const tentativi = await prisma.tentativo.findMany({ where: { compitoId: id } });
    expect(tentativi).toHaveLength(1);
  });

  it("chi insegna la classe può ritirarlo", async () => {
    const id = await nuovoCompito();
    expect(await ritiraCompito(id, collega)).toEqual({ ok: true });
  });

  it("chi l'ha assegnato può ritirarlo anche se non insegna più la classe", async () => {
    const id = await nuovoCompito({ assignedById: exAssegnatore });
    expect(await ritiraCompito(id, exAssegnatore)).toEqual({ ok: true });
  });

  it("un docente estraneo riceve 'non trovato' e il compito resta attivo", async () => {
    const id = await nuovoCompito();
    expect(await ritiraCompito(id, estraneo)).toEqual({ ok: false, motivo: "compito_non_trovato" });
    expect((await prisma.compito.findUniqueOrThrow({ where: { id } })).ritiratoAt).toBeNull();
  });

  it("ritirarlo due volte: la seconda risponde 'non trovato' e non sposta la data", async () => {
    const id = await nuovoCompito();
    await ritiraCompito(id, assegnatore);
    const prima = (await prisma.compito.findUniqueOrThrow({ where: { id } })).ritiratoAt;
    expect(await ritiraCompito(id, assegnatore)).toEqual({ ok: false, motivo: "compito_non_trovato" });
    expect((await prisma.compito.findUniqueOrThrow({ where: { id } })).ritiratoAt).toEqual(prima);
  });
});

// Le vie di LETTURA: ognuna deve trattare un compito ritirato come se non
// esistesse. È la famiglia di difetti più ricorrente di questo modulo — la
// scrittura controlla, la lettura si fida — quindi ogni via ha il suo test.
describe("un compito ritirato sparisce da ogni lettura", () => {
  let attivo: string;
  let ritirato: string;

  beforeEach(async () => {
    attivo = await nuovoCompito();
    ritirato = await nuovoCompito();
    await ritiraCompito(ritirato, assegnatore);
  });

  it("compitiDellaClasse (elenchi del docente) non lo elenca", async () => {
    const ids = (await compitiDellaClasse(classeId)).map((c) => c.id);
    expect(ids).toContain(attivo);
    expect(ids).not.toContain(ritirato);
  });

  it("compitiDelloStudente (la home dello studente) non lo elenca", async () => {
    const ids = (await compitiDelloStudente(studentId)).map((c) => c.id);
    expect(ids).toContain(attivo);
    expect(ids).not.toContain(ritirato);
  });

  it("compitoApribile lo respinge anche con un compitoId scritto a mano", async () => {
    expect(await compitoApribile(attivo, studentId, esercizioId)).toBe(versioneId);
    expect(await compitoApribile(ritirato, studentId, esercizioId)).toBeNull();
  });

  it("percorsoCompitoStudente (/studente/compito/[id]) non lo apre", async () => {
    expect(await percorsoCompitoStudente(attivo, studentId)).not.toBeNull();
    expect(await percorsoCompitoStudente(ritirato, studentId)).toBeNull();
  });

  it("avviaORiprendi con il suo compitoId apre l'esercizio come libero, senza legarlo al compito", async () => {
    const aperto = await avviaORiprendi(studentId, esercizioId, ritirato);
    expect(aperto?.richiestaCompitoRifiutata).toBe(true);
    const riga = await prisma.tentativo.findUniqueOrThrow({ where: { id: aperto!.tentativoId } });
    expect(riga.compitoId).toBeNull();
  });

  it("avviaORiprendi non riprende un tentativo IN_PROGRESS già legato al compito ritirato", async () => {
    const vecchio = await prisma.tentativo.create({
      data: { studentId, esercizioVersioneId: versioneId, seed: "s", compitoId: ritirato },
    });
    const aperto = await avviaORiprendi(studentId, esercizioId, ritirato);
    expect(aperto?.tentativoId).not.toBe(vecchio.id);
  });

  it("consegneDelCompito non restituisce righe, come per un compito inesistente", async () => {
    expect(await consegneDelCompito(ritirato, assegnatore)).toEqual({ ok: true, righe: [] });
    const attive = await consegneDelCompito(attivo, assegnatore);
    expect(attive.ok && attive.righe.length).toBe(1);
  });
});
