import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { loadQuestion, type NumbasQuestionJSON, type QuestionState } from "@savint/engine";
import { prisma } from "@/lib/db/client";
import { assegnaCompito, compitiDelloStudente, type DatiVerifica } from "../compiti";
import { avviaRecupero, avviaVerifica, chiudiVerifica } from "../verifiche";
import {
  consegnaProva,
  entraNellaProva,
  introProva,
  puoVedereFormulario,
  registraEventi,
  salvaRisposta,
  tempoProva,
  verificheDelloStudente,
  type EventoInput,
  type ProvaAperta,
} from "../prova-verifica";

// Modalità verifica, Task 6: la prova dello studente sul server. Ogni
// funzione che dipende dal tempo riceve `ora` esplicita.
const P = "provaverificatest-";
const e = (n: number) => `${P}e${n}`;
const MIN = 60_000;

// Una domanda vera con svolgimento e due parti, senza variabili: 2+1 e 2+2.
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

  const base = { topic: `${P}topic`, yearLevel: 3, tags: [], difficulty: 1, accessoScuola: "EDITOR" as const, authorId: docenteId };
  for (let n = 1; n <= 6; n++) await prisma.esercizio.create({ data: { id: e(n), title: `E${n}`, ...base } });
  await prisma.esercizioVersione.createMany({
    data: Array.from({ length: 6 }, (_, i) => ({ esercizioId: e(i + 1), version: 1, content: CONTENUTO, hash: `${P}h${i}` })),
  });
  raccoltaId = (await prisma.contenitore.create({ data: { name: `${P}Raccolta`, createdById: docenteId } })).id;
  await prisma.contenitoreEsercizio.createMany({ data: [1, 2, 3, 4].map((n) => ({ contenitoreId: raccoltaId, esercizioId: e(n) })) });
});

afterAll(pulisci);

// Il layout del Task 4: un blocco raccolta da 3 (2 per chi ha «meno
// esercizi») e un blocco scelti [e5, e6] con e6 escluso per i PDP. Senza
// misure 5 esercizi, con «meno esercizi» le posizioni [0, 1, 3].
async function creaVerifica(over: Partial<DatiVerifica> = {}): Promise<string> {
  const esito = await assegnaCompito({
    classeId,
    teacherId: docenteId,
    blocchi: [
      { tipo: "raccolta", contenitoreId: raccoltaId, quanti: 3, quantiPdp: 2, punti: 2 },
      { tipo: "scelti", esercizioIds: [e(5), e(6)], nonPerPdp: [e(6)], punti: 1 },
    ],
    modo: "CLASSE",
    seme: "seme-prova",
    tipo: "VERIFICA",
    verifica: { durataMinuti: 60, calcolatrice: "SOLO_PDP", formulario: "NESSUNO", ...over },
  });
  if (!esito.ok) throw new Error(esito.motivo);
  return esito.compitoId;
}

const T0 = new Date("2030-01-10T10:00:00Z");
const dopo = (minuti: number, da = T0) => new Date(da.getTime() + minuti * MIN);

async function avviata(over: Partial<DatiVerifica> = {}): Promise<string> {
  const id = await creaVerifica(over);
  expect(await avviaVerifica(id, docenteId, T0)).toEqual({ ok: true });
  return id;
}

async function entra(id: string, studentId: string, ora = dopo(1)): Promise<ProvaAperta> {
  const esito = await entraNellaProva(id, studentId, ora);
  if (!esito.ok) throw new Error(esito.motivo);
  return esito.prova;
}

/** Lo stato del client con la prima parte giusta («3»). */
function statoConRisposta(seed: string): QuestionState {
  const q = loadQuestion(CONTENUTO as unknown as NumbasQuestionJSON, { seed, locale: "it" });
  q.getPart("p0")!.submit("3");
  q.updateScore();
  return q.toState();
}

