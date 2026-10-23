import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { assegnaCompito, riepilogoPerModo, type InputAssegna } from "../compiti";
import { riepilogoEstrazione, type Blocco } from "../estrazione";
import {
  estrazioneDelloStudente,
  estrazioneDaBaciniCongelati,
  versioniDelloStudente,
  type BacinoCongelato,
} from "../versioni-compito";

// Prefisso proprio di questo file: un blocco "argomento" interroga l'intera
// tabella Esercizio, quindi l'argomento deve essere unico (vedi il commento
// sul prefisso in assegna-diretto.test.ts).
const P = "assegnacomp-";
const TOPIC = `${P}topic`;
const ALTRO = `${P}altro`;
const e = (n: number) => `${P}e${n}`;

let docenteId: string;
let collegaId: string;
let classeId: string;
let raccoltaId: string;
let studenti: string[];

const docente = () => ({ id: docenteId, admin: false });

async function pulisci() {
  await prisma.compito.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.batteria.deleteMany({ where: { createdBy: { email: { startsWith: P } } } });
  await prisma.classe.deleteMany({ where: { googleGroupEmail: { startsWith: P } } });
  await prisma.contenitore.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
}

/** Le righe che un tentativo di assegnazione può lasciare: per "nessuna riga
 * creata" nei rifiuti. */
async function righe() {
  return {
    compiti: await prisma.compito.count({ where: { classeId } }),
    batterie: await prisma.batteria.count({ where: { createdById: docenteId } }),
  };
}

beforeEach(async () => {
  await pulisci();
  docenteId = (await prisma.user.create({ data: { email: `${P}d@test.it`, name: "D", role: "TEACHER" } })).id;
  collegaId = (await prisma.user.create({ data: { email: `${P}c@test.it`, name: "C", role: "TEACHER" } })).id;
  studenti = [];
  for (let i = 0; i < 3; i++) {
    studenti.push((await prisma.user.create({ data: { email: `${P}s${i}@test.it`, name: `S${i}`, role: "STUDENT" } })).id);
  }
  classeId = (await prisma.classe.create({ data: { name: "2A", yearLevel: 2, googleGroupEmail: `${P}2a@test.it` } })).id;
  await prisma.classeDocente.create({ data: { classeId, teacherId: docenteId } });
  await prisma.classeStudente.createMany({ data: studenti.map((studentId) => ({ classeId, studentId })) });

  // Sei esercizi di TOPIC e quattro di ALTRO, tutti della scuola e con
  // versione; e1 ha due versioni (si assegna l'ultima).
  const base = { yearLevel: 2, tags: [], difficulty: 1, accessoScuola: "EDITOR" as const, authorId: collegaId };
  for (let n = 1; n <= 10; n++) {
    await prisma.esercizio.create({ data: { id: e(n), title: `E${n}`, topic: n <= 6 ? TOPIC : ALTRO, ...base } });
  }
  await prisma.esercizioVersione.createMany({
    data: Array.from({ length: 10 }, (_, i) => ({ esercizioId: e(i + 1), version: 1, content: { i }, hash: `${P}h${i}` })),
  });
  await prisma.esercizioVersione.create({ data: { esercizioId: e(1), version: 2, content: { v: 2 }, hash: `${P}h1b` } });

  raccoltaId = (await prisma.contenitore.create({ data: { name: `${P}Raccolta`, createdById: docenteId } })).id;
  await prisma.contenitoreEsercizio.createMany({
    data: [1, 2, 3, 4, 5, 6].map((n) => ({ contenitoreId: raccoltaId, esercizioId: e(n) })),
  });
});

const input = (over: Partial<InputAssegna>): InputAssegna => ({
  classeId,
  teacherId: docenteId,
  blocchi: [{ tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 3 }],
  modo: "CLASSE",
  seme: "seme-1",
  ...over,
});

async function versioneDi(n: number) {
  const v = await prisma.esercizioVersione.findFirst({ where: { esercizioId: e(n) }, orderBy: { version: "desc" } });
  return v!.id;
}

