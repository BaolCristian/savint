import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { loadQuestion, type NumbasQuestionJSON, type QuestionState } from "@savint/engine";
import { prisma } from "@/lib/db/client";
import { assegnaCompito } from "../compiti";
import { esercizioApribileDaStudente } from "../pratica";
import { consegnaProva, entraNellaProva, salvaRisposta, type ProvaAperta } from "../prova-verifica";
import { avviaRecupero, avviaVerifica, chiudiVerifica, monitoraggioVerifica } from "../verifiche";
import {
  dettaglioRisposta,
  modificaPunti,
  pubblicaRisultati,
  risultatiDelloStudente,
  risultatiVerifica,
  type Risultati,
} from "../risultati-verifica";

// Modalità verifica, Task 11: correzione, pubblicazione e risultati. Ogni
// funzione che dipende dal tempo riceve `ora` esplicita.
const P = "risultativerificatest-";
const e = (n: number) => `${P}e${n}`;
const MIN = 60_000;

// Una domanda con svolgimento e due parti, senza variabili: 2+1 e 2+2.
const parte = (prompt: string, valore: string) => ({
  type: "numberentry",
  marks: 1,
  prompt,
  minValue: valore,
  maxValue: valore,
  correctAnswerFraction: false,
  allowFractions: false,
  notationStyles: ["plain", "en", "plain-eu", "eu"],
  correctAnswerStyle: "plain-eu",
});
const CONTENUTO = {
  name: "Due somme",
  statement: "<p>Calcola.</p>",
  advice: "<p>Svolgimento segreto</p>",
  variables: {},
  variablesTest: { condition: "", maxRuns: 10 },
  ungrouped_variables: [],
  variable_groups: [],
  functions: {},
  rulesets: {},
  parts: [parte("<p>2+1</p>", "3"), parte("<p>2+2</p>", "4")],
};

let docenteId: string;
let estraneoId: string;
let classeId: string;
let raccoltaId: string;
let studenti: string[];

async function pulisci() {
  await prisma.compito.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.batteria.deleteMany({ where: { createdBy: { email: { startsWith: P } } } });
  await prisma.classe.deleteMany({ where: { googleGroupEmail: { startsWith: P } } });
  await prisma.contenitore.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
}

beforeEach(async () => {
  await pulisci();
  docenteId = (await prisma.user.create({ data: { email: `${P}d@test.it`, name: "D", role: "TEACHER" } })).id;
  estraneoId = (await prisma.user.create({ data: { email: `${P}x@test.it`, name: "X", role: "TEACHER" } })).id;
  studenti = [];
  for (let i = 0; i < 3; i++) {
    studenti.push((await prisma.user.create({ data: { email: `${P}s${i}@test.it`, name: `S${i}`, role: "STUDENT" } })).id);
  }
  classeId = (await prisma.classe.create({ data: { name: "3B", yearLevel: 3, googleGroupEmail: `${P}3b@test.it` } })).id;
  await prisma.classeDocente.create({ data: { classeId, teacherId: docenteId } });
  await prisma.classeStudente.createMany({ data: studenti.map((studentId) => ({ classeId, studentId })) });

  // Esercizi privati del docente: lo studente li apre in pratica solo
  // grazie alla sua prova pubblicata.
  const base = { topic: `${P}topic`, yearLevel: 3, tags: [], difficulty: 1, authorId: docenteId };
  for (let n = 1; n <= 6; n++) await prisma.esercizio.create({ data: { id: e(n), title: `E${n}`, ...base } });
  await prisma.esercizioVersione.createMany({
    data: Array.from({ length: 6 }, (_, i) => ({ esercizioId: e(i + 1), version: 1, content: CONTENUTO, hash: `${P}h${i}` })),
  });
  raccoltaId = (await prisma.contenitore.create({ data: { name: `${P}Raccolta`, createdById: docenteId } })).id;
  await prisma.contenitoreEsercizio.createMany({ data: [1, 2, 3, 4].map((n) => ({ contenitoreId: raccoltaId, esercizioId: e(n) })) });
});

