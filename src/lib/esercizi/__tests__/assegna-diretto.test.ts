import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { creaBatteria as creaBatteriaGrezza, elencoBatterie, argomentiDisponibili } from "../batterie";
import { assegna, assegnaDiretto, quantiCorrispondono } from "../compiti";
import type { FiltroDiretto } from "../compiti";

// Il "parità di seme" del brief significa, operativamente: la sequenza
// pseudocasuale che guida il Fisher-Yates deve comportarsi allo stesso modo
// nelle due strade. `assegna` (compiti.ts) genera un `drawSeed` nuovo a ogni
// chiamata via `randomUUID()` — nodo builtin che, in questo ambiente jsdom,
// `vi.mock` non riesce a intercettare quando l'import avviene in un modulo
// diverso dal file di test (verificato: funziona per import diretti nel
// file di test stesso, non transitivamente — limite dell'ambiente, non del
// dominio). Si mocka invece `seedrandom` (pacchetto npm, non un builtin:
// l'intercettazione transitiva funziona normalmente), facendogli ignorare
// la stringa di seme e restituire sempre un generatore che riparte dalla
// stessa sequenza fissa — l'equivalente osservabile di "stesso seme", senza
// dipendere da quale stringa `randomUUID()` produce davvero.
vi.mock("seedrandom", () => ({
  default: () => {
    let i = 0;
    // Sequenza fissa, sufficientemente lunga da coprire più chiamate a
    // `rng()` nello stesso test senza ripetersi in un punto che nasconda un
    // bug (un Fisher-Yates su 4 elementi consuma 3 numeri).
    const seq = [0.83, 0.12, 0.47, 0.91, 0.05, 0.66, 0.29, 0.58];
    return () => seq[i++ % seq.length]!;
  },
}));

async function creaBatteria(...args: Parameters<typeof creaBatteriaGrezza>) {
  const r = await creaBatteriaGrezza(...args);
  if (!r.ok) throw new Error(`creaBatteria rifiutata inaspettatamente: ${r.motivo}`);
  return r;
}

// Prefisso unico per QUESTO file di test — MAI "prova": è la convenzione di
// quasi ogni fixture di questo repository, e nel database di sviluppo
// condiviso corrisponde già a 16 righe estranee. Un filtro per argomento
// interroga l'INTERA tabella Esercizio (non un elenco esplicito come un
// contenitore): riusare "prova" farebbe pescare in silenzio righe mai create
// da questo test, rendendo le asserzioni prive di senso senza farle fallire.
const P = "viaveloce-";

let teacherId: string;
let classeId: string;

async function creaEsercizio(
  id: string,
  topic: string,
  opts: { yearLevel?: number; difficulty?: number; conVersione?: boolean } = {},
) {
  const e = await prisma.esercizio.create({
    data: {
      id,
      title: id,
      yearLevel: opts.yearLevel ?? 2,
      topic,
      tags: [],
      difficulty: opts.difficulty ?? 1,
    },
  });
  if (opts.conVersione !== false) {
    await prisma.esercizioVersione.create({
      data: { esercizioId: e.id, version: 1, content: {}, hash: `h-${id}` },
    });
  }
  return e.id;
}