describe("assegnaCompito — modo CLASSE (stesse domande)", () => {
  it("con versioniViste uguali al riepilogo: il compito ha esattamente quelle versioni e drawSeed = seme", async () => {
    const blocchi: Blocco[] = [
      { tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 3 },
      { tipo: "argomento", argomento: ALTRO, anno: 2, quanti: 2 },
    ];
    const r = await riepilogoEstrazione(blocchi, docente(), "seme-x");
    expect(r.sufficiente).toBe(true);
    const viste = r.esercizi.map((x) => x.versioneId);

    const esito = await assegnaCompito(input({ blocchi, seme: "seme-x", versioniViste: viste }));
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;

    const c = await prisma.compito.findUniqueOrThrow({
      where: { id: esito.compitoId },
      include: { batteria: { include: { regole: { orderBy: { order: "asc" } } } } },
    });
    expect(c.drawnVersionIds).toEqual(viste);
    expect(c.drawSeed).toBe("seme-x");
    expect(c.modo).toBe("CLASSE");
    expect(c.bacini).toBeNull();
    expect(c.modelloId).toBeNull();
    expect(c.assignedById).toBe(docenteId);
    // La copia dei blocchi: batteria automatica, nome leggibile, regole in ordine.
    expect(c.batteria.automatica).toBe(true);
    expect(c.batteria.name).toBe(`${TOPIC} (3) + ${ALTRO} (2)`);
    expect(c.batteria.regole.map((g) => [g.argomento, g.anno, g.count])).toEqual([[TOPIC, 2, 3], [ALTRO, 2, 2]]);
    // Nessuna estrazione per studente nel modo CLASSE.
    expect(await prisma.estrazioneStudente.count({ where: { compitoId: c.id } })).toBe(0);
  });

  it("senza versioniViste assegna l'estrazione del riepilogo con quel seme", async () => {
    const r = await riepilogoEstrazione(input({}).blocchi, docente(), "seme-1");
    const esito = await assegnaCompito(input({}));
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    const c = await prisma.compito.findUniqueOrThrow({ where: { id: esito.compitoId } });
    expect(c.drawnVersionIds).toEqual(r.esercizi.map((x) => x.versioneId));
  });

  it("un esercizio estratto reso privato fra riepilogo e assegnazione ⇒ estrazione_cambiata col nuovo riepilogo, nessuna riga", async () => {
    const r = await riepilogoEstrazione(input({}).blocchi, docente(), "seme-1");
    const viste = r.esercizi.map((x) => x.versioneId);
    // Il collega rende privato il primo esercizio estratto.
    await prisma.esercizio.update({ where: { id: r.esercizi[0]!.esercizioId }, data: { accessoScuola: null } });

    const prima = await righe();
    const esito = await assegnaCompito(input({ versioniViste: viste }));
    expect(esito).toMatchObject({ ok: false, motivo: "estrazione_cambiata" });
    if (esito.ok) return;
    expect(esito.riepilogo?.sufficiente).toBe(true);
    expect(esito.riepilogo?.esercizi.map((x) => x.esercizioId)).not.toContain(r.esercizi[0]!.esercizioId);
    expect(await righe()).toEqual(prima);
  });

  it("le versioni viste in un ordine diverso non sono la stessa estrazione", async () => {
    const r = await riepilogoEstrazione(input({}).blocchi, docente(), "seme-1");
    const viste = r.esercizi.map((x) => x.versioneId).reverse();
    expect(await assegnaCompito(input({ versioniViste: viste }))).toMatchObject({ ok: false, motivo: "estrazione_cambiata" });
  });

  it("esercizi insufficienti ⇒ esercizi_insufficienti con il riepilogo, nessuna riga", async () => {
    const prima = await righe();
    const esito = await assegnaCompito(input({ blocchi: [{ tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 7 }] }));
    expect(esito).toMatchObject({ ok: false, motivo: "esercizi_insufficienti" });
    if (esito.ok) return;
    expect(esito.riepilogo?.blocchi).toEqual([{ etichetta: TOPIC, richiesti: 7, disponibili: 6, nonDisponibili: [] }]);
    expect(await righe()).toEqual(prima);
  });
});