afterAll(pulisci);

// Un layout da 20 punti: 3 esercizi da 4 dalla raccolta (2 con «meno
// esercizi») e i due scelti da 4. Con «meno esercizi» le posizioni [0, 1,
// 3, 4], 16 punti.
async function verificaAvviata(): Promise<string> {
  const esito = await assegnaCompito({
    classeId,
    teacherId: docenteId,
    blocchi: [
      { tipo: "raccolta", contenitoreId: raccoltaId, quanti: 3, quantiPdp: 2, punti: 4 },
      { tipo: "scelti", esercizioIds: [e(5), e(6)], nonPerPdp: [], punti: 4 },
    ],
    modo: "CLASSE",
    seme: "seme-risultati",
    tipo: "VERIFICA",
    verifica: { durataMinuti: 60, calcolatrice: "NESSUNO", formulario: "NESSUNO" },
  });
  if (!esito.ok) throw new Error(esito.motivo);
  expect(await avviaVerifica(esito.compitoId, docenteId, T0)).toEqual({ ok: true });
  return esito.compitoId;
}

const T0 = new Date("2030-01-10T10:00:00Z");
const dopo = (minuti: number, da = T0) => new Date(da.getTime() + minuti * MIN);

async function entra(id: string, studentId: string, ora = dopo(1)): Promise<ProvaAperta> {
  const esito = await entraNellaProva(id, studentId, ora);
  if (!esito.ok) throw new Error(esito.motivo);
  return esito.prova;
}

/** Lo stato con entrambe le parti giuste, o entrambe sbagliate. */
function stato(seed: string, giusto: boolean): QuestionState {
  const q = loadQuestion(CONTENUTO as unknown as NumbasQuestionJSON, { seed, locale: "it" });
  q.getPart("p0")!.submit(giusto ? "3" : "7");
  q.getPart("p1")!.submit(giusto ? "4" : "7");
  q.updateScore();
  return q.toState();
}

/** Lo studente entra, risponde (giusto per gli esercizi in `giusti`, gli
 * indici da 0 nella sua prova) e consegna. */
async function svolgi(id: string, studentId: string, giusti: (i: number) => boolean, ora = dopo(1)): Promise<ProvaAperta> {
  const prova = await entra(id, studentId, ora);
  for (const [i, x] of prova.esercizi.entries()) {
    const esito = await salvaRisposta(id, studentId, x.tentativoId, stato(x.seed, giusti(i)), dopo(1, ora));
    expect(esito.ok).toBe(true);
  }
  expect(await consegnaProva(id, studentId, dopo(2, ora))).toEqual({ ok: true });
  return prova;
}

/** La classe tipo: S0 tutto giusto, S1 con «meno esercizi» giusti i primi
 * tre su quattro, S2 assente. Poi la verifica si chiude. */
async function classeCorretta(): Promise<string> {
  await prisma.misurePdp.create({ data: { classeId, studentId: studenti[1]!, menoEsercizi: true } });
  const id = await verificaAvviata();
  await svolgi(id, studenti[0]!, () => true);
  await svolgi(id, studenti[1]!, (i) => i < 3);
  expect(await chiudiVerifica(id, docenteId, dopo(10))).toEqual({ ok: true });
  return id;
}

async function risultati(id: string): Promise<Risultati> {
  const esito = await risultatiVerifica(id, docenteId, dopo(11));
  if (!esito.ok) throw new Error(esito.motivo);
  return esito.risultati;
}

const rigaDi = (r: Risultati, studentId: string) => r.righe.find((x) => x.studentId === studentId)!;

