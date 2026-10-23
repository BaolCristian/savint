import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  creaBatteria as creaBatteriaGrezza,
  elencoBatterie,
  verificaBatteria,
  bacinoRegola,
  idsConVersione,
  elencoModelli,
  caricaModello,
  eliminaModello,
} from "../batterie";
import type { Utente } from "../accesso";

// `creaBatteria` (Fix round finale, item 5) restituisce ora un rifiuto
// esplicito — `{ ok: false, motivo, dettaglio }` — invece di lasciar
// scappare l'errore grezzo di Prisma quando una regola nomina un
// contenitore inesistente. La maggior parte dei test qui sotto non riguarda
// quel rifiuto: questa scorciatoia spacchetta il successo o lancia.
async function creaBatteria(...args: Parameters<typeof creaBatteriaGrezza>) {
  const r = await creaBatteriaGrezza(...args);
  if (!r.ok) throw new Error(`creaBatteria rifiutata inaspettatamente: ${r.motivo}`);
  return r;
}

const P = "battest-";
let teacherId: string;
// Chi conta o pesca, come lo vedono le funzioni di dominio.
const docente = (): Utente => ({ id: teacherId, admin: false });
let contA: string;
let contB: string;

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
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });

  teacherId = (await prisma.user.create({ data: { email: `${P}d@test.it`, name: "D", role: "TEACHER" } })).id;

  contA = (await prisma.contenitore.create({ data: { name: `${P}Equazioni`, createdById: teacherId } })).id;
  contB = (await prisma.contenitore.create({ data: { name: `${P}Sistemi`, createdById: teacherId } })).id;

  const base = { yearLevel: 2, topic: "prova", tags: [], difficulty: 1, accessoScuola: "EDITOR" as const };
  const a1 = (await prisma.esercizio.create({ data: { id: `${P}a1`, title: "A1", ...base } })).id;
  const a2 = (await prisma.esercizio.create({ data: { id: `${P}a2`, title: "A2", ...base } })).id;
  const b1 = (await prisma.esercizio.create({ data: { id: `${P}b1`, title: "B1", ...base } })).id;
  // Ognuno ha una versione: verificaBatteria conta solo esercizi con una
  // EsercizioVersione risolvibile come "disponibili" (Fix round 1).
  await prisma.esercizioVersione.createMany({
    data: [a1, a2, b1].map((esercizioId, i) => ({ esercizioId, version: 1, content: {}, hash: `h${i}` })),
  });
  await prisma.contenitoreEsercizio.createMany({
    data: [
      { contenitoreId: contA, esercizioId: a1 },
      { contenitoreId: contA, esercizioId: a2 },
      { contenitoreId: contB, esercizioId: b1 },
    ],
  });
});