describe("assegnaCompito — modo STUDENTE (diverse per studente)", () => {
  it("congela i bacini, drawnVersionIds vuoto, un'estrazione per iscritto della lunghezza del totale", async () => {
    const blocchi: Blocco[] = [
      { tipo: "scelti", esercizioIds: [e(9), e(2)] },
      { tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 3 },
      { tipo: "argomento", argomento: ALTRO, anno: 2, quanti: 1 },
    ];
    const esito = await assegnaCompito(input({ blocchi, modo: "STUDENTE", seme: "seme-s" }));
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;

    const c = await prisma.compito.findUniqueOrThrow({ where: { id: esito.compitoId }, include: { batteria: true } });
    expect(c.modo).toBe("STUDENTE");
    expect(c.drawnVersionIds).toEqual([]);
    expect(c.drawSeed).toBe("seme-s");
    expect(c.batteria.name).toBe(`Esercizi scelti (2) + ${TOPIC} (3) + ${ALTRO} (1)`);

    // Bacino congelato: gli scelti nell'ordine del docente; e2 è scelto a
    // mano, quindi non è fra i candidati di TOPIC; e9 non è fra quelli di ALTRO.
    const bacini = c.bacini as BacinoCongelato[];
    expect(bacini.map((b) => b.count)).toEqual([2, 3, 1]);
    expect(bacini[0]!.versionIds).toEqual([await versioneDi(9), await versioneDi(2)]);
    expect(bacini[0]!.scelti).toBe(true);
    expect([...bacini[1]!.versionIds].sort()).toEqual((await Promise.all([1, 3, 4, 5, 6].map(versioneDi))).sort());
    expect([...bacini[2]!.versionIds].sort()).toEqual((await Promise.all([7, 8, 10].map(versioneDi))).sort());
    // e1 ha due versioni: si congela l'ultima.
    expect(bacini[1]!.versionIds).toContain(await versioneDi(1));

    const estrazioni = await prisma.estrazioneStudente.findMany({ where: { compitoId: c.id } });
    expect(estrazioni.map((x) => x.studentId).sort()).toEqual([...studenti].sort());
    for (const x of estrazioni) {
      expect(x.versionIds).toHaveLength(6);
      expect(new Set(x.versionIds).size).toBe(6);
      expect(x.versionIds.slice(0, 2)).toEqual(bacini[0]!.versionIds);
      for (const v of x.versionIds.slice(2, 5)) expect(bacini[1]!.versionIds).toContain(v);
      expect(bacini[2]!.versionIds).toContain(x.versionIds[5]);
      // Lo stesso calcolo che userà chi arriva dopo.
      expect(x.versionIds).toEqual(estrazioneDaBaciniCongelati(bacini, `seme-s:${x.studentId}`));
    }
  });

  it("bacini sovrapposti: raccolta e1..e6 (2) + argomento e1..e6 (3) si assegna, nel caso peggiore 6−2=4 ≥ 3", async () => {
    const blocchi: Blocco[] = [
      { tipo: "raccolta", contenitoreId: raccoltaId, quanti: 2 },
      { tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 3 },
    ];
    const esito = await assegnaCompito(input({ modo: "STUDENTE", blocchi }));
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    const c = await prisma.compito.findUniqueOrThrow({ where: { id: esito.compitoId } });
    const bacini = c.bacini as BacinoCongelato[];
    // Ogni blocco congela TUTTI i suoi candidati: i bacini si sovrappongono.
    const sei = (await Promise.all([1, 2, 3, 4, 5, 6].map(versioneDi))).sort();
    expect([...bacini[0]!.versionIds].sort()).toEqual(sei);
    expect([...bacini[1]!.versionIds].sort()).toEqual(sei);
    const estrazioni = await prisma.estrazioneStudente.findMany({ where: { compitoId: c.id } });
    expect(estrazioni).toHaveLength(3);
    for (const x of estrazioni) {
      expect(x.versionIds).toHaveLength(5);
      expect(new Set(x.versionIds).size).toBe(5);
    }
  });

  it("bacini sovrapposti che nel caso peggiore non bastano ⇒ rifiuto: raccolta e1..e4 (2) + argomento e1..e4 (3), 4−2=2 < 3", async () => {
    // e5 ed e6 resi privati dal collega: raccolta e argomento sono e1..e4.
    await prisma.esercizio.updateMany({ where: { id: { in: [e(5), e(6)] } }, data: { accessoScuola: null } });
    const blocchi: Blocco[] = [
      { tipo: "raccolta", contenitoreId: raccoltaId, quanti: 2 },
      { tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 3 },
    ];
    const prima = await righe();
    const esito = await assegnaCompito(input({ modo: "STUDENTE", blocchi }));
    expect(esito).toMatchObject({ ok: false, motivo: "esercizi_insufficienti" });
    if (esito.ok) return;
    expect(esito.riepilogo?.sufficiente).toBe(false);
    expect(esito.riepilogo?.blocchi.map((b) => b.disponibili)).toEqual([4, 2]);
    expect(await righe()).toEqual(prima);
  });

  it("il caso peggiore conta solo i blocchi precedenti che si sovrappongono", async () => {
    // ALTRO (e7..e10) non tocca TOPIC: il suo quanti non toglie niente.
    const blocchi: Blocco[] = [
      { tipo: "argomento", argomento: ALTRO, anno: 2, quanti: 4 },
      { tipo: "raccolta", contenitoreId: raccoltaId, quanti: 3 },
      { tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 3 },
    ];
    const { riepilogo } = await riepilogoPerModo(blocchi, docente(), "s", "STUDENTE");
    expect(riepilogo.blocchi.map((b) => b.disponibili)).toEqual([4, 6, 3]);
    expect(riepilogo.sufficiente).toBe(true);
  });

  it("un blocco precedente toglie al più gli esercizi in comune: raccolta e1+e7..e10 (4) + argomento e1..e6 (3), 6−min(4,1)=5 ≥ 3", async () => {
    // Prima si toglieva tutto il quanti della raccolta (6−4=2 < 3, rifiuto):
    // ma la raccolta tocca l'argomento in un solo esercizio, e1.
    const mista = (await prisma.contenitore.create({ data: { name: `${P}Mista`, createdById: docenteId } })).id;
    await prisma.contenitoreEsercizio.createMany({
      data: [1, 7, 8, 9, 10].map((n) => ({ contenitoreId: mista, esercizioId: e(n) })),
    });
    const blocchi: Blocco[] = [
      { tipo: "raccolta", contenitoreId: mista, quanti: 4 },
      { tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 3 },
    ];
    const { riepilogo, bacini } = await riepilogoPerModo(blocchi, docente(), "s", "STUDENTE");
    expect(riepilogo.blocchi.map((b) => b.disponibili)).toEqual([5, 5]);
    expect(riepilogo.sufficiente).toBe(true);
    for (let k = 0; k < 500; k++) {
      const v = estrazioneDaBaciniCongelati(bacini!, `seme-${k}:studente`);
      expect(v).toHaveLength(7);
      expect(new Set(v).size).toBe(7);
    }
    const esito = await assegnaCompito(input({ modo: "STUDENTE", blocchi }));
    expect(esito.ok).toBe(true);
  });

  it("nessuno studente resta corto, per nessun seme, al limite del caso peggiore", async () => {
    // 6 − 3 = 3 ≥ 3: il limite esatto; più gli scelti e un blocco disgiunto.
    const blocchi: Blocco[] = [
      { tipo: "raccolta", contenitoreId: raccoltaId, quanti: 3 },
      { tipo: "scelti", esercizioIds: [e(7)] },
      { tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 3 },
      { tipo: "argomento", argomento: ALTRO, anno: 2, quanti: 3 },
    ];
    const { riepilogo, bacini } = await riepilogoPerModo(blocchi, docente(), "s", "STUDENTE");
    expect(riepilogo.sufficiente).toBe(true);
    expect(riepilogo.totale).toBe(10);
    for (let k = 0; k < 500; k++) {
      const v = estrazioneDaBaciniCongelati(bacini!, `seme-${k}:studente`);
      expect(v).toHaveLength(10);
      expect(new Set(v).size).toBe(10);
    }
  });

  it("insufficiente ⇒ esercizi_insufficienti e nessuna riga (nemmeno estrazioni)", async () => {
    const prima = await righe();
    const esito = await assegnaCompito(input({ modo: "STUDENTE", blocchi: [{ tipo: "argomento", argomento: ALTRO, anno: 2, quanti: 5 }] }));
    expect(esito).toMatchObject({ ok: false, motivo: "esercizi_insufficienti" });
    expect(await righe()).toEqual(prima);
  });
});