describe("risultatiVerifica", () => {
  it("durante la prova nessun punteggio, neanche al docente; estraneo ⇒ non_trovata", async () => {
    const id = await verificaAvviata();
    await svolgi(id, studenti[0]!, () => true);
    expect(await risultatiVerifica(id, docenteId, dopo(5))).toEqual({ ok: false, motivo: "stato_non_valido" });
    expect(await risultatiVerifica(id, estraneoId, dopo(5))).toEqual({ ok: false, motivo: "non_trovata" });
  });

  it("dopo la chiusura: tutto giusto ⇒ 20/20; meno esercizi 12 su 16 ⇒ 15 e 75 %; assente ⇒ 0 e recuperabile", async () => {
    const id = await classeCorretta();
    const r = await risultati(id);
    expect(r.stato).toBe("CHIUSA");
    expect(r.totalePieno).toBe(20);
    expect(r.colonne).toEqual([0, 1, 2, 3, 4].map((posizione) => ({ posizione, punti: 4 })));
    expect(r.righe.map((x) => x.nome)).toEqual(["S0", "S1", "S2"]);

    const s0 = rigaDi(r, studenti[0]!);
    expect(s0).toMatchObject({ stato: "consegnato", menoEsercizi: false, ottenuto: 20, totaleStudente: 20, finale: 20, percentuale: 100, pubblicata: false });
    expect(s0.celle.every((c) => c !== null && c.punti === 4 && c.puntiMax === 4 && !c.manuale)).toBe(true);
    expect(s0.celle.map((c) => c!.posizione)).toEqual([0, 1, 2, 3, 4]);

    const s1 = rigaDi(r, studenti[1]!);
    expect(s1).toMatchObject({ stato: "consegnato", menoEsercizi: true, ottenuto: 12, totaleStudente: 16, finale: 15, percentuale: 75 });
    expect(s1.celle[2]).toBeNull();
    expect(s1.celle.map((c) => c?.punti ?? null)).toEqual([4, 4, null, 4, 0]);
    expect(s1.celle[4]!.titolo).toMatch(/^E[56]$/);

    const s2 = rigaDi(r, studenti[2]!);
    expect(s2).toMatchObject({ stato: "assente", ottenuto: 0, totaleStudente: 0, finale: 0, percentuale: 0, uscite: 0, eventi: [] });
    expect(s2.celle).toEqual([null, null, null, null, null]);
    const monitoraggio = await monitoraggioVerifica(id, docenteId, dopo(11));
    expect(monitoraggio!.righe.find((x) => x.studentId === studenti[2]!)!.recuperabile).toBe(true);
    expect(await avviaRecupero(id, docenteId, [studenti[2]!], dopo(12))).toEqual({ ok: true });
  });

  it("le uscite della prova: conteggio, tempo fuori ed eventi in ordine", async () => {
    const id = await classeCorretta();
    const prova = await prisma.provaVerifica.findUniqueOrThrow({ where: { compitoId_studentId: { compitoId: id, studentId: studenti[0]! } } });
    await prisma.eventoVerifica.createMany({
      data: [
        { provaId: prova.id, tipo: "USCITA", motivo: "SCHEDA", at: dopo(1.5), durataMs: null },
        { provaId: prova.id, tipo: "RIENTRO", motivo: null, at: dopo(1.75), durataMs: 15_000 },
      ],
    });
    const s0 = rigaDi(await risultati(id), studenti[0]!);
    expect(s0.uscite).toBe(1);
    expect(s0.secondiFuori).toBe(15);
    expect(s0.eventi).toEqual([
      { tipo: "USCITA", motivo: "SCHEDA", at: dopo(1.5), durataMs: null },
      { tipo: "RIENTRO", motivo: null, at: dopo(1.75), durataMs: 15_000 },
    ]);
  });

  it("un recupero aperto è una riga in_corso senza punti", async () => {
    const id = await classeCorretta();
    expect(await avviaRecupero(id, docenteId, [studenti[2]!], dopo(12))).toEqual({ ok: true });
    await entra(id, studenti[2]!, dopo(13));
    const s2 = rigaDi(await risultati(id), studenti[2]!);
    expect(s2).toMatchObject({ stato: "in_corso", recupero: true, finale: 0, totaleStudente: 0 });
    expect(s2.celle.every((c) => c === null)).toBe(true);
  });
});