describe("entraNellaProva", () => {
  it("PREPARATA ⇒ non_iniziata, senza scrivere niente", async () => {
    const id = await creaVerifica();
    expect(await entraNellaProva(id, studenti[0]!, T0)).toEqual({ ok: false, motivo: "non_iniziata" });
    expect(await prisma.provaVerifica.count({ where: { compitoId: id } })).toBe(0);
  });

  it("non iscritto, compito inesistente ⇒ non_trovata", async () => {
    const id = await avviata();
    expect(await entraNellaProva(id, estraneoId, dopo(1))).toEqual({ ok: false, motivo: "non_trovata" });
    expect(await entraNellaProva("nessuno", studenti[0]!, dopo(1))).toEqual({ ok: false, motivo: "non_trovata" });
  });

  it("dopo l'avvio: N esercizi numerati 1..N senza svolgimento; la seconda volta stessi tentativi e semi", async () => {
    const id = await avviata();
    const prova = await entra(id, studenti[0]!);
    expect(prova.esercizi.map((x) => x.numero)).toEqual([1, 2, 3, 4, 5]);
    for (const x of prova.esercizi) {
      expect((x.content as { advice: string }).advice).toBe("");
      expect(JSON.stringify(x.content)).not.toContain("Svolgimento segreto");
      expect(x.state).toBeNull();
    }
    expect(prova.scadenza).toEqual(dopo(60));
    expect(prova.oraServer).toEqual(dopo(1));
    expect(prova).toMatchObject({ calcolatrice: false, formulario: false, formularioTipo: null });

    const riga = await prisma.provaVerifica.findUniqueOrThrow({ where: { compitoId_studentId: { compitoId: id, studentId: studenti[0]! } } });
    expect(riga.posizioni).toEqual([0, 1, 2, 3, 4]);
    expect(riga.entrataAt).toEqual(dopo(1));

    const ancora = await entra(id, studenti[0]!, dopo(5));
    expect(ancora.esercizi.map((x) => [x.tentativoId, x.seed])).toEqual(prova.esercizi.map((x) => [x.tentativoId, x.seed]));
    const dinuovo = await prisma.provaVerifica.findUniqueOrThrow({ where: { id: riga.id } });
    expect(dinuovo.entrataAt).toEqual(dopo(1));
  });

  it("due ingressi concorrenti ⇒ una ProvaVerifica, N tentativi, gli stessi per entrambi", async () => {
    const id = await avviata();
    const [a, b] = await Promise.all([entra(id, studenti[0]!), entra(id, studenti[0]!)]);
    expect(await prisma.provaVerifica.count({ where: { compitoId: id, studentId: studenti[0]! } })).toBe(1);
    expect(await prisma.tentativo.count({ where: { studentId: studenti[0]!, compitoId: id } })).toBe(5);
    expect(a.esercizi.map((x) => x.tentativoId)).toEqual(b.esercizi.map((x) => x.tentativoId));
  });

  it("«meno esercizi» ⇒ esercizi numerati 1..3 senza buchi, posizioni [0, 1, 3]", async () => {
    await prisma.misurePdp.create({ data: { classeId, studentId: studenti[1]!, menoEsercizi: true } });
    const id = await avviata();
    const prova = await entra(id, studenti[1]!);
    expect(prova.esercizi.map((x) => x.numero)).toEqual([1, 2, 3]);
    const riga = await prisma.provaVerifica.findUniqueOrThrow({ where: { compitoId_studentId: { compitoId: id, studentId: studenti[1]! } } });
    expect(riga.posizioni).toEqual([0, 1, 3]);
    const versioni = (await prisma.compito.findUniqueOrThrow({ where: { id } })).drawnVersionIds;
    const tentativi = await prisma.tentativo.findMany({ where: { id: { in: prova.esercizi.map((x) => x.tentativoId) } } });
    const versioneDi = new Map(tentativi.map((t) => [t.id, t.esercizioVersioneId]));
    expect(prova.esercizi.map((x) => versioneDi.get(x.tentativoId))).toEqual([versioni[0], versioni[1], versioni[3]]);
  });

  it("iscritto dopo l'avvio con misure di classe al 50 % ⇒ entra e la sua scadenza usa il 50 %", async () => {
    const id = await avviata();
    const nuovo = (await prisma.user.create({ data: { email: `${P}n@test.it`, name: "N", role: "STUDENT" } })).id;
    await prisma.classeStudente.create({ data: { classeId, studentId: nuovo } });
    await prisma.misurePdp.create({ data: { classeId, studentId: nuovo, tempoExtraPct: 50, calcolatrice: true } });
    const prova = await entra(id, nuovo, dopo(10));
    expect(prova.scadenza).toEqual(dopo(90));
    expect(prova.calcolatrice).toBe(true);
    const riga = await prisma.provaVerifica.findUniqueOrThrow({ where: { compitoId_studentId: { compitoId: id, studentId: nuovo } } });
    expect(riga).toMatchObject({ tempoExtraPct: 50, calcolatrice: true });
  });

  it("calcolatrice e formulario: TUTTI per tutti, SOLO_PDP solo con la misura, formulario solo con un file", async () => {
    await prisma.misurePdp.create({ data: { classeId, studentId: studenti[1]!, formulario: true } });
    const id = await avviata({ calcolatrice: "TUTTI", formulario: "SOLO_PDP" });
    await prisma.verifica.update({ where: { compitoId: id }, data: { formularioFile: "00000000-0000-0000-0000-000000000000.pdf" } });
    expect(await entra(id, studenti[0]!)).toMatchObject({ calcolatrice: true, formulario: false, formularioTipo: null });
    expect(await entra(id, studenti[1]!)).toMatchObject({ calcolatrice: true, formulario: true, formularioTipo: "pdf" });
  });

  it("consegnata ⇒ consegnata; oltre la scadenza senza essere mai entrato ⇒ tempo_scaduto", async () => {
    const id = await avviata();
    await entra(id, studenti[0]!);
    expect(await consegnaProva(id, studenti[0]!, dopo(2))).toEqual({ ok: true });
    expect(await entraNellaProva(id, studenti[0]!, dopo(3))).toEqual({ ok: false, motivo: "consegnata" });
    // studenti[1] ha ancora tempo grazie al 50 %: la verifica non si chiude.
    await prisma.misurePdp.create({ data: { classeId, studentId: studenti[1]!, tempoExtraPct: 50 } });
    expect(await entraNellaProva(id, studenti[2]!, dopo(61))).toEqual({ ok: false, motivo: "tempo_scaduto" });
  });

  it("verifica CHIUSA: senza prova ⇒ chiusa; con le sole misure copiate ⇒ chiusa; con un recupero ⇒ entra", async () => {
    await prisma.misurePdp.create({ data: { classeId, studentId: studenti[1]!, tempoExtraPct: 30 } });
    const id = await avviata();
    expect(await prisma.provaVerifica.count({ where: { compitoId: id, studentId: studenti[1]! } })).toBe(1);
    expect(await chiudiVerifica(id, docenteId, dopo(5))).toEqual({ ok: true });

    expect(await entraNellaProva(id, studenti[0]!, dopo(6))).toEqual({ ok: false, motivo: "chiusa" });
    expect(await entraNellaProva(id, studenti[1]!, dopo(6))).toEqual({ ok: false, motivo: "chiusa" });
    expect(await prisma.tentativo.count({ where: { compitoId: id } })).toBe(0);

    expect(await avviaRecupero(id, docenteId, [studenti[0]!, studenti[1]!], dopo(120))).toEqual({ ok: true });
    const prova = await entra(id, studenti[0]!, dopo(121));
    expect(prova.esercizi).toHaveLength(5);
    expect(prova.scadenza).toEqual(dopo(180));
    expect((await entra(id, studenti[1]!, dopo(121))).scadenza).toEqual(dopo(198));
  });

  it("recupero di chi era entrato: stesse posizioni, stessi tentativi e semi", async () => {
    await prisma.misurePdp.create({ data: { classeId, studentId: studenti[1]!, menoEsercizi: true } });
    const id = await avviata();
    const prima = await entra(id, studenti[1]!);
    expect(await chiudiVerifica(id, docenteId, dopo(5))).toEqual({ ok: true });
    expect(await avviaRecupero(id, docenteId, [studenti[1]!], dopo(120))).toEqual({ ok: true });
    // Le misure di classe cambiate nel frattempo non cambiano la prova.
    await prisma.misurePdp.update({
      where: { classeId_studentId: { classeId, studentId: studenti[1]! } },
      data: { menoEsercizi: false },
    });
    const dopoRecupero = await entra(id, studenti[1]!, dopo(121));
    expect(dopoRecupero.esercizi.map((x) => [x.numero, x.tentativoId, x.seed])).toEqual(
      prima.esercizi.map((x) => [x.numero, x.tentativoId, x.seed]),
    );
    const riga = await prisma.provaVerifica.findUniqueOrThrow({ where: { compitoId_studentId: { compitoId: id, studentId: studenti[1]! } } });
    expect(riga.posizioni).toEqual([0, 1, 3]);
  });

  it("lo stato restituito non porta punteggi", async () => {
    const id = await avviata();
    const prova = await entra(id, studenti[0]!);
    const t = prova.esercizi[0]!;
    expect(await salvaRisposta(id, studenti[0]!, t.tentativoId, statoConRisposta(t.seed), dopo(2))).toMatchObject({ ok: true });
    const di_nuovo = await entra(id, studenti[0]!, dopo(3));
    const stato = di_nuovo.esercizi[0]!.state!;
    expect(stato.parts[0]!.answer).toBeDefined();
    expect(stato.parts[0]!.answered).toBe(true);
    expect(stato.score).toBe(0);
    expect(stato.parts.every((p) => p.score === 0)).toBe(true);
  });
});