describe("un compito già dato non cambia dopo", () => {
  /** Una versione nuova per ciascuno dei dieci esercizi (come se il collega
   * li avesse modificati tutti dopo l'assegnazione). */
  async function versioniNuoveDiTutti() {
    await prisma.esercizioVersione.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({ esercizioId: e(i + 1), version: 9, content: { nuova: i }, hash: `${P}nuova${i}` })),
    });
    return new Set((await prisma.esercizioVersione.findMany({ where: { version: 9, esercizioId: { startsWith: P } } })).map((v) => v.id));
  }

  /** Le versioni di ogni iscritto, più quelle di uno che arriva adesso. */
  async function versioniDiTutti(compitoId: string, tardivo?: string) {
    const chi = tardivo ? [...studenti, tardivo] : studenti;
    return Promise.all(chi.map(async (s) => (await versioniDelloStudente(compitoId, s))!));
  }

  it.each(["CLASSE", "STUDENTE"] as const)("%s: una versione nuova di un esercizio estratto non cambia il compito", async (modo) => {
    const esito = await assegnaCompito(input({ modo, blocchi: [{ tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 3 }] }));
    if (!esito.ok) throw new Error(esito.motivo);
    const prima = await versioniDiTutti(esito.compitoId);
    const c = await prisma.compito.findUniqueOrThrow({ where: { id: esito.compitoId } });

    const nuove = await versioniNuoveDiTutti();
    const tardivo = (await prisma.user.create({ data: { email: `${P}tardivo@test.it`, role: "STUDENT" } })).id;
    await prisma.classeStudente.create({ data: { classeId, studentId: tardivo } });

    const dopo = await versioniDiTutti(esito.compitoId, tardivo);
    expect(dopo.slice(0, studenti.length)).toEqual(prima);
    // Nemmeno chi arriva dopo riceve una versione nuova: pesca dal bacino
    // congelato (STUDENTE) o riceve drawnVersionIds (CLASSE).
    for (const v of dopo.flat()) expect(nuove.has(v)).toBe(false);
    const ora = await prisma.compito.findUniqueOrThrow({ where: { id: esito.compitoId } });
    expect(ora.drawnVersionIds).toEqual(c.drawnVersionIds);
    expect(ora.bacini).toEqual(c.bacini);
  });

  it.each(["CLASSE", "STUDENTE"] as const)("%s: cambiare la raccolta dopo l'assegnazione non cambia l'estrazione", async (modo) => {
    const esito = await assegnaCompito(input({ modo, blocchi: [{ tipo: "raccolta", contenitoreId: raccoltaId, quanti: 4 }] }));
    if (!esito.ok) throw new Error(esito.motivo);
    const prima = await versioniDiTutti(esito.compitoId);
    const c = await prisma.compito.findUniqueOrThrow({ where: { id: esito.compitoId } });

    // La raccolta perde e1..e5 e guadagna e7..e10: tutt'altra raccolta.
    await prisma.contenitoreEsercizio.deleteMany({ where: { contenitoreId: raccoltaId, esercizioId: { in: [1, 2, 3, 4, 5].map(e) } } });
    await prisma.contenitoreEsercizio.createMany({ data: [7, 8, 9, 10].map((n) => ({ contenitoreId: raccoltaId, esercizioId: e(n) })) });
    const tardivo = (await prisma.user.create({ data: { email: `${P}tardivo@test.it`, role: "STUDENT" } })).id;
    await prisma.classeStudente.create({ data: { classeId, studentId: tardivo } });

    const dopo = await versioniDiTutti(esito.compitoId, tardivo);
    expect(dopo.slice(0, studenti.length)).toEqual(prima);
    // Chi arriva dopo pesca ancora fra e1..e6, la raccolta di allora.
    const diAllora = new Set(await Promise.all([1, 2, 3, 4, 5, 6].map(versioneDi)));
    for (const v of dopo[studenti.length]!) expect(diAllora.has(v)).toBe(true);
    const ora = await prisma.compito.findUniqueOrThrow({ where: { id: esito.compitoId } });
    expect(ora.drawnVersionIds).toEqual(c.drawnVersionIds);
    expect(ora.bacini).toEqual(c.bacini);
  });
});