describe("batterie", () => {
  it("si crea con le regole in ordine progressivo", async () => {
    const b = await creaBatteria(teacherId, `${P}Mista`, [
      { contenitoreId: contA, count: 2 },
      { contenitoreId: contB, count: 1 },
    ]);
    const regole = await prisma.batteriaRegola.findMany({ where: { batteriaId: b.id }, orderBy: { order: "asc" } });
    expect(regole).toHaveLength(2);
    expect(regole[0]).toMatchObject({ order: 0, contenitoreId: contA, count: 2 });
    expect(regole[1]).toMatchObject({ order: 1, contenitoreId: contB, count: 1 });
  });

  it("l'elenco riporta le regole col nome del contenitore e il conteggio dei compiti", async () => {
    const b = await creaBatteria(teacherId, `${P}Mista`, [{ contenitoreId: contA, count: 2 }]);
    const elenco = (await elencoBatterie()).filter((x) => x.name.startsWith(P));
    expect(elenco).toHaveLength(1);
    expect(elenco[0]).toMatchObject({
      id: b.id,
      name: `${P}Mista`,
      regole: [{ contenitore: `${P}Equazioni`, count: 2 }],
      compiti: 0,
    });
  });

  it("il conteggio dei compiti sale quando la batteria viene assegnata", async () => {
    const b = await creaBatteria(teacherId, `${P}Mista`, [{ contenitoreId: contA, count: 1 }]);
    const classe = await prisma.classe.create({
      data: { googleGroupEmail: `${P}c@scuola.it`, name: "C", yearLevel: 2 },
    });
    await prisma.compito.create({
      data: { batteriaId: b.id, classeId: classe.id, assignedById: teacherId, drawSeed: "s", drawnVersionIds: [] },
    });
    const elenco = (await elencoBatterie()).filter((x) => x.name.startsWith(P));
    expect(elenco[0]!.compiti).toBe(1);
  });

  it("verificaBatteria dice ok quando ogni contenitore ne ha abbastanza", async () => {
    const b = await creaBatteria(teacherId, `${P}Ok`, [
      { contenitoreId: contA, count: 2 },
      { contenitoreId: contB, count: 1 },
    ]);
    expect(await verificaBatteria(b.id, docente())).toEqual({ ok: true });
  });

  it("verificaBatteria elenca il contenitore e i due numeri quando manca qualcosa", async () => {
    const b = await creaBatteria(teacherId, `${P}Corta`, [
      { contenitoreId: contA, count: 2 },
      { contenitoreId: contB, count: 5 },
    ]);
    const r = await verificaBatteria(b.id, docente());
    expect(r).toEqual({
      ok: false,
      mancanti: [{ contenitore: `${P}Sistemi`, richiesti: 5, disponibili: 1 }],
    });
  });

  it("verificaBatteria su una batteria inesistente lancia invece di dire ok in silenzio", async () => {
    await expect(verificaBatteria("non-esiste", docente())).rejects.toThrow();
  });

  it("verificaBatteria non conta un esercizio senza versione come disponibile", async () => {
    const senzaVersione = (await prisma.esercizio.create({
      data: { id: `${P}senza-versione`, title: "Senza versione", yearLevel: 2, topic: "prova", tags: [], difficulty: 1, accessoScuola: "EDITOR" },
    })).id;
    await prisma.contenitoreEsercizio.create({ data: { contenitoreId: contA, esercizioId: senzaVersione } });
    // contA ha ora 3 membri (a1, a2 con versione, senza-versione senza): una
    // regola che ne chiede 3 deve vedersi dire che ne sono disponibili 2.
    const b = await creaBatteria(teacherId, `${P}TreSuTre`, [{ contenitoreId: contA, count: 3 }]);
    expect(await verificaBatteria(b.id, docente())).toEqual({
      ok: false,
      mancanti: [{ contenitore: `${P}Equazioni`, richiesti: 3, disponibili: 2 }],
    });
  });

  // Fix round 2: la stima di verificaBatteria deve essere PER DIFETTO, non
  // arbitraria. Qui il sorteggio vero potrebbe andare bene o male a seconda
  // del seme (contIncerto ha 4 esercizi e la sua regola ne chiede 2: un
  // sorteggio potrebbe prenderne 0, 1 o 2 dei due condivisi con contRischio);
  // se ne prendesse i due condivisi, a contRischio (che li condivide
  // entrambi e ne chiede 2 su un bacino di 3) resterebbe un solo esercizio
  // proprio: insufficiente. Una stima arbitraria (per id) potrebbe non
  // consumare nessuno dei due condivisi e dire "ok" nonostante quell'esito
  // sfortunato resti possibile; la stima per difetto deve rifiutare
  // comunque, perché assume che le regole precedenti abbiano consumato la
  // sovrapposizione al massimo possibile.
  it("verificaBatteria rifiuta quando la sovrapposizione rende il sorteggio incerto", async () => {
    const base = { yearLevel: 2, topic: "prova", tags: [], difficulty: 1, accessoScuola: "EDITOR" as const };
    const shared1 = (await prisma.esercizio.create({ data: { id: `${P}shared1`, title: "Shared1", ...base } })).id;
    const shared2 = (await prisma.esercizio.create({ data: { id: `${P}shared2`, title: "Shared2", ...base } })).id;
    const aOnly1 = (await prisma.esercizio.create({ data: { id: `${P}aonly1`, title: "AOnly1", ...base } })).id;
    const aOnly2 = (await prisma.esercizio.create({ data: { id: `${P}aonly2`, title: "AOnly2", ...base } })).id;
    const bOnly1 = (await prisma.esercizio.create({ data: { id: `${P}bonly1`, title: "BOnly1", ...base } })).id;
    await prisma.esercizioVersione.createMany({
      data: [shared1, shared2, aOnly1, aOnly2, bOnly1].map((esercizioId, i) => ({
        esercizioId, version: 1, content: {}, hash: `hh${i}`,
      })),
    });

    const contIncerto = (await prisma.contenitore.create({ data: { name: `${P}Incerto`, createdById: teacherId } })).id;
    await prisma.contenitoreEsercizio.createMany({
      data: [shared1, shared2, aOnly1, aOnly2].map((esercizioId) => ({ contenitoreId: contIncerto, esercizioId })),
    });
    const contRischio = (await prisma.contenitore.create({ data: { name: `${P}Rischio`, createdById: teacherId } })).id;
    await prisma.contenitoreEsercizio.createMany({
      data: [shared1, shared2, bOnly1].map((esercizioId) => ({ contenitoreId: contRischio, esercizioId })),
    });

    const b = await creaBatteria(teacherId, `${P}Incerta`, [
      { contenitoreId: contIncerto, count: 2 },
      { contenitoreId: contRischio, count: 2 },
    ]);

    expect(await verificaBatteria(b.id, docente())).toEqual({
      ok: false,
      mancanti: [{ contenitore: `${P}Rischio`, richiesti: 2, disponibili: 1 }],
    });
  });

  // Stessa sovrapposizione del test sopra, ma la seconda regola ne chiede
  // solo 1: anche nel caso peggiore (i due condivisi consumati per intero
  // dalla prima regola) resta comunque il suo esercizio proprio. La
  // prudenza della stima non deve rendere la funzione inutile sui casi in
  // cui la capienza regge anche nello scenario più sfortunato.
  it("verificaBatteria non rifiuta quando la capienza regge anche nel caso peggiore", async () => {
    const base = { yearLevel: 2, topic: "prova", tags: [], difficulty: 1, accessoScuola: "EDITOR" as const };
    const shared1 = (await prisma.esercizio.create({ data: { id: `${P}shared1b`, title: "Shared1", ...base } })).id;
    const shared2 = (await prisma.esercizio.create({ data: { id: `${P}shared2b`, title: "Shared2", ...base } })).id;
    const aOnly1 = (await prisma.esercizio.create({ data: { id: `${P}aonly1b`, title: "AOnly1", ...base } })).id;
    const aOnly2 = (await prisma.esercizio.create({ data: { id: `${P}aonly2b`, title: "AOnly2", ...base } })).id;
    const bOnly1 = (await prisma.esercizio.create({ data: { id: `${P}bonly1b`, title: "BOnly1", ...base } })).id;
    await prisma.esercizioVersione.createMany({
      data: [shared1, shared2, aOnly1, aOnly2, bOnly1].map((esercizioId, i) => ({
        esercizioId, version: 1, content: {}, hash: `hb${i}`,
      })),
    });

    const contIncerto = (await prisma.contenitore.create({ data: { name: `${P}Ample`, createdById: teacherId } })).id;
    await prisma.contenitoreEsercizio.createMany({
      data: [shared1, shared2, aOnly1, aOnly2].map((esercizioId) => ({ contenitoreId: contIncerto, esercizioId })),
    });
    const contComodo = (await prisma.contenitore.create({ data: { name: `${P}Comodo`, createdById: teacherId } })).id;
    await prisma.contenitoreEsercizio.createMany({
      data: [shared1, shared2, bOnly1].map((esercizioId) => ({ contenitoreId: contComodo, esercizioId })),
    });

    const b = await creaBatteria(teacherId, `${P}Ample`, [
      { contenitoreId: contIncerto, count: 2 },
      { contenitoreId: contComodo, count: 1 },
    ]);

    expect(await verificaBatteria(b.id, docente())).toEqual({ ok: true });
  });

  // Fix round finale, item 5: prima del fix, questa chiamata non restituiva
  // niente — la promessa RIFIUTAVA con l'errore grezzo di Prisma (vincolo di
  // chiave esterna violato su `BatteriaRegola.contenitoreId`), che la rotta
  // trasformava in un 500 senza nessun messaggio utile al docente.
  it("una regola che nomina un contenitore inesistente viene rifiutata, non lascia scappare un errore di Prisma", async () => {
    const r = await creaBatteriaGrezza(teacherId, `${P}ContInesistente`, [
      { contenitoreId: "questo-contenitore-non-esiste", count: 1 },
    ]);
    expect(r).toEqual({
      ok: false,
      motivo: "contenitore_non_trovato",
      dettaglio: { contenitoreId: "questo-contenitore-non-esiste" },
    });
    // Nessuna scrittura parziale: né la batteria né le sue regole.
    expect(await prisma.batteria.count({ where: { name: `${P}ContInesistente` } })).toBe(0);
  });

  it("una regola valida insieme a una che nomina un contenitore inesistente rifiuta l'intera batteria", async () => {
    const r = await creaBatteriaGrezza(teacherId, `${P}Mista2`, [
      { contenitoreId: contA, count: 1 },
      { contenitoreId: "questo-non-esiste", count: 1 },
    ]);
    expect(r).toMatchObject({ ok: false, motivo: "contenitore_non_trovato" });
    expect(await prisma.batteria.count({ where: { name: `${P}Mista2` } })).toBe(0);
  });
});

