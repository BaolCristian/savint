import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  compitoApribile,
  compitiDellaClasse,
  compitiDelloStudente,
  consegneDelCompito,
  modificaDateCompito,
  ritiraCompito,
} from "../compiti";
import { percorsoCompitoStudente } from "../percorso-compito";
import { andamentoDellaClasse, statisticheDelCompito } from "../statistiche";
import { esercizioApribileDaStudente } from "../pratica";
import { abbandona, applicaRisposta, avviaORiprendi, completa } from "../tentativo";

// Una verifica è un `Compito` con `tipo: VERIFICA`: le letture dei compiti
// la devono ignorare (o, per il docente, etichettare), e le rotte dei
// compiti non devono mai toccare un tentativo di una prova. Prefisso
// proprio: il database di sviluppo è condiviso con le altre suite.
const P = "verificaesclusatest-";
let docente: string;
let studente: string;
let classe: string;
let batteria: string;
let normale: { esercizioId: string; versioneId: string };
let diVerifica: { esercizioId: string; versioneId: string };
let compitoId: string;
let verificaId: string;

const layout = [{ quanti: 1, punti: 1, quantiPdp: 1, scelti: false, nonPerPdp: [] }];

async function utente(nome: string, role: "TEACHER" | "STUDENT") {
  return (await prisma.user.create({ data: { email: `${P}${nome}@test.it`, name: nome, role } })).id;
}

// Un esercizio privato (nessun accesso della scuola) con una versione.
async function esercizio(id: string, topic: string) {
  const e = await prisma.esercizio.create({
    data: { id: `${P}${id}`, title: id, authorId: docente, topic, yearLevel: 2, tags: [], difficulty: 1 },
  });
  const v = await prisma.esercizioVersione.create({
    data: { esercizioId: e.id, version: 1, content: { testo: id }, hash: `h-${P}${id}` },
  });
  return { esercizioId: e.id, versioneId: v.id };
}