describe("estrazioneDelloStudente", () => {
  it("STUDENTE: chi si iscrive dopo riceve la sua estrazione al primo bisogno, poi resta fissa; due chiamate insieme danno la stessa", async () => {
    const esito = await assegnaCompito(input({ modo: "STUDENTE", seme: "seme-t" }));
    if (!esito.ok) throw new Error(esito.motivo);
    const nuovo = (await prisma.user.create({ data: { email: `${P}nuovo@test.it`, role: "STUDENT" } })).id;
    await prisma.classeStudente.create({ data: { classeId, studentId: nuovo } });
    const c = await prisma.compito.findUniqueOrThrow({ where: { id: esito.compitoId } });

    const [a, b] = await Promise.all([estrazioneDelloStudente(c, nuovo), estrazioneDelloStudente(c, nuovo)]);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    expect(a).toEqual(estrazioneDaBaciniCongelati(c.bacini as BacinoCongelato[], `seme-t:${nuovo}`));
    const salvata = await prisma.estrazioneStudente.findUniqueOrThrow({
      where: { compitoId_studentId: { compitoId: c.id, studentId: nuovo } },
    });
    expect(salvata.versionIds).toEqual(a);

    // Gli esercizi cambiano dopo: l'estrazione già fissata non cambia.
    await prisma.esercizio.updateMany({ where: { topic: TOPIC }, data: { accessoScuola: null } });
    expect(await estrazioneDelloStudente(c, nuovo)).toEqual(a);
  });

  it("STUDENTE: rilegge l'estrazione fissata all'assegnazione", async () => {
    const esito = await assegnaCompito(input({ modo: "STUDENTE" }));
    if (!esito.ok) throw new Error(esito.motivo);
    const c = await prisma.compito.findUniqueOrThrow({ where: { id: esito.compitoId } });
    const salvata = await prisma.estrazioneStudente.findUniqueOrThrow({
      where: { compitoId_studentId: { compitoId: c.id, studentId: studenti[0]! } },
    });
    expect(await estrazioneDelloStudente(c, studenti[0]!)).toEqual(salvata.versionIds);
  });

  it("CLASSE: è drawnVersionIds, senza scrivere nulla", async () => {
    const esito = await assegnaCompito(input({}));
    if (!esito.ok) throw new Error(esito.motivo);
    const c = await prisma.compito.findUniqueOrThrow({ where: { id: esito.compitoId } });
    expect(await estrazioneDelloStudente(c, studenti[0]!)).toEqual(c.drawnVersionIds);
    expect(await prisma.estrazioneStudente.count({ where: { compitoId: c.id } })).toBe(0);
  });
});