// Task 1: la regola con due forme — "ha il contenitore, oppure l'argomento,
// mai entrambi, mai nessuno dei due". Il database non può esprimere questo
// vincolo (Prisma non modella i CHECK), quindi il dominio lo impone in
// scrittura (creaBatteria, sotto) e lo riverifica in lettura (bacinoRegola,
// il punto che TUTTE le letture — verificaBatteria qui, assegna in
// compiti.ts — attraversano per risolvere una regola in candidati).
describe("la regola a due forme", () => {
  it("una regola con contenitore e argomento insieme è rifiutata in scrittura", async () => {
    const r = await creaBatteriaGrezza(teacherId, `${P}Doppia`, [
      { contenitoreId: contA, argomento: "equazioni", count: 1 },
    ]);
    expect(r).toEqual({ ok: false, motivo: "regola_malformata", dettaglio: { index: 0 } });
    // Nessuna scrittura parziale, stessa garanzia del rifiuto gemello
    // (contenitore_non_trovato) più sopra.
    expect(await prisma.batteria.count({ where: { name: `${P}Doppia` } })).toBe(0);
  });

  it("una regola senza contenitore né argomento è rifiutata in scrittura", async () => {
    const r = await creaBatteriaGrezza(teacherId, `${P}Vuota`, [{ count: 1 }]);
    expect(r).toEqual({ ok: false, motivo: "regola_malformata", dettaglio: { index: 0 } });
    expect(await prisma.batteria.count({ where: { name: `${P}Vuota` } })).toBe(0);
  });

  // Il caso che conta di più: anche se creaBatteria rifiuta in scrittura,
  // bacinoRegola — il punto unico di lettura — non si fida di quel
  // controllo esterno e riverifica da sé. Una regola malformata deve
  // FALLIRE, mai restituire un bacino vuoto: un bacino vuoto per una
  // regola malformata sarebbe indistinguibile da un bacino vuoto per una
  // regola valida senza corrispondenze, e verrebbe trattato in silenzio
  // come "zero candidati" — il compito consegnato più corto del promesso,
  // lo stesso difetto critico già pagato una volta con gli esercizi senza
  // versione (Fix round 1).
  it("bacinoRegola lancia per una regola senza contenitore né argomento, invece di dare zero candidati", async () => {
    await expect(
      bacinoRegola({ contenitoreId: null, argomento: null, anno: null, difficoltaMax: null }, docente()),
    ).rejects.toThrow();
  });

  it("bacinoRegola lancia per una regola con contenitore e argomento insieme", async () => {
    await expect(
      bacinoRegola({ contenitoreId: contA, argomento: "equazioni", anno: null, difficoltaMax: null }, docente()),
    ).rejects.toThrow();
  });

  it("una regola a filtro pesca esattamente gli esercizi che corrispondono, versione compresa", async () => {
    const base = { yearLevel: 2, topic: `${P}filtro-equazioni`, tags: [], difficulty: 1, accessoScuola: "EDITOR" as const };
    const okId = (await prisma.esercizio.create({ data: { id: `${P}filtro-ok`, title: "Ok", ...base } })).id;
    const troppoDifficileId = (await prisma.esercizio.create({
      data: { id: `${P}filtro-difficile`, title: "Difficile", ...base, difficulty: 5 },
    })).id;
    const annoSbagliatoId = (await prisma.esercizio.create({
      data: { id: `${P}filtro-anno`, title: "AltroAnno", ...base, yearLevel: 3 },
    })).id;
    const argomentoSbagliatoId = (await prisma.esercizio.create({
      data: { id: `${P}filtro-argomento`, title: "AltroArgomento", ...base, topic: `${P}filtro-sistemi` },
    })).id;
    const senzaVersioneId = (await prisma.esercizio.create({
      data: { id: `${P}filtro-senza-versione`, title: "SenzaVersione", ...base },
    })).id;
    await prisma.esercizioVersione.createMany({
      data: [okId, troppoDifficileId, annoSbagliatoId, argomentoSbagliatoId].map((esercizioId, i) => ({
        esercizioId, version: 1, content: {}, hash: `filtro-h${i}`,
      })),
    });
    // senzaVersioneId non ha nessuna EsercizioVersione: appartiene comunque
    // al bacino GREZZO (il filtro di versione è un passo successivo,
    // condiviso con le regole a contenitore — vedi sotto).

    const regola = { contenitoreId: null, argomento: `${P}filtro-equazioni`, anno: 2, difficoltaMax: 2 };
    const bacino = await bacinoRegola(regola, docente());
    expect(new Set(bacino)).toEqual(new Set([okId, senzaVersioneId]));

    const conVersione = await idsConVersione(bacino);
    const candidati = bacino.filter((id) => conVersione.has(id));
    expect(candidati).toEqual([okId]);
  });

  it("il filtro senza anno né difficoltaMax pesca da qualunque anno e difficoltà", async () => {
    const base = { topic: `${P}argomento-libero`, tags: [], accessoScuola: "EDITOR" as const };
    const e1 = (await prisma.esercizio.create({
      data: { id: `${P}libero-1`, title: "1", yearLevel: 1, difficulty: 1, ...base },
    })).id;
    const e2 = (await prisma.esercizio.create({
      data: { id: `${P}libero-2`, title: "2", yearLevel: 5, difficulty: 9, ...base },
    })).id;
    const bacino = await bacinoRegola({
      contenitoreId: null, argomento: `${P}argomento-libero`, anno: null, difficoltaMax: null,
    }, docente());
    expect(new Set(bacino)).toEqual(new Set([e1, e2]));
  });

  it("difficoltaMax è una soglia superiore inclusiva", async () => {
    const base = { topic: `${P}soglia`, yearLevel: 2, tags: [], accessoScuola: "EDITOR" as const };
    const alSoglia = (await prisma.esercizio.create({
      data: { id: `${P}soglia-uguale`, title: "=", difficulty: 3, ...base },
    })).id;
    await prisma.esercizio.create({ data: { id: `${P}soglia-sopra`, title: ">", difficulty: 4, ...base } });
    const bacino = await bacinoRegola({ contenitoreId: null, argomento: `${P}soglia`, anno: null, difficoltaMax: 3 }, docente());
    expect(bacino).toEqual([alSoglia]);
  });

  // Regressione: la stessa stima per-difetto (Fix round 2) applicata a una
  // batteria con regole di forma DIVERSA deve contare la sovrapposizione
  // esattamente come farebbe fra due regole a contenitore. `argomento` è
  // un valore GLOBALE (il filtro interroga tutta la tabella Esercizio, non
  // solo quelli di questo test) e quindi deliberatamente unico per prefisso
  // — non il "prova" condiviso dal beforeEach, che nel database di sviluppo
  // condiviso corrisponde già a decine di righe estranee a questo test.
  it("verificaBatteria applica la stessa stima peggiore-caso a una batteria con regole miste", async () => {
    const argomentoMisto = `${P}mista-argomento`;
    const base = { yearLevel: 2, topic: argomentoMisto, tags: [], difficulty: 1, accessoScuola: "EDITOR" as const };
    const shared1 = (await prisma.esercizio.create({ data: { id: `${P}mista-shared1`, title: "S1", ...base } })).id;
    const shared2 = (await prisma.esercizio.create({ data: { id: `${P}mista-shared2`, title: "S2", ...base } })).id;
    const soloArgomento = (await prisma.esercizio.create({ data: { id: `${P}mista-solo`, title: "Solo", ...base } })).id;
    await prisma.esercizioVersione.createMany({
      data: [shared1, shared2, soloArgomento].map((esercizioId, i) => ({
        esercizioId, version: 1, content: {}, hash: `mista-h${i}`,
      })),
    });
    const contMista = (await prisma.contenitore.create({ data: { name: `${P}Mista`, createdById: teacherId } })).id;
    await prisma.contenitoreEsercizio.createMany({
      data: [shared1, shared2].map((esercizioId) => ({ contenitoreId: contMista, esercizioId })),
    });

    // contMista = {shared1, shared2} (2); la regola a filtro risolve a
    // {shared1, shared2, soloArgomento} (3) — gli stessi due condivisi con
    // contMista. Caso peggiore: overlap=2, somma precedenti=2,
    // consumoPeggiore=2, disponibili=3-2=1.
    const b = await creaBatteria(teacherId, `${P}Mista3`, [
      { contenitoreId: contMista, count: 2 },
      { argomento: argomentoMisto, count: 1 },
    ]);
    expect(await verificaBatteria(b.id, docente())).toEqual({ ok: true });

    const b2 = await creaBatteria(teacherId, `${P}Mista4`, [
      { contenitoreId: contMista, count: 2 },
      { argomento: argomentoMisto, count: 2 },
    ]);
    expect(await verificaBatteria(b2.id, docente())).toEqual({
      ok: false,
      mancanti: [{ contenitore: argomentoMisto, richiesti: 2, disponibili: 1 }],
    });
  });

  // La regressione esplicita che il task chiede di scrivere e mantenere:
  // ogni batteria esistente ha regole SOLO a contenitore — questo test (e
  // tutti quelli sopra, nel describe "batterie", nessuno dei quali è stato
  // toccato da questo task) devono continuare a passare identici, stessi
  // candidati, stessa pesca, stesso ordine.
  it("una batteria puramente a contenitore si comporta esattamente come prima (regressione)", async () => {
    const b = await creaBatteria(teacherId, `${P}SoloContenitore`, [
      { contenitoreId: contA, count: 2 },
      { contenitoreId: contB, count: 1 },
    ]);
    const regole = await prisma.batteriaRegola.findMany({ where: { batteriaId: b.id }, orderBy: { order: "asc" } });
    expect(regole).toHaveLength(2);
    expect(regole[0]).toMatchObject({ contenitoreId: contA, argomento: null, anno: null, difficoltaMax: null, count: 2 });
    expect(regole[1]).toMatchObject({ contenitoreId: contB, argomento: null, anno: null, difficoltaMax: null, count: 1 });
    expect(await verificaBatteria(b.id, docente())).toEqual({ ok: true });
    const elenco = (await elencoBatterie()).filter((x) => x.name === `${P}SoloContenitore`);
    expect(elenco[0]).toMatchObject({
      regole: [{ contenitore: `${P}Equazioni`, count: 2 }, { contenitore: `${P}Sistemi`, count: 1 }],
    });
  });
});