describe("salvaRisposta", () => {
  it("scrive state, score e maxScore sul tentativo; il risultato non ha punteggi; aggiorna ultimoSalvataggioAt", async () => {
    const id = await avviata();
    const prova = await entra(id, studenti[0]!);
    const t = prova.esercizi[0]!;
    const esito = await salvaRisposta(id, studenti[0]!, t.tentativoId, statoConRisposta(t.seed), dopo(2));
    expect(esito).toEqual({ ok: true, salvatoAt: dopo(2), scadenza: dopo(60) });
    const riga = await prisma.tentativo.findUniqueOrThrow({ where: { id: t.tentativoId } });
    expect(riga.score).toBe(1);
    expect(riga.maxScore).toBe(2);
    expect((riga.state as unknown as QuestionState).parts[0]!.answered).toBe(true);
    const p = await prisma.provaVerifica.findUniqueOrThrow({ where: { compitoId_studentId: { compitoId: id, studentId: studenti[0]! } } });
    expect(p.ultimoSalvataggioAt).toEqual(dopo(2));
  });

  it("il seme del tentativo vince su quello dello stato", async () => {
    const id = await avviata();
    const t = (await entra(id, studenti[0]!)).esercizi[0]!;
    expect(await salvaRisposta(id, studenti[0]!, t.tentativoId, statoConRisposta("falso"), dopo(2))).toMatchObject({ ok: true });
    const riga = await prisma.tentativo.findUniqueOrThrow({ where: { id: t.tentativoId } });
    expect((riga.state as unknown as QuestionState).seed).toBe(t.seed);
  });

  it("tentativo di un altro studente, o di un'altra verifica ⇒ non_trovata", async () => {
    const id = await avviata();
    const t = (await entra(id, studenti[0]!)).esercizi[0]!;
    await entra(id, studenti[1]!);
    expect(await salvaRisposta(id, studenti[1]!, t.tentativoId, statoConRisposta(t.seed), dopo(2))).toEqual({ ok: false, motivo: "non_trovata" });
    const altra = await avviata();
    expect(await salvaRisposta(altra, studenti[0]!, t.tentativoId, statoConRisposta(t.seed), dopo(2))).toEqual({ ok: false, motivo: "non_trovata" });
    expect(await salvaRisposta(id, studenti[0]!, "nessuno", statoConRisposta(t.seed), dopo(2))).toEqual({ ok: false, motivo: "non_trovata" });
  });

  it("dopo chiudiVerifica ⇒ consegnata e lo stato precedente resta", async () => {
    const id = await avviata();
    const t = (await entra(id, studenti[0]!)).esercizi[0]!;
    await salvaRisposta(id, studenti[0]!, t.tentativoId, statoConRisposta(t.seed), dopo(2));
    const prima = await prisma.tentativo.findUniqueOrThrow({ where: { id: t.tentativoId } });
    expect(await chiudiVerifica(id, docenteId, dopo(3))).toEqual({ ok: true });
    const vuoto = loadQuestion(CONTENUTO as unknown as NumbasQuestionJSON, { seed: t.seed, locale: "it" }).toState();
    expect(await salvaRisposta(id, studenti[0]!, t.tentativoId, vuoto, dopo(4))).toEqual({ ok: false, motivo: "consegnata" });
    const dopoChiusura = await prisma.tentativo.findUniqueOrThrow({ where: { id: t.tentativoId } });
    expect(dopoChiusura.state).toEqual(prima.state);
    expect(dopoChiusura.score).toBe(1);
  });

  it("a scadenza + 20 s ⇒ ok; a scadenza + 31 s ⇒ tempo_scaduto e prova consegnata automaticamente", async () => {
    const id = await avviata();
    const t = (await entra(id, studenti[0]!)).esercizi[0]!;
    const scadenza = dopo(60);
    expect(await salvaRisposta(id, studenti[0]!, t.tentativoId, statoConRisposta(t.seed), new Date(scadenza.getTime() + 20_000)))
      .toMatchObject({ ok: true });
    expect(await salvaRisposta(id, studenti[0]!, t.tentativoId, statoConRisposta(t.seed), new Date(scadenza.getTime() + 31_000)))
      .toEqual({ ok: false, motivo: "tempo_scaduto" });
    const p = await prisma.provaVerifica.findUniqueOrThrow({ where: { compitoId_studentId: { compitoId: id, studentId: studenti[0]! } } });
    expect(p.consegnataAt).toEqual(scadenza);
    expect(p.consegnaAutomatica).toBe(true);
  });

  it("uno stato che il motore non ricostruisce ⇒ invalid_state, niente scritto", async () => {
    const id = await avviata();
    const t = (await entra(id, studenti[0]!)).esercizi[0]!;
    const rotto = { ...statoConRisposta(t.seed), parts: [null] } as unknown as QuestionState;
    expect(await salvaRisposta(id, studenti[0]!, t.tentativoId, rotto, dopo(2))).toEqual({ ok: false, motivo: "invalid_state" });
    expect((await prisma.tentativo.findUniqueOrThrow({ where: { id: t.tentativoId } })).state).toBeNull();
  });
});