describe("modificaPunti e dettaglioRisposta", () => {
  it("valori fuori passo o fuori scala ⇒ valore_non_valido; 1,25 ⇒ manuale e totale aggiornato; null ⇒ di nuovo automatico", async () => {
    const id = await classeCorretta();
    const cella = rigaDi(await risultati(id), studenti[1]!).celle[4]!;

    for (const v of [1.3, -0.25, 4.25, Number.NaN]) {
      expect(await modificaPunti(id, docenteId, cella.tentativoId, v)).toEqual({ ok: false, motivo: "valore_non_valido" });
    }
    expect(await modificaPunti(id, estraneoId, cella.tentativoId, 1)).toEqual({ ok: false, motivo: "non_trovata" });
    expect(await modificaPunti(id, docenteId, "nessuno", 1)).toEqual({ ok: false, motivo: "non_trovata" });

    expect(await modificaPunti(id, docenteId, cella.tentativoId, 1.25)).toEqual({ ok: true });
    let s1 = rigaDi(await risultati(id), studenti[1]!);
    expect(s1.celle[4]).toMatchObject({ punti: 1.25, manuale: true });
    expect(s1).toMatchObject({ ottenuto: 13.25, finale: 16.56 });

    expect(await modificaPunti(id, docenteId, cella.tentativoId, null)).toEqual({ ok: true });
    s1 = rigaDi(await risultati(id), studenti[1]!);
    expect(s1.celle[4]).toMatchObject({ punti: 0, manuale: false });
    expect(s1.finale).toBe(15);
  });

  it("a verifica in corso ⇒ stato_non_valido", async () => {
    const id = await verificaAvviata();
    const prova = await svolgi(id, studenti[0]!, () => true);
    expect(await modificaPunti(id, docenteId, prova.esercizi[0]!.tentativoId, 1)).toEqual({ ok: false, motivo: "stato_non_valido" });
    expect(await dettaglioRisposta(id, docenteId, prova.esercizi[0]!.tentativoId)).toBeNull();
  });

  it("dettaglioRisposta: contenuto originale con lo svolgimento, stato, punti", async () => {
    const id = await classeCorretta();
    const cella = rigaDi(await risultati(id), studenti[1]!).celle[0]!;
    const d = await dettaglioRisposta(id, docenteId, cella.tentativoId);
    expect(d).not.toBeNull();
    expect(JSON.stringify(d!.content)).toContain("Svolgimento segreto");
    expect(d!.state?.parts).toHaveLength(2);
    expect(d).toMatchObject({ punti: 4, puntiMax: 4, manuale: false });
    expect(await dettaglioRisposta(id, estraneoId, cella.tentativoId)).toBeNull();
  });
});