// Dimostrato dal revisore su `assegnaDiretto` (docente-via-veloce, onda di
// correzioni sui numeri): `assegnaDiretto quanti=0` e `quanti=-3`
// riuscivano entrambi, creando un Compito che non promette nessun
// esercizio (mai apribile) e lasciando indietro la batteria automatica che
// lo produce. `assegnaDiretto` delega interamente a `creaBatteria` per
// scrivere la sua regola — la stessa funzione che ogni altro chiamante
// (il modulo a mano, un futuro import massivo) attraversa per scrivere
// QUALUNQUE regola. `creaBatteria` verifica già la FORMA di una regola
// (contenitore oppure argomento, mai entrambi né nessuno dei due) prima di
// qualunque scrittura, ma non guardava affatto il suo `count` — un buco
// che qualunque chiamante di `creaBatteria`, non solo `assegnaDiretto`,
// eredita.
//
// Il guardiano vive QUI, non in `assegnaDiretto`: è la stessa scelta già
// fatta per l'invariante contenitore/argomento (Task 1) — un solo punto di
// scrittura, una sola convalida, per ENTRAMBE le provenienze (a mano,
// automatica) ed eventuali future. Metterlo solo in `assegnaDiretto`
// protegge un'unica strada e ripete lì una convalida che la specifica
// della rotta a monte (`compiti/diretto/route.ts`, `count: z.number().int()
// .positive()`) già duplica altrove — esattamente il rischio contro cui il
// commento di `assegnaDiretto` mette in guardia ("un secondo posto dove
// sbagliare"). Un secondo chiamante di `creaBatteria` che componga una
// regola a mano (`/api/esercizi/batterie`, la sua stessa validazione zod)
// resta comunque protetto per lo stesso motivo — ma un chiamante che non
// passi da NESSUNA rotta (uno script, un import) non lo sarebbe, senza
// questo controllo nel dominio.
describe("il conteggio di una regola", () => {
  it.each([0, -1, -3])(
    "una regola con count=%i viene rifiutata in scrittura, non lascia scappare una batteria che non pesca mai nulla",
    async (countNonValido) => {
      const r = await creaBatteriaGrezza(teacherId, `${P}ConteggioNonValido${countNonValido}`, [
        { contenitoreId: contA, count: countNonValido },
      ]);
      expect(r).toEqual({
        ok: false,
        motivo: "conteggio_non_valido",
        dettaglio: { index: 0, count: countNonValido },
      });
      // Nessuna scrittura parziale, stessa garanzia dei rifiuti gemelli
      // (contenitore_non_trovato, regola_malformata) più sopra.
      expect(await prisma.batteria.count({ where: { name: `${P}ConteggioNonValido${countNonValido}` } })).toBe(0);
    },
  );

  it("una regola valida insieme a una con count non positivo rifiuta l'intera batteria, con l'indice di quella malformata", async () => {
    const r = await creaBatteriaGrezza(teacherId, `${P}ConteggioMisto`, [
      { contenitoreId: contA, count: 1 },
      { contenitoreId: contB, count: 0 },
    ]);
    expect(r).toEqual({ ok: false, motivo: "conteggio_non_valido", dettaglio: { index: 1, count: 0 } });
    expect(await prisma.batteria.count({ where: { name: `${P}ConteggioMisto` } })).toBe(0);
  });

  it("un count non intero viene rifiutato allo stesso modo", async () => {
    const r = await creaBatteriaGrezza(teacherId, `${P}ConteggioFrazionario`, [
      { contenitoreId: contA, count: 1.5 },
    ]);
    expect(r).toEqual({ ok: false, motivo: "conteggio_non_valido", dettaglio: { index: 0, count: 1.5 } });
  });
});