describe("consegnaProva", () => {
  it("due volte ⇒ ok entrambe, tentativi COMPLETED, consegnaAutomatica false; poi salvaRisposta ⇒ consegnata", async () => {
    const id = await avviata();
    const t = (await entra(id, studenti[0]!)).esercizi[0]!;
    expect(await consegnaProva(id, studenti[0]!, dopo(10))).toEqual({ ok: true });
    expect(await consegnaProva(id, studenti[0]!, dopo(11))).toEqual({ ok: true });
    const p = await prisma.provaVerifica.findUniqueOrThrow({ where: { compitoId_studentId: { compitoId: id, studentId: studenti[0]! } } });
    expect(p.consegnataAt).toEqual(dopo(10));
    expect(p.consegnaAutomatica).toBe(false);
    const stati = await prisma.tentativo.findMany({ where: { provaId: p.id }, select: { status: true } });
    expect(stati.every((s) => s.status === "COMPLETED")).toBe(true);
    expect(await salvaRisposta(id, studenti[0]!, t.tentativoId, statoConRisposta(t.seed), dopo(12))).toEqual({ ok: false, motivo: "consegnata" });
  });

  it("senza essere entrato ⇒ non_trovata", async () => {
    const id = await avviata();
    expect(await consegnaProva(id, studenti[0]!, dopo(1))).toEqual({ ok: false, motivo: "non_trovata" });
  });
});

