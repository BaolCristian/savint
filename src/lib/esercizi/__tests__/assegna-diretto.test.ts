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
  // Giro di correzioni 1: la specifica diceva sia "diventa due voci nel
  // menu" sia "si normalizza in lettura per il menu" — contraddittorio,
  // corretto in cae8f1a. La fusione (versione precedente di questo test)
  // nascondeva grafie diverse dietro UNA voce con un conteggio sommato, ma
  // il filtro che pesca (`bacinoRegola`, via `quantiCorrispondono`)
  // confronta il testo ESATTO: selezionare quella voce fusa trovava molti
  // meno esercizi di quanti il menu dichiarava. Ogni grafia resta la sua
  // voce, col suo conteggio esatto — brutto da vedere, ma raggiungibile.
  it("NON fonde spazi ai bordi o maiuscole/minuscole: ogni grafia resta una voce a sé, col proprio conteggio esatto", async () => {
    await creaEsercizio(`${P}radici-1`, `${P}Radici`);
    await creaEsercizio(`${P}radici-2`, `${P}radici`);
    await creaEsercizio(`${P}radici-3`, `${P}radici `); // spazio in coda

    const risultati = (await argomentiDisponibili()).filter((x) => x.argomento.trim().toLowerCase() === `${P}radici`);
    expect(risultati).toHaveLength(3);
    expect(new Set(risultati.map((x) => x.argomento))).toEqual(
      new Set([`${P}Radici`, `${P}radici`, `${P}radici `]),
    );
    expect(risultati.every((x) => x.quanti === 1)).toBe(true);
  });

  // Il test che il giro di correzioni chiede esplicitamente: la divergenza
  // che la fusione produceva, resa concreta come un'uguaglianza che deve
  // valere per OGNI voce del menu, non solo osservata a occhio su un caso.
  // Con la fusione, la voce rappresentativa (quella scelta come "la più
  // piccola alfabeticamente" fra le grafie) portava la SOMMA di entrambe,
  // ma `quantiCorrispondono` — che passa dalla stessa `bacinoRegola` che la
  // pesca vera userebbe, confronto ESATTO sul testo — ne trovava solo una
  // frazione: la voce mentiva su quanti esercizi selezionarla avrebbe
  // davvero raggiunto.
  it("il conteggio di ogni voce del menu coincide con ciò che quantiCorrispondono trova selezionandola — niente fusione fra grafie diverse", async () => {
    const suffisso = "fusione-argomento";
    const grafiaMinuscola = `${P}${suffisso}`;
    const grafiaMaiuscola = `${P}${suffisso.charAt(0).toUpperCase()}${suffisso.slice(1)}`;

    await creaEsercizio(`${P}fus-1`, grafiaMinuscola, { yearLevel: 2 });
    await creaEsercizio(`${P}fus-2`, grafiaMinuscola, { yearLevel: 2 });
    await creaEsercizio(`${P}fus-3`, grafiaMinuscola, { yearLevel: 2 });
    await creaEsercizio(`${P}fus-4`, grafiaMaiuscola, { yearLevel: 2 });

    const voci = (await argomentiDisponibili(2)).filter((x) => x.argomento.toLowerCase() === grafiaMinuscola.toLowerCase());
    // Due grafie distinte, non una sola voce fusa: la prima asserzione che
    // la versione fusa faceva fallire.
    expect(voci).toHaveLength(2);

    for (const voce of voci) {
      const trovati = await quantiCorrispondono({ anno: 2, argomento: voce.argomento });
      expect(trovati).toBe(voce.quanti);
    }
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

  // L'ordinamento ignora la cassa (spec corretta, cae8f1a): le grafie
  // diverse dello stesso argomento devono finire ADIACENTI nella lista,
  // così la deriva si vede a colpo d'occhio invece di essere sparsa.
  it("l'ordinamento ignora la cassa: grafie diverse dello stesso argomento sono adiacenti", async () => {
    const suffisso = "ordine-argomento";
    const minuscola = `${P}${suffisso}`;
    const maiuscola = `${P}${suffisso.toUpperCase()}`;
    await creaEsercizio(`${P}ord-1`, maiuscola, { yearLevel: 2 });
    await creaEsercizio(`${P}ord-2`, minuscola, { yearLevel: 2 });

    const tutti = (await argomentiDisponibili(2)).filter((x) => x.argomento.toLowerCase() === minuscola.toLowerCase());
    expect(tutti).toHaveLength(2);

    const tuttiOrdinati = (await argomentiDisponibili(2));
    const iMin = tuttiOrdinati.findIndex((x) => x.argomento === minuscola);
    const iMai = tuttiOrdinati.findIndex((x) => x.argomento === maiuscola);
    expect(Math.abs(iMin - iMai)).toBe(1);
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

  // Fix round 1: `assegnaDiretto` crea la `Batteria` automatica PRIMA che
  // `assegna` validi qualunque cosa (date, classe, capienza) — ogni
  // rifiuto, quale che sia il motivo, lasciava quella riga (e la sua
  // `BatteriaRegola`) orfana nel database: invisibile in `elencoBatterie`
  // (che esclude `automatica: true`), mai ripulita. Un docente che sbaglia
  // tre volte la dimensione della richiesta lasciava tre righe morte.
  it("un'assegnazione diretta rifiutata non lascia una batteria orfana: il conteggio non cambia", async () => {
    const topic = `${P}orfana-capienza`;
    await creaEsercizio(`${P}orf-1`, topic, { yearLevel: 2, difficulty: 1 });

    const primaDelRifiuto = await prisma.batteria.count({ where: { name: { contains: P } } });
    const r = await assegnaDiretto({ classeId, teacherId, filtro: { anno: 2, argomento: topic }, quanti: 5 });
    expect(r.ok).toBe(false);

    const dopoIlRifiuto = await prisma.batteria.count({ where: { name: { contains: P } } });
    expect(dopoIlRifiuto).toBe(primaDelRifiuto);
  });

  // Il verso opposto, esplicito: la pulizia riguarda SOLO i rifiuti. Una
  // batteria che ha davvero prodotto un Compito deve restare — è la
  // provenienza di quel compito, cancellarla romperebbe il vincolo
  // `onDelete: Restrict` di `Compito.batteria`.
  it("un'assegnazione diretta riuscita lascia la batteria automatica al suo posto", async () => {
    const topic = `${P}successo-batteria-resta`;
    await creaEsercizio(`${P}sbr-1`, topic, { yearLevel: 2, difficulty: 1 });

    const primaDelSuccesso = await prisma.batteria.count({ where: { name: { contains: P } } });
    const r = await assegnaDiretto({ classeId, teacherId, filtro: { anno: 2, argomento: topic }, quanti: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const dopoIlSuccesso = await prisma.batteria.count({ where: { name: { contains: P } } });
    expect(dopoIlSuccesso).toBe(primaDelSuccesso + 1);

    const compito = await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } });
    await expect(
      prisma.batteria.findUniqueOrThrow({ where: { id: compito.batteriaId } }),
    ).resolves.toBeDefined();
  });

  // Fix round 2: la pulizia del Fix round 1 copriva solo il RIFIUTO
  // (`!esito.ok`), non un'ECCEZIONE di `assegna` — un guasto del database a
  // metà chiamata lasciava lo stesso residuo invisibile dalla porta rimasta
  // aperta. Serve un guasto VERO, non un mock sul client prisma condiviso
  // (un `vi.spyOn` su `prisma.classe.findUnique`, tentato per primo, ha
  // lasciato il delegate del client rotto per i test successivi dello
  // stesso file anche dopo `mockRestore()` — troppo rischioso su un client
  // vivo condiviso con l'intero resto della suite). Un `classeId` con un
  // byte NUL incorporato produce lo stesso sintomo per una via reale e
  // isolata: Postgres rifiuta un NUL in un valore `text` con un errore di
  // codifica genuino (`22021`, verificato con una prova diretta prima di
  // scrivere questo test), lanciato dalla query vera che `assegna` fa
  // DOPO aver già scritto la batteria automatica (creaBatteria, dentro
  // assegnaDiretto) ma prima di scrivere qualunque Compito — lo stesso
  // punto in cui un'interruzione di rete produrrebbe lo stesso sintomo,
  // senza toccare il client condiviso.
  it("se assegna lancia un'eccezione (es. un guasto del database) invece di rifiutare, la batteria appena creata viene comunque pulita e l'errore originale propaga", async () => {
    const topic = `${P}eccezione-pulizia`;
    await creaEsercizio(`${P}ecc-1`, topic, { yearLevel: 2, difficulty: 1 });

    const primaDelTentativo = await prisma.batteria.count({ where: { name: { contains: P } } });

    const classeIdCorrotto = `${classeId}${String.fromCharCode(0)}`;
    await expect(
      assegnaDiretto({ classeId: classeIdCorrotto, teacherId, filtro: { anno: 2, argomento: topic }, quanti: 1 }),
    ).rejects.toThrow(/invalid byte sequence|22021/i);

    const dopoIlTentativo = await prisma.batteria.count({ where: { name: { contains: P } } });
    expect(dopoIlTentativo).toBe(primaDelTentativo);
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