// Spec "Batterie": la batteria è comune, il bacino no — ciascuno pesca solo
// fra ciò che vede. Una raccolta senza ruolo dà zero, non un errore.
describe("il bacino rispetta la visibilità", () => {
  it("una regola su una raccolta privata altrui dà un bacino vuoto, e verificaBatteria lo dice", async () => {
    const estraneo = (await prisma.user.create({ data: { email: `${P}estraneo@test.it`, name: "E", role: "TEACHER" } })).id;
    const chiEstraneo: Utente = { id: estraneo, admin: false };
    const regola = { contenitoreId: contA, argomento: null, anno: null, difficoltaMax: null };
    expect(await bacinoRegola(regola, chiEstraneo)).toEqual([]);
    // Il proprietario, invece, la pesca intera.
    expect((await bacinoRegola(regola, docente())).sort()).toEqual([`${P}a1`, `${P}a2`]);

    const b = await creaBatteria(teacherId, `${P}Altrui`, [{ contenitoreId: contA, count: 1 }]);
    expect(await verificaBatteria(b.id, chiEstraneo)).toEqual({
      ok: false,
      mancanti: [{ contenitore: `${P}Equazioni`, richiesti: 1, disponibili: 0 }],
    });
  });

  it("dentro una raccolta visibile resta fuori l'esercizio privato che chi pesca non vede", async () => {
    const autore = (await prisma.user.create({ data: { email: `${P}autore@test.it`, name: "A", role: "TEACHER" } })).id;
    const collega = (await prisma.user.create({ data: { email: `${P}collega@test.it`, name: "C", role: "TEACHER" } })).id;
    // Privato dell'autore, messo in contA dal proprietario della raccolta
    // (non dall'autore): la raccolta non lo trasmette a nessuno.
    const privato = (await prisma.esercizio.create({
      data: { id: `${P}privato`, title: "P", yearLevel: 2, topic: "prova", tags: [], difficulty: 1, authorId: autore },
    })).id;
    await prisma.contenitoreEsercizio.create({ data: { contenitoreId: contA, esercizioId: privato, addedById: teacherId } });
    await prisma.condivisioneContenitore.create({ data: { contenitoreId: contA, userId: collega, ruolo: "EDITOR" } });

    const regola = { contenitoreId: contA, argomento: null, anno: null, difficoltaMax: null };
    expect((await bacinoRegola(regola, { id: collega, admin: false })).sort()).toEqual([`${P}a1`, `${P}a2`]);
    expect((await bacinoRegola(regola, { id: autore, admin: false }))).toEqual([]);
  });
});