describe("registraEventi", () => {
  it("at prima dell'ingresso riportato all'ingresso, dopo ora riportato a ora; durata limitata", async () => {
    const id = await avviata();
    await entra(id, studenti[0]!, dopo(5));
    const eventi: EventoInput[] = [
      { tipo: "USCITA", motivo: "SCHEDA", at: dopo(1).toISOString() },
      { tipo: "RIENTRO", at: dopo(99).toISOString(), durataMs: 10 * 60 * MIN },
      { tipo: "RIENTRO", at: dopo(6).toISOString(), durataMs: -5 },
    ];
    expect(await registraEventi(id, studenti[0]!, eventi, dopo(7))).toEqual({ ok: true });
    const righe = await prisma.eventoVerifica.findMany({ where: { prova: { compitoId: id } }, orderBy: { at: "asc" } });
    expect(righe.map((r) => [r.tipo, r.motivo, r.at, r.durataMs])).toEqual([
      ["USCITA", "SCHEDA", dopo(5), null],
      ["RIENTRO", null, dopo(6), 0],
      ["RIENTRO", null, dopo(7), 2 * MIN],
    ]);
  });

  it("51 eventi ⇒ rifiutato; prima dell'ingresso ⇒ non_trovata; dopo la consegna ⇒ accettati", async () => {
    const id = await avviata();
    const uno: EventoInput = { tipo: "USCITA", motivo: "FOCUS", at: dopo(2).toISOString() };
    expect(await registraEventi(id, studenti[0]!, [uno], dopo(2))).toEqual({ ok: false, motivo: "non_trovata" });
    await entra(id, studenti[0]!);
    expect(await registraEventi(id, studenti[0]!, Array(51).fill(uno), dopo(2))).toEqual({ ok: false, motivo: "invalid_state" });
    expect(await prisma.eventoVerifica.count({ where: { prova: { compitoId: id } } })).toBe(0);
    await consegnaProva(id, studenti[0]!, dopo(3));
    expect(await registraEventi(id, studenti[0]!, [{ tipo: "RIENTRO", at: dopo(4).toISOString(), durataMs: 1000 }], dopo(4))).toEqual({ ok: true });
    expect(await prisma.eventoVerifica.count({ where: { prova: { compitoId: id } } })).toBe(1);
  });
});