beforeEach(async () => {
  await prisma.tentativo.deleteMany({ where: { student: { email: { startsWith: P } } } });
  await prisma.compito.deleteMany({ where: { batteria: { name: { startsWith: P } } } });
  await prisma.batteria.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.classe.deleteMany({ where: { googleGroupEmail: { startsWith: P } } });
  await prisma.esercizioVersione.deleteMany({ where: { esercizio: { id: { startsWith: P } } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });

  docente = await utente("d", "TEACHER");
  studente = await utente("s", "STUDENT");
  classe = (await prisma.classe.create({ data: { googleGroupEmail: `${P}classe@scuola.it`, name: "2A" } })).id;
  await prisma.classeDocente.create({ data: { classeId: classe, teacherId: docente } });
  await prisma.classeStudente.create({ data: { classeId: classe, studentId: studente } });
  batteria = (await prisma.batteria.create({ data: { name: `${P}batteria`, createdById: docente, automatica: true } })).id;
  normale = await esercizio("normale", `${P}argomento-compito`);
  diVerifica = await esercizio("verifica", `${P}argomento-verifica`);

  const base = { batteriaId: batteria, classeId: classe, assignedById: docente, drawSeed: "s" };
  compitoId = (await prisma.compito.create({ data: { ...base, drawnVersionIds: [normale.versioneId] } })).id;
  verificaId = (await prisma.compito.create({
    data: { ...base, tipo: "VERIFICA", drawnVersionIds: [diVerifica.versioneId] },
  })).id;
  await prisma.verifica.create({ data: { compitoId: verificaId, durataMinuti: 60, layout } });
});

// Una prova dello studente con un tentativo in corso, come la scriverebbero
// le rotte della verifica.
async function provaConTentativo() {
  const prova = await prisma.provaVerifica.create({ data: { compitoId: verificaId, studentId: studente } });
  const tentativo = await prisma.tentativo.create({
    data: { studentId: studente, esercizioVersioneId: diVerifica.versioneId, compitoId: verificaId, provaId: prova.id, seed: "s" },
  });
  return { prova, tentativo };
}

describe("una verifica non è un compito per le letture esistenti", () => {
  it("lo studente non la vede fra i suoi compiti", async () => {
    const compiti = await compitiDelloStudente(studente);
    expect(compiti.map((c) => c.id)).toEqual([compitoId]);
  });

  it("il docente la vede nell'elenco della classe, con il suo tipo", async () => {
    const elenco = await compitiDellaClasse(classe);
    expect(elenco.find((c) => c.id === verificaId)?.tipo).toBe("VERIFICA");
    expect(elenco.find((c) => c.id === compitoId)?.tipo).toBe("COMPITO");
  });

  it("non si apre come compito: il tentativo nasce libero e la richiesta risulta rifiutata", async () => {
    expect(await compitoApribile(verificaId, studente, diVerifica.esercizioId)).toBeNull();
    const aperto = await avviaORiprendi(studente, diVerifica.esercizioId, verificaId);
    expect(aperto?.richiestaCompitoRifiutata).toBe(true);
    const t = await prisma.tentativo.findUniqueOrThrow({ where: { id: aperto!.tentativoId } });
    expect(t.compitoId).toBeNull();
  });

  it("non ha un percorso da compito", async () => {
    expect(await percorsoCompitoStudente(verificaId, studente)).toBeNull();
  });

  it("consegne e statistiche del compito la trattano come inesistente", async () => {
    expect(await consegneDelCompito(verificaId, docente)).toEqual({ ok: true, righe: [] });
    expect(await statisticheDelCompito(verificaId, docente)).toEqual({ ok: false, motivo: "compito_non_trovato" });
  });

  it("l'andamento della classe non conta i suoi esercizi", async () => {
    const andamento = await andamentoDellaClasse(classe, docente);
    if (!andamento.ok) throw new Error("andamento non trovato");
    expect(andamento.compiti).toBe(1);
    expect(andamento.righe.map((r) => r.argomento)).toEqual([`${P}argomento-compito`]);
  });

  it("le date non si cambiano come per un compito, ma si può ritirare", async () => {
    expect(await modificaDateCompito(verificaId, docente, { opensAt: null, dueAt: null }))
      .toEqual({ ok: false, motivo: "compito_non_trovato" });
    expect(await ritiraCompito(verificaId, docente)).toEqual({ ok: true });
    const riletta = await prisma.compito.findUniqueOrThrow({ where: { id: verificaId } });
    expect(riletta.ritiratoAt).not.toBeNull();
  });
});

describe("le rotte dei compiti non toccano un tentativo di una prova", () => {
  it("rispondere, completare e abbandonare rispondono non trovato e non cambiano niente", async () => {
    const { tentativo } = await provaConTentativo();
    expect(await applicaRisposta(tentativo.id, studente, "p0", { kind: "number", value: 1 } as never, null, "it"))
      .toEqual({ ok: false, motivo: "non_trovato" });
    expect(await completa(tentativo.id, studente, "it")).toEqual({ ok: false, motivo: "non_trovato" });
    expect(await abbandona(tentativo.id, studente)).toEqual({ ok: false, motivo: "non_trovato" });

    const riletto = await prisma.tentativo.findUniqueOrThrow({ where: { id: tentativo.id } });
    expect(riletto.status).toBe("IN_PROGRESS");
    expect(riletto.state).toBeNull();
    expect(riletto.score).toBe(tentativo.score);
    expect(riletto.completedAt).toBeNull();
  });
});

describe("pratica libera di un esercizio avuto solo in una verifica", () => {
  it("si apre solo dopo la pubblicazione dei risultati dello studente", async () => {
    expect(await esercizioApribileDaStudente(studente, diVerifica.esercizioId)).toBe(false);
    const { prova } = await provaConTentativo();
    expect(await esercizioApribileDaStudente(studente, diVerifica.esercizioId)).toBe(false);
    await prisma.provaVerifica.update({ where: { id: prova.id }, data: { pubblicataAt: new Date() } });
    expect(await esercizioApribileDaStudente(studente, diVerifica.esercizioId)).toBe(true);
  });
});