// creaBatteria: una raccolta che chi crea non vede è "non trovata", come una
// che non esiste — nessun oracolo, e nessuna batteria che leghi a sé una
// raccolta privata altrui. Anche per un ADMIN, che compone batterie da
// docente (`comeDocente`), come poi pesca.
describe("creaBatteria e le raccolte invisibili", () => {
  it("una raccolta privata altrui è contenitore_non_trovato e non si scrive niente", async () => {
    const estraneo = (await prisma.user.create({ data: { email: `${P}estraneo2@test.it`, name: "E", role: "TEACHER" } })).id;
    const r = await creaBatteriaGrezza(estraneo, `${P}Invisibile`, [{ contenitoreId: contA, count: 1 }]);
    expect(r).toEqual({ ok: false, motivo: "contenitore_non_trovato", dettaglio: { contenitoreId: contA } });
    expect(await prisma.batteria.count({ where: { name: `${P}Invisibile` } })).toBe(0);
    // Stessa risposta di un id che non esiste.
    expect(await creaBatteriaGrezza(estraneo, `${P}Inesistente`, [{ contenitoreId: `${P}nessuno`, count: 1 }]))
      .toEqual({ ok: false, motivo: "contenitore_non_trovato", dettaglio: { contenitoreId: `${P}nessuno` } });
  });

  it("una raccolta condivisa con chi crea va bene; per un ADMIN quella privata altrui no", async () => {
    const collega = (await prisma.user.create({ data: { email: `${P}collega2@test.it`, name: "C", role: "TEACHER" } })).id;
    await prisma.condivisioneContenitore.create({ data: { contenitoreId: contA, userId: collega, ruolo: "VISUALIZZATORE" } });
    expect((await creaBatteriaGrezza(collega, `${P}Condivisa`, [{ contenitoreId: contA, count: 1 }])).ok).toBe(true);

    const admin = (await prisma.user.create({ data: { email: `${P}admin@test.it`, name: "Adm", role: "ADMIN" } })).id;
    expect(await creaBatteriaGrezza(admin, `${P}DaAdmin`, [{ contenitoreId: contB, count: 1 }]))
      .toEqual({ ok: false, motivo: "contenitore_non_trovato", dettaglio: { contenitoreId: contB } });
  });
});

// Un ADMIN conta e verifica da docente: le bozze private dei colleghi non
// entrano nel suo bacino.
describe("bacino e verifica di un ADMIN", () => {
  it("la bozza privata di un collega non entra; la sua sì", async () => {
    const admin = (await prisma.user.create({ data: { email: `${P}admin@test.it`, name: "Adm", role: "ADMIN" } })).id;
    const topic = `${P}admin-argomento`;
    const base = { yearLevel: 2, topic, tags: [], difficulty: 1 };
    await prisma.esercizio.create({ data: { id: `${P}del-collega`, title: "C", ...base, authorId: teacherId } });
    await prisma.esercizio.create({ data: { id: `${P}dell-admin`, title: "A", ...base, authorId: admin } });
    await prisma.esercizioVersione.createMany({
      data: [`${P}del-collega`, `${P}dell-admin`].map((esercizioId, i) => ({ esercizioId, version: 1, content: {}, hash: `adm${i}` })),
    });
    const chi: Utente = { id: admin, admin: true };
    const regola = { contenitoreId: null, argomento: topic, anno: 2, difficoltaMax: null };
    expect(await bacinoRegola(regola, chi)).toEqual([`${P}dell-admin`]);
    // Né la raccolta privata del collega.
    expect(await bacinoRegola({ contenitoreId: contA, argomento: null, anno: null, difficoltaMax: null }, chi)).toEqual([]);

    const b = await creaBatteria(admin, `${P}AdminVerifica`, [{ argomento: topic, anno: 2, count: 2 }]);
    expect(await verificaBatteria(b.id, chi)).toEqual({
      ok: false,
      mancanti: [{ contenitore: topic, richiesti: 2, disponibili: 1 }],
    });
  });
});

