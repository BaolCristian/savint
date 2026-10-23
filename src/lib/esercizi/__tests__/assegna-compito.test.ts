import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { assegnaCompito, type InputAssegna } from "../compiti";
import { riepilogoEstrazione, type Blocco } from "../estrazione";
import { estrazioneDelloStudente, estrazioneDaBaciniCongelati, type BacinoCongelato } from "../versioni-compito";

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

  it("un esercizio appartiene al primo blocco il cui bacino lo contiene", async () => {
    // Raccolta (e1..e6, ne prende 2) e poi l'argomento TOPIC (e1..e6, 3):
    // congelati, l'argomento non ha più niente ⇒ insufficiente, nessuna riga.
    const prima = await righe();
    const esito = await assegnaCompito(input({
      modo: "STUDENTE",
      blocchi: [
        { tipo: "raccolta", contenitoreId: raccoltaId, quanti: 2 },
        { tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 3 },
      ],
    }));
    expect(esito).toMatchObject({ ok: false, motivo: "esercizi_insufficienti" });
    if (esito.ok) return;
    expect(esito.riepilogo?.sufficiente).toBe(false);
    expect(esito.riepilogo?.blocchi.map((b) => b.disponibili)).toEqual([6, 0]);
    expect(await righe()).toEqual(prima);
  });

  it("insufficiente ⇒ esercizi_insufficienti e nessuna riga (nemmeno estrazioni)", async () => {
    const prima = await righe();
    const esito = await assegnaCompito(input({ modo: "STUDENTE", blocchi: [{ tipo: "argomento", argomento: ALTRO, anno: 2, quanti: 5 }] }));
    expect(esito).toMatchObject({ ok: false, motivo: "esercizi_insufficienti" });
    expect(await righe()).toEqual(prima);
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