describe("assegnaCompito — modelli", () => {
  it("salvaModello ⇒ due batterie (una automatica) e modelloId sul compito", async () => {
    const esito = await assegnaCompito(input({ salvaModello: { nome: `${P}Il mio modello` } }));
    if (!esito.ok) throw new Error(esito.motivo);
    const c = await prisma.compito.findUniqueOrThrow({ where: { id: esito.compitoId } });
    const batterie = await prisma.batteria.findMany({ where: { createdById: docenteId }, include: { regole: true } });
    expect(batterie).toHaveLength(2);
    const modello = batterie.find((b) => !b.automatica)!;
    expect(modello.name).toBe(`${P}Il mio modello`);
    expect(modello.regole.map((g) => [g.argomento, g.anno, g.count])).toEqual([[TOPIC, 2, 3]]);
    expect(c.modelloId).toBe(modello.id);
    expect(c.batteriaId).toBe(batterie.find((b) => b.automatica)!.id);
  });

  it("modelloId di un modello esistente ⇒ si imposta; di uno automatico o inesistente ⇒ modello_non_trovato, nessuna riga", async () => {
    const modello = await prisma.batteria.create({ data: { name: `${P}m`, createdById: collegaId } });
    const esito = await assegnaCompito(input({ modelloId: modello.id }));
    if (!esito.ok) throw new Error(esito.motivo);
    expect((await prisma.compito.findUniqueOrThrow({ where: { id: esito.compitoId } })).modelloId).toBe(modello.id);

    const automatica = await prisma.batteria.create({ data: { name: `${P}auto`, createdById: collegaId, automatica: true } });
    const prima = await righe();
    expect(await assegnaCompito(input({ modelloId: automatica.id }))).toEqual({ ok: false, motivo: "modello_non_trovato" });
    expect(await assegnaCompito(input({ modelloId: "inesistente" }))).toEqual({ ok: false, motivo: "modello_non_trovato" });
    expect(await righe()).toEqual(prima);
  });
});