// Nuovo compito, Task 2: la terza forma, "scelti a mano" — solo
// `esercizioIds`, niente contenitore né argomento, `count` = quanti ne sono
// stati scelti.
describe("la regola a esercizi scelti", () => {
  it("si crea con esercizioIds e count uguale a quanti sono", async () => {
    const b = await creaBatteria(teacherId, `${P}Scelti`, [{ esercizioIds: [`${P}b1`, `${P}a1`], count: 2 }]);
    const [r] = await prisma.batteriaRegola.findMany({ where: { batteriaId: b.id } });
    expect(r).toMatchObject({ contenitoreId: null, argomento: null, anno: null, difficoltaMax: null, count: 2 });
    expect(r!.esercizioIds).toEqual([`${P}b1`, `${P}a1`]);
  });

  it("count diverso da quanti sono gli scelti, o un doppione, sono rifiutati", async () => {
    expect(await creaBatteriaGrezza(teacherId, `${P}ScMale`, [{ esercizioIds: [`${P}a1`], count: 2 }]))
      .toEqual({ ok: false, motivo: "conteggio_non_valido", dettaglio: { index: 0, count: 2 } });
    expect(await creaBatteriaGrezza(teacherId, `${P}ScMale`, [{ esercizioIds: [`${P}a1`, `${P}a1`], count: 2 }]))
      .toEqual({ ok: false, motivo: "regola_malformata", dettaglio: { index: 0 } });
    // Scelti insieme a un'altra forma: malformata, come contenitore+argomento.
    expect(await creaBatteriaGrezza(teacherId, `${P}ScMale`, [{ esercizioIds: [`${P}a1`], contenitoreId: contA, count: 1 }]))
      .toEqual({ ok: false, motivo: "regola_malformata", dettaglio: { index: 0 } });
    expect(await prisma.batteria.count({ where: { name: `${P}ScMale` } })).toBe(0);
  });

  it("bacinoRegola con la forma scelti restituisce solo gli scelti visibili, nel loro ordine", async () => {
    const collega = (await prisma.user.create({ data: { email: `${P}collega3@test.it`, name: "C", role: "TEACHER" } })).id;
    await prisma.esercizio.create({
      data: { id: `${P}privato3`, title: "P", yearLevel: 2, topic: "prova", tags: [], difficulty: 1, authorId: collega },
    });
    const regola = {
      contenitoreId: null, argomento: null, anno: null, difficoltaMax: null,
      esercizioIds: [`${P}b1`, `${P}privato3`, `${P}a1`, `${P}inesistente`],
    };
    expect(await bacinoRegola(regola, docente())).toEqual([`${P}b1`, `${P}a1`]);
    // Il collega vede il suo.
    expect(await bacinoRegola(regola, { id: collega, admin: false })).toEqual([`${P}b1`, `${P}privato3`, `${P}a1`]);
  });

  it("una regola scelti insieme a un contenitore lancia in lettura", async () => {
    await expect(
      bacinoRegola({ contenitoreId: contA, argomento: null, anno: null, difficoltaMax: null, esercizioIds: [`${P}a1`] }, docente()),
    ).rejects.toThrow(/malformata/);
  });
});