describe("tempoProva", () => {
  it("scadenza, ora del server e consegna; null prima dell'ingresso", async () => {
    const id = await avviata();
    expect(await tempoProva(id, studenti[0]!, dopo(1))).toBeNull();
    await entra(id, studenti[0]!);
    expect(await tempoProva(id, studenti[0]!, dopo(2))).toEqual({ scadenza: dopo(60), oraServer: dopo(2), consegnata: false });
    await consegnaProva(id, studenti[0]!, dopo(3));
    expect(await tempoProva(id, studenti[0]!, dopo(4))).toEqual({ scadenza: dopo(60), oraServer: dopo(4), consegnata: true });
  });
});

describe("puoVedereFormulario", () => {
  const FILE = "00000000-0000-0000-0000-000000000000.png";
  const studente = (i: number) => ({ id: studenti[i]!, role: "STUDENT" });

  it("SOLO_PDP: senza misura falso; con la misura vero finché la prova è aperta, falso dopo la consegna", async () => {
    await prisma.misurePdp.create({ data: { classeId, studentId: studenti[1]!, formulario: true } });
    const id = await avviata({ formulario: "SOLO_PDP" });
    await prisma.verifica.update({ where: { compitoId: id }, data: { formularioFile: FILE } });
    expect(await puoVedereFormulario(id, studente(1), dopo(1))).toBe(false); // non ancora entrato
    await entra(id, studenti[0]!);
    await entra(id, studenti[1]!);
    expect(await puoVedereFormulario(id, studente(0), dopo(2))).toBe(false);
    expect(await puoVedereFormulario(id, studente(1), dopo(2))).toBe(true);
    await consegnaProva(id, studenti[1]!, dopo(3));
    expect(await puoVedereFormulario(id, studente(1), dopo(4))).toBe(false);
  });

  it("TUTTI ⇒ vero per chiunque abbia la prova aperta; senza file falso", async () => {
    const id = await avviata({ formulario: "TUTTI" });
    await entra(id, studenti[0]!);
    expect(await puoVedereFormulario(id, studente(0), dopo(2))).toBe(false);
    await prisma.verifica.update({ where: { compitoId: id }, data: { formularioFile: FILE } });
    expect(await puoVedereFormulario(id, studente(0), dopo(2))).toBe(true);
    expect(await puoVedereFormulario(id, studente(0), dopo(61))).toBe(false);
  });

  it("docente con titolo sempre, estraneo mai", async () => {
    const id = await creaVerifica({ formulario: "NESSUNO" });
    await prisma.verifica.update({ where: { compitoId: id }, data: { formularioFile: FILE } });
    expect(await puoVedereFormulario(id, { id: docenteId, role: "TEACHER" }, T0)).toBe(true);
    expect(await puoVedereFormulario(id, { id: estraneoId, role: "TEACHER" }, T0)).toBe(false);
  });
});