describe("assegnaCompito — rifiuti senza righe", () => {
  it("blocchi vuoti, scelti vuoti o doppi, quanti non positivo ⇒ blocchi_non_validi", async () => {
    const prima = await righe();
    for (const blocchi of [
      [],
      [{ tipo: "scelti", esercizioIds: [] }],
      [{ tipo: "scelti", esercizioIds: [e(1), e(1)] }],
      [{ tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 0 }],
    ] as Blocco[][]) {
      expect(await assegnaCompito(input({ blocchi }))).toEqual({ ok: false, motivo: "blocchi_non_validi" });
    }
    expect(await righe()).toEqual(prima);
  });

  it("date non valide ⇒ date_non_valide", async () => {
    const opensAt = new Date(Date.now() + 86_400_000);
    const dueAt = new Date(Date.now() + 3_600_000);
    expect(await assegnaCompito(input({ opensAt, dueAt }))).toMatchObject({ ok: false, motivo: "date_non_valide" });
    expect(await assegnaCompito(input({ dueAt: new Date(Date.now() - 1000) }))).toMatchObject({ ok: false, motivo: "date_non_valide" });
  });

  it("classe inesistente, non insegnata o archiviata", async () => {
    expect(await assegnaCompito(input({ classeId: "inesistente" }))).toEqual({ ok: false, motivo: "classe_non_trovata" });
    expect(await assegnaCompito(input({ teacherId: collegaId }))).toEqual({ ok: false, motivo: "non_insegni_questa_classe" });
    await prisma.classe.update({ where: { id: classeId }, data: { archivedAt: new Date() } });
    expect(await assegnaCompito(input({}))).toEqual({ ok: false, motivo: "non_insegni_questa_classe" });
  });

  it("le date valide arrivano sul compito", async () => {
    const opensAt = new Date(Date.now() + 3_600_000);
    const dueAt = new Date(Date.now() + 86_400_000);
    const esito = await assegnaCompito(input({ opensAt, dueAt }));
    if (!esito.ok) throw new Error(esito.motivo);
    const c = await prisma.compito.findUniqueOrThrow({ where: { id: esito.compitoId } });
    expect(c.opensAt).toEqual(opensAt);
    expect(c.dueAt).toEqual(dueAt);
  });
});