// Nuovo compito, Task 5: i modelli al posto dei "compiti preparati". Un
// modello è una `Batteria` non automatica, comune a tutta la scuola; ogni
// compito ha la sua copia automatica dei blocchi e ricorda il modello con
// `modelloId`. I vecchi compiti puntano invece al compito preparato
// direttamente con `batteriaId`.
describe("modelli", () => {
  let collega: string;
  let classeId: string;

  beforeEach(async () => {
    collega = (await prisma.user.create({ data: { email: `${P}collega-mod@test.it`, name: "Collega", role: "TEACHER" } })).id;
    classeId = (await prisma.classe.create({ data: { googleGroupEmail: `${P}mod@scuola.it`, name: "M", yearLevel: 2 } })).id;
  });

  // Un compito "nuovo": la sua copia automatica, e il modello da cui viene.
  async function compitoDaModello(modelloId: string) {
    const copia = await creaBatteria(teacherId, `${P}Copia`, [{ contenitoreId: contA, count: 1 }], undefined, true);
    return prisma.compito.create({
      data: { batteriaId: copia.id, modelloId, classeId, assignedById: teacherId, drawSeed: "s", drawnVersionIds: [] },
    });
  }
  // Un compito "legacy": punta al compito preparato direttamente.
  async function compitoLegacy(batteriaId: string) {
    return prisma.compito.create({ data: { batteriaId, classeId, assignedById: teacherId, drawSeed: "s", drawnVersionIds: [] } });
  }

  it("l'elenco ha autore, mio, blocchi in breve e quante volte è usato; niente automatiche", async () => {
    const mio = await creaBatteria(teacherId, `${P}Mio`, [
      { contenitoreId: contA, count: 2 },
      { argomento: "prova", anno: 2, count: 1 },
    ]);
    const suo = await creaBatteria(collega, `${P}Suo`, [{ esercizioIds: [`${P}a1`, `${P}b1`], count: 2 }]);
    await creaBatteria(teacherId, `${P}Automatica`, [{ contenitoreId: contA, count: 1 }], undefined, true);

    // usato = compiti col modello + compiti legacy che puntano direttamente;
    // un compito che fa entrambe le cose conta una volta sola.
    await compitoDaModello(mio.id);
    await compitoDaModello(mio.id);
    await compitoLegacy(mio.id);
    await prisma.compito.create({
      data: { batteriaId: mio.id, modelloId: mio.id, classeId, assignedById: teacherId, drawSeed: "s", drawnVersionIds: [] },
    });

    const elenco = (await elencoModelli(docente())).filter((m) => m.nome.startsWith(P));
    expect(elenco.map((m) => m.nome).sort()).toEqual([`${P}Mio`, `${P}Suo`]);
    expect(elenco.find((m) => m.id === mio.id)).toEqual({
      id: mio.id,
      nome: `${P}Mio`,
      autoreNome: "D",
      mio: true,
      blocchi: [
        { etichetta: `${P}Equazioni`, quanti: 2 },
        { etichetta: "prova", quanti: 1 },
      ],
      usato: 4,
    });
    expect(elenco.find((m) => m.id === suo.id)).toMatchObject({
      autoreNome: "Collega",
      mio: false,
      blocchi: [{ etichetta: "Esercizi scelti", quanti: 2 }],
      usato: 0,
    });
  });

  it("il nome di una raccolta che chi guarda non vede non compare", async () => {
    // contA è privata del docente: il collega vede il modello (comune) ma
    // non il nome della raccolta.
    await creaBatteria(teacherId, `${P}Privata`, [{ contenitoreId: contA, count: 1 }]);
    const [m] = (await elencoModelli({ id: collega, admin: false })).filter((x) => x.nome === `${P}Privata`);
    expect(m!.blocchi).toEqual([{ etichetta: "Raccolta non disponibile", quanti: 1 }]);
    expect(m!.mio).toBe(false);
  });

  it("caricaModello restituisce i blocchi nell'ordine, senza anno se la regola non lo ha", async () => {
    const m = await creaBatteria(teacherId, `${P}Carica`, [
      { argomento: "prova", count: 2 },
      { contenitoreId: contB, count: 1 },
      { esercizioIds: [`${P}a2`], count: 1 },
      { argomento: "prova", anno: 3, difficoltaMax: 2, count: 1 },
    ]);
    expect(await caricaModello(m.id)).toEqual({
      id: m.id,
      nome: `${P}Carica`,
      blocchi: [
        { tipo: "argomento", argomento: "prova", quanti: 2 },
        { tipo: "raccolta", contenitoreId: contB, quanti: 1 },
        { tipo: "scelti", esercizioIds: [`${P}a2`] },
        { tipo: "argomento", argomento: "prova", anno: 3, difficoltaMax: 2, quanti: 1 },
      ],
    });
  });

  it("caricaModello non carica una batteria automatica né un id inesistente", async () => {
    const auto = await creaBatteria(teacherId, `${P}Auto`, [{ contenitoreId: contA, count: 1 }], undefined, true);
    expect(await caricaModello(auto.id)).toBeNull();
    expect(await caricaModello(`${P}nessuno`)).toBeNull();
  });

  it("un altro docente non può eliminare il modello: non_trovato e niente cancellato", async () => {
    const m = await creaBatteria(teacherId, `${P}Altrui`, [{ contenitoreId: contA, count: 1 }]);
    expect(await eliminaModello(m.id, { id: collega, admin: false })).toEqual({ ok: false, motivo: "non_trovato" });
    expect(await prisma.batteria.findUnique({ where: { id: m.id } })).toMatchObject({ automatica: false });
  });

  it("un id inesistente o una batteria automatica sono non_trovato", async () => {
    const auto = await creaBatteria(teacherId, `${P}Auto`, [{ contenitoreId: contA, count: 1 }], undefined, true);
    expect(await eliminaModello(auto.id, docente())).toEqual({ ok: false, motivo: "non_trovato" });
    expect(await prisma.batteria.findUnique({ where: { id: auto.id } })).not.toBeNull();
    expect(await eliminaModello(`${P}nessuno`, docente())).toEqual({ ok: false, motivo: "non_trovato" });
  });

  it("un ADMIN elimina il modello di un collega", async () => {
    const admin = (await prisma.user.create({ data: { email: `${P}admin-mod@test.it`, name: "Adm", role: "ADMIN" } })).id;
    const m = await creaBatteria(teacherId, `${P}DaAdmin`, [{ contenitoreId: contA, count: 1 }]);
    expect(await eliminaModello(m.id, { id: admin, admin: true })).toEqual({ ok: true });
    expect(await prisma.batteria.findUnique({ where: { id: m.id } })).toBeNull();
  });

  it("un modello legacy usato da compiti si nasconde (diventa automatico), i compiti restano intatti", async () => {
    const m = await creaBatteria(teacherId, `${P}Legacy`, [{ contenitoreId: contA, count: 1 }]);
    const c = await compitoLegacy(m.id);
    expect(await eliminaModello(m.id, docente())).toEqual({ ok: true });
    expect(await prisma.batteria.findUnique({ where: { id: m.id } })).toMatchObject({ automatica: true });
    expect(await prisma.batteriaRegola.count({ where: { batteriaId: m.id } })).toBe(1);
    expect(await prisma.compito.findUnique({ where: { id: c.id } })).toMatchObject({ batteriaId: m.id });
    expect((await elencoModelli(docente())).some((x) => x.id === m.id)).toBe(false);
  });

  it("un modello nuovo usato da compiti si cancella, modelloId torna null, i compiti restano intatti", async () => {
    const m = await creaBatteria(teacherId, `${P}Nuovo`, [{ contenitoreId: contA, count: 1 }]);
    const c = await compitoDaModello(m.id);
    expect(await eliminaModello(m.id, docente())).toEqual({ ok: true });
    expect(await prisma.batteria.findUnique({ where: { id: m.id } })).toBeNull();
    const dopo = await prisma.compito.findUnique({ where: { id: c.id } });
    expect(dopo).toMatchObject({ batteriaId: c.batteriaId, modelloId: null });
    expect(await prisma.batteriaRegola.count({ where: { batteriaId: c.batteriaId } })).toBe(1);
  });
});
