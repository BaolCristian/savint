import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  creaBatteria as creaBatteriaGrezza,
  elencoBatterie,
  verificaBatteria,
  eliminaBatteria,
  bacinoRegola,
  idsConVersione,
  candidatiDisponibili,
} from "../batterie";

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

  const base = { yearLevel: 2, topic: "prova", tags: [], difficulty: 1 };
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
    expect(await verificaBatteria(b.id)).toEqual({ ok: true });
  });

  it("verificaBatteria elenca il contenitore e i due numeri quando manca qualcosa", async () => {
    const b = await creaBatteria(teacherId, `${P}Corta`, [
      { contenitoreId: contA, count: 2 },
      { contenitoreId: contB, count: 5 },
    ]);
    const r = await verificaBatteria(b.id);
    expect(r).toEqual({
      ok: false,
      mancanti: [{ contenitore: `${P}Sistemi`, richiesti: 5, disponibili: 1 }],
    });
  });

  it("verificaBatteria su una batteria inesistente lancia invece di dire ok in silenzio", async () => {
    await expect(verificaBatteria("non-esiste")).rejects.toThrow();
  });

  it("verificaBatteria non conta un esercizio senza versione come disponibile", async () => {
    const senzaVersione = (await prisma.esercizio.create({
      data: { id: `${P}senza-versione`, title: "Senza versione", yearLevel: 2, topic: "prova", tags: [], difficulty: 1 },
    })).id;
    await prisma.contenitoreEsercizio.create({ data: { contenitoreId: contA, esercizioId: senzaVersione } });
    // contA ha ora 3 membri (a1, a2 con versione, senza-versione senza): una
    // regola che ne chiede 3 deve vedersi dire che ne sono disponibili 2.
    const b = await creaBatteria(teacherId, `${P}TreSuTre`, [{ contenitoreId: contA, count: 3 }]);
    expect(await verificaBatteria(b.id)).toEqual({
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
    const base = { yearLevel: 2, topic: "prova", tags: [], difficulty: 1 };
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

    expect(await verificaBatteria(b.id)).toEqual({
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
    const base = { yearLevel: 2, topic: "prova", tags: [], difficulty: 1 };
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

    expect(await verificaBatteria(b.id)).toEqual({ ok: true });
  });

  it("una batteria libera si cancella", async () => {
    const b = await creaBatteria(teacherId, `${P}Libera`, [{ contenitoreId: contA, count: 1 }]);
    expect(await eliminaBatteria(b.id)).toEqual({ ok: true });
    expect(await prisma.batteria.findUnique({ where: { id: b.id } })).toBeNull();
  });

  it("una batteria con compiti assegnati NON si cancella", async () => {
    const b = await creaBatteria(teacherId, `${P}Assegnata`, [{ contenitoreId: contA, count: 1 }]);
    const classe = await prisma.classe.create({
      data: { googleGroupEmail: `${P}elimina@scuola.it`, name: "Elimina", yearLevel: 2 },
    });
    await prisma.compito.create({
      data: { batteriaId: b.id, classeId: classe.id, assignedById: teacherId, drawSeed: "s", drawnVersionIds: [] },
    });
    expect(await eliminaBatteria(b.id)).toEqual({ ok: false, motivo: "in_uso" });
    expect(await prisma.batteria.findUnique({ where: { id: b.id } })).not.toBeNull();
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
      bacinoRegola({ contenitoreId: null, argomento: null, anno: null, difficoltaMax: null }),
    ).rejects.toThrow();
  });

  it("bacinoRegola lancia per una regola con contenitore e argomento insieme", async () => {
    await expect(
      bacinoRegola({ contenitoreId: contA, argomento: "equazioni", anno: null, difficoltaMax: null }),
    ).rejects.toThrow();
  });

  it("una regola a filtro pesca esattamente gli esercizi che corrispondono, versione compresa", async () => {
    const base = { yearLevel: 2, topic: `${P}filtro-equazioni`, tags: [], difficulty: 1 };
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
    const bacino = await bacinoRegola(regola);
    expect(new Set(bacino)).toEqual(new Set([okId, senzaVersioneId]));

    const conVersione = await idsConVersione(bacino);
    const candidati = candidatiDisponibili(bacino, new Set(), conVersione);
    expect(candidati).toEqual([okId]);
  });

  it("il filtro senza anno né difficoltaMax pesca da qualunque anno e difficoltà", async () => {
    const base = { topic: `${P}argomento-libero`, tags: [] };
    const e1 = (await prisma.esercizio.create({
      data: { id: `${P}libero-1`, title: "1", yearLevel: 1, difficulty: 1, ...base },
    })).id;
    const e2 = (await prisma.esercizio.create({
      data: { id: `${P}libero-2`, title: "2", yearLevel: 5, difficulty: 9, ...base },
    })).id;
    const bacino = await bacinoRegola({
      contenitoreId: null, argomento: `${P}argomento-libero`, anno: null, difficoltaMax: null,
    });
    expect(new Set(bacino)).toEqual(new Set([e1, e2]));
  });

  it("difficoltaMax è una soglia superiore inclusiva", async () => {
    const base = { topic: `${P}soglia`, yearLevel: 2, tags: [] };
    const alSoglia = (await prisma.esercizio.create({
      data: { id: `${P}soglia-uguale`, title: "=", difficulty: 3, ...base },
    })).id;
    await prisma.esercizio.create({ data: { id: `${P}soglia-sopra`, title: ">", difficulty: 4, ...base } });
    const bacino = await bacinoRegola({ contenitoreId: null, argomento: `${P}soglia`, anno: null, difficoltaMax: 3 });
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
    const base = { yearLevel: 2, topic: argomentoMisto, tags: [], difficulty: 1 };
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
    expect(await verificaBatteria(b.id)).toEqual({ ok: true });

    const b2 = await creaBatteria(teacherId, `${P}Mista4`, [
      { contenitoreId: contMista, count: 2 },
      { argomento: argomentoMisto, count: 2 },
    ]);
    expect(await verificaBatteria(b2.id)).toEqual({
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
    expect(await verificaBatteria(b.id)).toEqual({ ok: true });
    const elenco = (await elencoBatterie()).filter((x) => x.name === `${P}SoloContenitore`);
    expect(elenco[0]).toMatchObject({
      regole: [{ contenitore: `${P}Equazioni`, count: 2 }, { contenitore: `${P}Sistemi`, count: 1 }],
    });
  });
});