// Ordine imposto dalle chiavi esterne: Tentativo prima di Compito (che lo
// referenzia), Compito prima di BatteriaRegola/Batteria (`onDelete:
// Restrict` da Compito a Batteria — non si può cancellare una batteria
// ancora referenziata), Contenitore* prima di Esercizio, Classe* prima di
// Classe, tutto prima di User (Compito.assignedBy referenzia User).
async function pulisci() {
  await prisma.tentativo.deleteMany({ where: { student: { email: { startsWith: P } } } });
  await prisma.compito.deleteMany({ where: { batteria: { name: { contains: P } } } });
  await prisma.batteriaRegola.deleteMany({ where: { batteria: { name: { contains: P } } } });
  await prisma.batteria.deleteMany({ where: { name: { contains: P } } });
  await prisma.contenitoreEsercizio.deleteMany({ where: { contenitore: { name: { startsWith: P } } } });
  await prisma.contenitore.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.classeStudente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.classeDocente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.classe.deleteMany({ where: { googleGroupEmail: { startsWith: P } } });
  await prisma.esercizioVersione.deleteMany({ where: { esercizio: { id: { startsWith: P } } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
}

beforeEach(async () => {
  await pulisci();

  teacherId = (await prisma.user.create({ data: { email: `${P}d@test.it`, name: "D", role: "TEACHER" } })).id;
  classeId = (await prisma.classe.create({
    data: { googleGroupEmail: `${P}classe@scuola.it`, name: "Classe", yearLevel: 2 },
  })).id;
  await prisma.classeDocente.create({ data: { classeId, teacherId } });
});

// Pulizia finale: senza questa, l'ultimo test lascia le sue righe nel
// database di sviluppo condiviso fino alla prossima esecuzione di questo
// file (il `beforeEach` pulisce solo PRIMA di ogni test, mai dopo l'ultimo).
afterAll(async () => {
  await pulisci();
});

describe("argomentiDisponibili", () => {
  it("unisce spazi ai bordi e differenze di maiuscole/minuscole in una sola voce, sommando i conteggi", async () => {
    await creaEsercizio(`${P}radici-1`, `${P}Radici`);
    await creaEsercizio(`${P}radici-2`, `${P}radici`);
    await creaEsercizio(`${P}radici-3`, `${P}radici `); // spazio in coda

    const risultati = (await argomentiDisponibili()).filter((x) => x.argomento.startsWith(P));
    expect(risultati).toHaveLength(1);
    expect(risultati[0]!.quanti).toBe(3);
  });

  it("non modifica il dato salvato: la riga resta esattamente come scritta", async () => {
    const id = await creaEsercizio(`${P}spazi-1`, ` ${P}Con Spazi `);
    await argomentiDisponibili();
    const riga = await prisma.esercizio.findUniqueOrThrow({ where: { id } });
    expect(riga.topic).toBe(` ${P}Con Spazi `);
  });

  it("anno filtra per yearLevel esatto", async () => {
    await creaEsercizio(`${P}anno-2`, `${P}AnnoFiltro`, { yearLevel: 2 });
    await creaEsercizio(`${P}anno-3`, `${P}AnnoFiltro`, { yearLevel: 3 });

    const perAnno2 = (await argomentiDisponibili(2)).find((x) => x.argomento === `${P}AnnoFiltro`);
    expect(perAnno2).toEqual({ argomento: `${P}AnnoFiltro`, quanti: 1 });

    const senzaFiltro = (await argomentiDisponibili()).find((x) => x.argomento === `${P}AnnoFiltro`);
    expect(senzaFiltro).toEqual({ argomento: `${P}AnnoFiltro`, quanti: 2 });
  });
});

describe("quantiCorrispondono", () => {
  it("conta il bacino a filtro filtrato per versione disponibile — argomento, anno e soglia di difficoltà", async () => {
    const topic = `${P}quanti-argomento`;
    await creaEsercizio(`${P}q-ok1`, topic, { yearLevel: 2, difficulty: 2 });
    await creaEsercizio(`${P}q-ok2`, topic, { yearLevel: 2, difficulty: 1 });
    await creaEsercizio(`${P}q-difficile`, topic, { yearLevel: 2, difficulty: 5 }); // sopra soglia
    await creaEsercizio(`${P}q-annosbagliato`, topic, { yearLevel: 3, difficulty: 1 }); // anno diverso
    await creaEsercizio(`${P}q-altroargomento`, `${P}quanti-altro`, { yearLevel: 2, difficulty: 1 }); // altro argomento
    await creaEsercizio(`${P}q-senzaversione`, topic, { yearLevel: 2, difficulty: 1, conVersione: false });

    const filtro: FiltroDiretto = { anno: 2, argomento: topic, difficoltaMax: 3 };
    expect(await quantiCorrispondono(filtro)).toBe(2);
  });

  it("quantiCorrispondono e assegnaDiretto concordano: chiedere esattamente quel numero riesce, chiederne uno in più fallisce con lo stesso 'disponibili' nel dettaglio", async () => {
    const topic = `${P}parita-conteggio`;
    await creaEsercizio(`${P}pc-1`, topic, { yearLevel: 2, difficulty: 1 });
    await creaEsercizio(`${P}pc-2`, topic, { yearLevel: 2, difficulty: 1 });
    await creaEsercizio(`${P}pc-3-senza-versione`, topic, { yearLevel: 2, difficulty: 1, conVersione: false });

    const filtro: FiltroDiretto = { anno: 2, argomento: topic };
    const disponibili = await quantiCorrispondono(filtro);
    expect(disponibili).toBe(2);

    const ok = await assegnaDiretto({ classeId, teacherId, filtro, quanti: disponibili });
    expect(ok.ok).toBe(true);

    const troppi = await assegnaDiretto({ classeId, teacherId, filtro, quanti: disponibili + 1 });
    expect(troppi.ok).toBe(false);
    if (troppi.ok) return;
    expect(troppi.motivo).toBe("esercizi_insufficienti");
    expect(troppi.dettaglio).toEqual({ contenitore: topic, richiesti: disponibili + 1, disponibili });
  });
});

describe("assegnaDiretto", () => {
  it("crea una batteria automatica con una sola regola a filtro, mai visibile in elencoBatterie", async () => {
    const topic = `${P}automatica-visibilita`;
    await creaEsercizio(`${P}av-1`, topic, { yearLevel: 2, difficulty: 1 });

    const r = await assegnaDiretto({ classeId, teacherId, filtro: { anno: 2, argomento: topic }, quanti: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const compito = await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } });
    const batteria = await prisma.batteria.findUniqueOrThrow({
      where: { id: compito.batteriaId },
      include: { regole: true },
    });
    expect(batteria.automatica).toBe(true);
    expect(batteria.regole).toHaveLength(1);
    expect(batteria.regole[0]).toMatchObject({
      contenitoreId: null, argomento: topic, anno: 2, difficoltaMax: null, count: 1,
    });

    const elenco = await elencoBatterie();
    expect(elenco.find((b) => b.id === batteria.id)).toBeUndefined();
  });

  it("il rifiuto per capienza insufficiente nomina l'argomento (non un nome di raccolta) e i due numeri", async () => {
    const topic = `${P}capienza-diretta`;
    await creaEsercizio(`${P}cd-1`, topic, { yearLevel: 2, difficulty: 1 });

    const r = await assegnaDiretto({ classeId, teacherId, filtro: { anno: 2, argomento: topic }, quanti: 5 });
    expect(r).toMatchObject({
      ok: false,
      motivo: "esercizi_insufficienti",
      dettaglio: { contenitore: topic, richiesti: 5, disponibili: 1 },
    });
  });

  it("una classe non insegnata dal docente viene rifiutata, come in assegna", async () => {
    const altroTeacher = (await prisma.user.create({
      data: { email: `${P}altro@test.it`, name: "Altro", role: "TEACHER" },
    })).id;
    const topic = `${P}classe-non-insegnata`;
    await creaEsercizio(`${P}cni-1`, topic, { yearLevel: 2, difficulty: 1 });
    const r = await assegnaDiretto({
      classeId, teacherId: altroTeacher, filtro: { anno: 2, argomento: topic }, quanti: 1,
    });
    expect(r).toMatchObject({ ok: false, motivo: "non_insegni_questa_classe" });
  });

  it("una scadenza già nel passato viene rifiutata, come in assegna", async () => {
    const topic = `${P}scadenza-diretta`;
    await creaEsercizio(`${P}sd-1`, topic, { yearLevel: 2, difficulty: 1 });
    const r = await assegnaDiretto({
      classeId,
      teacherId,
      filtro: { anno: 2, argomento: topic },
      quanti: 1,
      dueAt: new Date(Date.now() - 86_400_000),
    });
    expect(r).toMatchObject({ ok: false, motivo: "scadenza_nel_passato" });
  });

  // Il test che conta di più (dal brief): la strada è UNA, non due. A
  // parità di seme (mockato in cima al file) e sullo stesso insieme di
  // esercizi — una raccolta che contiene esattamente ciò che il filtro
  // risolverebbe — le due forme devono produrre lo stesso `drawnVersionIds`,
  // elemento per elemento. Se divergono, `assegnaDiretto` ha smesso di
  // delegare ad `assegna` e ha preso una strada propria.
  it("LA STRADA È UNA SOLA: a parità di seme, un'assegnazione diretta e una per raccolta sullo stesso insieme pescano lo stesso drawnVersionIds", async () => {
    const topic = `${P}parita-strada`;
    const ids = await Promise.all([
      creaEsercizio(`${P}ps-1`, topic, { yearLevel: 2, difficulty: 1 }),
      creaEsercizio(`${P}ps-2`, topic, { yearLevel: 2, difficulty: 1 }),
      creaEsercizio(`${P}ps-3`, topic, { yearLevel: 2, difficulty: 1 }),
      creaEsercizio(`${P}ps-4`, topic, { yearLevel: 2, difficulty: 1 }),
    ]);

    // La raccolta contiene ESATTAMENTE lo stesso insieme che il filtro
    // risolverebbe: stesso bacino, forma diversa.
    const contenitore = (await prisma.contenitore.create({
      data: { name: `${P}ParitaContenitore`, createdById: teacherId },
    })).id;
    await prisma.contenitoreEsercizio.createMany({
      data: ids.map((esercizioId) => ({ contenitoreId: contenitore, esercizioId })),
    });

    const battCollezione = await creaBatteria(teacherId, `${P}ParitaBatteria`, [
      { contenitoreId: contenitore, count: 4 },
    ]);

    const diretta = await assegnaDiretto({
      classeId, teacherId, filtro: { anno: 2, argomento: topic }, quanti: 4,
    });
    const collezione = await assegna(battCollezione.id, classeId, teacherId);

    expect(diretta.ok).toBe(true);
    expect(collezione.ok).toBe(true);
    if (!diretta.ok || !collezione.ok) return;

    const compitoDiretta = await prisma.compito.findUniqueOrThrow({ where: { id: diretta.compitoId } });
    const compitoCollezione = await prisma.compito.findUniqueOrThrow({ where: { id: collezione.compitoId } });

    // I due `drawSeed` restano stringhe diverse (ciascuno il proprio
    // `randomUUID()` reale, non mockato): quello che deve coincidere è
    // l'ESITO del sorteggio, non l'etichetta del seme. Col generatore
    // mockato a comportarsi allo stesso modo qualunque stringa riceva
    // (vedi sopra), un esito identico qui dimostra che le due strade
    // risolvono la regola nello stesso identico bacino ordinato, PRIMA che
    // il generatore entri in gioco — esattamente l'invarianza che il brief
    // chiede. Se una delle due prendesse un percorso di pesca proprio,
    // anche con un generatore equivalente l'ordine o l'insieme
    // divergerebbe.
    expect(compitoDiretta.drawSeed).not.toBe(compitoCollezione.drawSeed);
    expect(compitoDiretta.drawnVersionIds).toEqual(compitoCollezione.drawnVersionIds);
    expect(compitoDiretta.drawnVersionIds).toHaveLength(4);
  });
});