describe("introProva e verificheDelloStudente", () => {
  it("PREPARATA ⇒ non_iniziata; non compare fra i compiti; intro senza misure con gli esercizi che avrà lui", async () => {
    await prisma.misurePdp.create({ data: { classeId, studentId: studenti[1]!, menoEsercizi: true, tempoExtraPct: 30 } });
    const avvio = new Date(Math.ceil((Date.now() + 60 * MIN) / 1000) * 1000);
    const id = await creaVerifica({ avvioProgrammatoAt: avvio });
    const ora = new Date(avvio.getTime() - MIN);

    expect(await verificheDelloStudente(studenti[0]!, ora)).toEqual([{ id, quando: avvio, stato: "non_iniziata" }]);
    expect((await compitiDelloStudente(studenti[0]!)).map((c) => c.id)).not.toContain(id);

    expect(await introProva(id, studenti[0]!, ora)).toEqual({
      compitoId: id, quando: avvio, durataMinuti: 60, esercizi: 5, stato: "non_iniziata", giaEntrato: false,
    });
    const intro = await introProva(id, studenti[1]!, ora);
    expect(intro).toEqual({ compitoId: id, quando: avvio, durataMinuti: 60, esercizi: 3, stato: "non_iniziata", giaEntrato: false });
    expect(await introProva(id, estraneoId, ora)).toBeNull();
    await prisma.compito.update({ where: { id }, data: { ritiratoAt: ora } });
    expect(await introProva(id, studenti[0]!, ora)).toBeNull();
    expect(await verificheDelloStudente(studenti[0]!, ora)).toEqual([]);
  });

  it("aperta, consegnata, chiusa, risultati", async () => {
    const id = await avviata();
    const stati = async (ora: Date) =>
      Promise.all(studenti.map(async (s) => (await verificheDelloStudente(s, ora))[0]!.stato));
    expect(await stati(dopo(1))).toEqual(["aperta", "aperta", "aperta"]);

    await entra(id, studenti[0]!);
    expect((await introProva(id, studenti[0]!, dopo(2)))!.giaEntrato).toBe(true);
    await consegnaProva(id, studenti[0]!, dopo(2));
    expect(await stati(dopo(3))).toEqual(["consegnata", "aperta", "aperta"]);

    await chiudiVerifica(id, docenteId, dopo(4));
    expect(await stati(dopo(5))).toEqual(["consegnata", "chiusa", "chiusa"]);
    expect((await introProva(id, studenti[1]!, dopo(5)))!.stato).toBe("chiusa");

    await avviaRecupero(id, docenteId, [studenti[1]!], dopo(10));
    expect(await stati(dopo(11))).toEqual(["consegnata", "aperta", "chiusa"]);

    await prisma.provaVerifica.updateMany({ where: { compitoId: id, studentId: studenti[0]! }, data: { pubblicataAt: dopo(20) } });
    expect(await stati(dopo(21))).toEqual(["risultati", "aperta", "chiusa"]);
  });

  it("più recenti prima", async () => {
    const vecchia = await avviata();
    const nuova = await creaVerifica();
    await prisma.verifica.update({ where: { compitoId: vecchia }, data: { avviataAt: dopo(-60) } });
    await avviaVerifica(nuova, docenteId, dopo(1));
    expect((await verificheDelloStudente(studenti[0]!, dopo(2))).map((v) => v.id)).toEqual([nuova, vecchia]);
  });
});