describe("pubblicaRisultati e risultatiDelloStudente", () => {
  it("null prima della pubblicazione, poi totale, esercizi e svolgimento; niente uscite né misure", async () => {
    const id = await classeCorretta();
    expect(await risultatiDelloStudente(id, studenti[0]!)).toBeNull();
    expect(await pubblicaRisultati(id, estraneoId, undefined, dopo(20))).toEqual({ ok: false, motivo: "non_trovata" });
    expect(await pubblicaRisultati(id, docenteId, undefined, dopo(20))).toEqual({ ok: true });

    const v = await prisma.verifica.findUniqueOrThrow({ where: { compitoId: id } });
    expect(v.pubblicataAt).toEqual(dopo(20));
    expect((await risultati(id)).stato).toBe("PUBBLICATA");

    const r0 = await risultatiDelloStudente(id, studenti[0]!);
    expect(r0).toMatchObject({ finale: 20, totalePieno: 20, percentuale: 100 });
    expect(r0!.esercizi.map((x) => [x.numero, x.punti, x.puntiMax])).toEqual([1, 2, 3, 4, 5].map((n) => [n, 4, 4]));
    expect(JSON.stringify(r0!.esercizi[0]!.content)).toContain("advice");
    expect(JSON.stringify(r0!.esercizi[0]!.content)).toContain("Svolgimento segreto");

    const r1 = await risultatiDelloStudente(id, studenti[1]!);
    expect(r1).toMatchObject({ finale: 15, totalePieno: 20, percentuale: 75 });
    expect(r1!.esercizi.map((x) => x.numero)).toEqual([1, 2, 3, 4]);
    const testo = JSON.stringify(r1);
    for (const vietato of ["uscite", "eventi", "menoEsercizi", "totaleStudente", "tempoExtra"]) expect(testo).not.toContain(vietato);

    expect(await risultatiDelloStudente(id, studenti[2]!)).toBeNull();
  });

  it("a verifica in corso ⇒ stato_non_valido", async () => {
    const id = await verificaAvviata();
    expect(await pubblicaRisultati(id, docenteId, undefined, dopo(5))).toEqual({ ok: false, motivo: "stato_non_valido" });
  });

  it("un recupero consegnato dopo la pubblicazione aspetta un secondo «Pubblica»; poi apre l'esercizio in pratica", async () => {
    const id = await classeCorretta();
    expect(await pubblicaRisultati(id, docenteId, undefined, dopo(20))).toEqual({ ok: true });
    expect(await avviaRecupero(id, docenteId, [studenti[2]!], dopo(30))).toEqual({ ok: true });
    await svolgi(id, studenti[2]!, () => true, dopo(31));

    expect(await risultatiDelloStudente(id, studenti[2]!)).toBeNull();
    expect(await risultatiDelloStudente(id, studenti[0]!)).not.toBeNull();
    expect(rigaDi(await risultati(id), studenti[2]!)).toMatchObject({ stato: "consegnato", pubblicata: false, finale: 20 });
    const esercizio = rigaDi(await risultati(id), studenti[2]!).celle[0]!.esercizioId;
    expect(await esercizioApribileDaStudente(studenti[2]!, esercizio)).toBe(false);

    expect(await pubblicaRisultati(id, docenteId, [studenti[2]!], dopo(40))).toEqual({ ok: true });
    expect(await risultatiDelloStudente(id, studenti[2]!)).toMatchObject({ finale: 20 });
    // Gli altri restano pubblicati con la loro data.
    const p0 = await prisma.provaVerifica.findUniqueOrThrow({ where: { compitoId_studentId: { compitoId: id, studentId: studenti[0]! } } });
    expect(p0.pubblicataAt).toEqual(dopo(20));
    expect((await prisma.verifica.findUniqueOrThrow({ where: { compitoId: id } })).pubblicataAt).toEqual(dopo(20));
    expect(await esercizioApribileDaStudente(studenti[2]!, esercizio)).toBe(true);
  });

  it("pubblicare solo alcuni: gli altri restano non pubblicati; studenti non iscritti ⇒ studenti_non_validi", async () => {
    const id = await classeCorretta();
    expect(await pubblicaRisultati(id, docenteId, [estraneoId], dopo(20))).toEqual({ ok: false, motivo: "studenti_non_validi" });
    expect(await pubblicaRisultati(id, docenteId, [studenti[0]!], dopo(20))).toEqual({ ok: true });
    expect(await risultatiDelloStudente(id, studenti[0]!)).not.toBeNull();
    expect(await risultatiDelloStudente(id, studenti[1]!)).toBeNull();
  });

  it("dopo la pubblicazione lo studente vede i punti modificati", async () => {
    const id = await classeCorretta();
    expect(await pubblicaRisultati(id, docenteId, undefined, dopo(20))).toEqual({ ok: true });
    const cella = rigaDi(await risultati(id), studenti[0]!).celle[0]!;
    expect(await modificaPunti(id, docenteId, cella.tentativoId, 2.5)).toEqual({ ok: true });
    const r0 = await risultatiDelloStudente(id, studenti[0]!);
    expect(r0!.esercizi[0]!.punti).toBe(2.5);
    expect(r0!.finale).toBe(18.5);
  });
});