describe("riepilogoPerModo — il riepilogo non approva ciò che l'assegnazione rifiuta", () => {
  const sovrapposti = (quantiArgomento: number): Blocco[] => [
    { tipo: "raccolta", contenitoreId: raccoltaId, quanti: 2 },
    { tipo: "argomento", argomento: TOPIC, anno: 2, quanti: quantiArgomento },
  ];

  it("CLASSE è il riepilogo dell'estrazione, senza bacini", async () => {
    const r = await riepilogoPerModo(sovrapposti(3), docente(), "s1", "CLASSE");
    expect(r.riepilogo).toEqual(await riepilogoEstrazione(sovrapposti(3), docente(), "s1"));
    expect(r.bacini).toBeUndefined();
  });

  it("STUDENTE: numeri del caso peggiore, duplicatiTolti 0, un'estrazione d'esempio dai bacini congelati", async () => {
    const { riepilogo, bacini } = await riepilogoPerModo(sovrapposti(3), docente(), "s1", "STUDENTE");
    expect(riepilogo.blocchi.map((b) => [b.richiesti, b.disponibili])).toEqual([[2, 6], [3, 4]]);
    expect(riepilogo.duplicatiTolti).toBe(0);
    expect(riepilogo.sufficiente).toBe(true);
    expect(riepilogo.esercizi.map((x) => x.versioneId)).toEqual(estrazioneDaBaciniCongelati(bacini!, "s1"));
    expect(riepilogo.esercizi[0]).toMatchObject({ titolo: expect.any(String), content: expect.anything() });
  });

  it("STUDENTE senza anteprima: stessi numeri, nessun esercizio caricato", async () => {
    const con = await riepilogoPerModo(sovrapposti(3), docente(), "s1", "STUDENTE");
    const senza = await riepilogoPerModo(sovrapposti(3), docente(), "s1", "STUDENTE", { anteprima: false });
    expect(senza.riepilogo).toEqual({ ...con.riepilogo, esercizi: [] });
    expect(senza.bacini).toEqual(con.bacini);
  });

  it("un seme con cui la CLASSE ce la fa non basta a STUDENTE: /estrai deve conoscere il modo", async () => {
    // Raccolta {e5, e6, e7} (2) e argomento e1..e6 (5): in CLASSE basta se la
    // raccolta pesca e7; nel caso peggiore 6 − 2 = 4 < 5, per ogni seme.
    const piccola = (await prisma.contenitore.create({ data: { name: `${P}Piccola`, createdById: docenteId } })).id;
    await prisma.contenitoreEsercizio.createMany({
      data: [5, 6, 7].map((n) => ({ contenitoreId: piccola, esercizioId: e(n) })),
    });
    const blocchi: Blocco[] = [
      { tipo: "raccolta", contenitoreId: piccola, quanti: 2 },
      { tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 5 },
    ];
    let seme: string | null = null;
    for (let k = 0; k < 100 && seme === null; k++) {
      if ((await riepilogoEstrazione(blocchi, docente(), `s${k}`)).sufficiente) seme = `s${k}`;
    }
    expect(seme).not.toBeNull();
    const { riepilogo } = await riepilogoPerModo(blocchi, docente(), seme!, "STUDENTE");
    expect(riepilogo.sufficiente).toBe(false);
    expect(riepilogo.blocchi.map((b) => b.disponibili)).toEqual([3, 4]);
    expect(await assegnaCompito(input({ modo: "STUDENTE", blocchi, seme: seme! }))).toMatchObject({
      ok: false,
      motivo: "esercizi_insufficienti",
    });
    expect(await assegnaCompito(input({ modo: "CLASSE", blocchi, seme: seme! }))).toMatchObject({ ok: true });
  });

  it("STUDENTE: il rifiuto di assegnaCompito porta lo stesso riepilogo che la pagina ha visto", async () => {
    await prisma.esercizio.updateMany({ where: { id: { in: [e(5), e(6)] } }, data: { accessoScuola: null } });
    const visto = await riepilogoPerModo(sovrapposti(3), docente(), "s1", "STUDENTE");
    expect(visto.riepilogo.sufficiente).toBe(false);
    const esito = await assegnaCompito(input({ modo: "STUDENTE", blocchi: sovrapposti(3), seme: "s1" }));
    expect(esito).toMatchObject({ ok: false, motivo: "esercizi_insufficienti", riepilogo: visto.riepilogo });
  });
});
