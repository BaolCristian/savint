import seedrandom from "seedrandom";
import { prisma } from "@/lib/db/client";
import { comeDocente, ruoliEsercizi, ruoloContenitore, type Utente } from "./accesso";
import { bacinoRegola, formaRegola, idsConVersione, type RegolaInput } from "./batterie";

/** Un blocco del Nuovo compito (zona 2 della pagina): la stessa cosa di una
 * `BatteriaRegola`, nella forma in cui la pagina e i modelli la maneggiano.
 * Tre forme, una per ciascuna forma di regola (`formaRegola`, batterie.ts):
 * "argomento" ↔ filtro, "raccolta" ↔ contenitore, "scelti" ↔ esercizioIds.
 * Un blocco "scelti" non ha `quanti`: si assegnano tutti, e il numero è
 * quanti sono (spec, "Blocchi ed estrazione").
 *
 * `anno` del blocco argomento è facoltativo nel tipo, come `anno` su
 * `RegolaInput` e sulla riga: la pagina lo prende sempre dalla classe, ma
 * nel database esistono regole a filtro nate senza anno (batterie composte
 * a mano prima del Nuovo compito), e `bloccoDaRegola` deve poterle
 * rappresentare invece di lanciare o di inventarsi un anno — un anno
 * inventato restringerebbe in silenzio il bacino di un modello. */
export type Blocco =
  | { tipo: "argomento"; argomento: string; anno?: number; difficoltaMax?: number; quanti: number }
  | { tipo: "raccolta"; contenitoreId: string; quanti: number }
  | { tipo: "scelti"; esercizioIds: string[] };

/** Un esercizio estratto, con l'ULTIMA versione (Decisioni, punto 3: "si
 * assegna l'ultima versione"): ciò che serve all'anteprima (titolo e
 * contenuto) e all'assegnazione (l'id versione da fissare nel compito). */
export type EsercizioEstratto = { esercizioId: string; versioneId: string; titolo: string; content: unknown };

/** Una riga del riepilogo (zona 3) per un blocco. `disponibili` è quanti
 * candidati restavano a quel blocco DOPO l'esclusione dei già presi dai
 * blocchi precedenti: è il numero confrontabile con `richiesti`, quello che
 * rende il blocco insufficiente ("Equazioni: ne chiedi 5, ce ne sono 3").
 * `nonDisponibili` ha senso solo per un blocco "scelti": i titoli degli
 * scelti che non si possono più assegnare — vedi `baciniDeiBlocchi` per la
 * regola sul titolo di un esercizio che il docente non vede. */
export type RiepilogoBlocco = { etichetta: string; richiesti: number; disponibili: number; nonDisponibili: string[] };

/** Il riepilogo di un'estrazione. `totale` è sempre la somma dei richiesti
 * (quanti esercizi riceverà ogni studente se il compito si può assegnare);
 * `esercizi` è vuoto quando `sufficiente` è falso: un'estrazione parziale
 * non va mostrata in anteprima né assegnata, quindi non si calcola nemmeno.
 * `duplicatiTolti`: vedi `estraiConDettaglio`. */
export type Riepilogo = {
  blocchi: RiepilogoBlocco[];
  duplicatiTolti: number;
  totale: number;
  sufficiente: boolean;
  esercizi: EsercizioEstratto[];
};

/** Il bacino di un blocco già risolto: gli id che può pescare (visibili a
 * chi assegna, con almeno una versione) e quanti ne deve prendere. È la
 * forma che consuma `estraiDaBacini`, e la stessa che il compito "diverse
 * per studente" congelerà (Decisioni, punto 4). `scelti` marca un blocco
 * "scelti a mano": i suoi esercizi vincono sempre sui blocchi casuali e
 * restano nell'ordine dato (vedi `estraiConDettaglio`); assente = blocco
 * casuale, come ogni regola prima del Nuovo compito. */
type Bacino = { candidati: string[]; richiesti: number; scelti?: boolean };

/** Il titolo con cui un esercizio scelto ma non più assegnabile compare nel
 * riepilogo quando chi assegna NON lo vede: mai il titolo vero, che è
 * un'informazione sull'esercizio privato di un collega (la stessa ragione
 * per cui una raccolta invisibile è "Raccolta non disponibile"). */
const ESERCIZIO_NON_DISPONIBILE = "Esercizio non disponibile";
const RACCOLTA_NON_DISPONIBILE = "Raccolta non disponibile";
const ETICHETTA_SCELTI = "Esercizi scelti";

/** La regola (forma della riga) di un blocco, per `bacinoRegola`. */
function rigaDaBlocco(b: Blocco) {
  switch (b.tipo) {
    case "argomento":
      return { contenitoreId: null, argomento: b.argomento, anno: b.anno ?? null, difficoltaMax: b.difficoltaMax ?? null, esercizioIds: [] };
    case "raccolta":
      return { contenitoreId: b.contenitoreId, argomento: null, anno: null, difficoltaMax: null, esercizioIds: [] };
    case "scelti":
      return { contenitoreId: null, argomento: null, anno: null, difficoltaMax: null, esercizioIds: b.esercizioIds };
  }
}

/** Il blocco di una `BatteriaRegola` salvata (per "Usa questo modello" e per
 * rileggere i blocchi di un compito). Passa da `formaRegola`, l'unico posto
 * dell'invariante: una riga malformata LANCIA, non diventa un blocco di una
 * forma indovinata (lo stesso principio di `bacinoRegola`). */
export function bloccoDaRegola(regola: {
  contenitoreId: string | null;
  argomento: string | null;
  anno: number | null;
  difficoltaMax: number | null;
  count: number;
  esercizioIds: readonly string[];
}): Blocco {
  const forma = formaRegola(regola);
  switch (forma) {
    case "scelti":
      return { tipo: "scelti", esercizioIds: [...regola.esercizioIds] };
    case "contenitore":
      return { tipo: "raccolta", contenitoreId: regola.contenitoreId!, quanti: regola.count };
    case "filtro":
      return {
        tipo: "argomento",
        argomento: regola.argomento!,
        ...(regola.anno != null ? { anno: regola.anno } : {}),
        ...(regola.difficoltaMax != null ? { difficoltaMax: regola.difficoltaMax } : {}),
        quanti: regola.count,
      };
    default:
      throw new Error(
        "BatteriaRegola malformata: deve avere una sola forma fra contenitoreId, argomento ed esercizioIds",
      );
  }
}

/** La `RegolaInput` di un blocco, per `creaBatteria` (compito automatico,
 * "Salva anche come modello"). Solo i campi della sua forma; il `count` di
 * un blocco "scelti" è quanti sono gli scelti — l'unico valore che
 * `creaBatteria` accetta per quella forma. */
export function regolaDaBlocco(b: Blocco): RegolaInput {
  switch (b.tipo) {
    case "argomento":
      return {
        argomento: b.argomento,
        ...(b.anno != null ? { anno: b.anno } : {}),
        ...(b.difficoltaMax != null ? { difficoltaMax: b.difficoltaMax } : {}),
        count: b.quanti,
      };
    case "raccolta":
      return { contenitoreId: b.contenitoreId, count: b.quanti };
    case "scelti":
      return { esercizioIds: [...b.esercizioIds], count: b.esercizioIds.length };
  }
}

/** Risolve ogni blocco nel suo bacino, sempre COME DOCENTE: `chi` passa da
 * `comeDocente`, e la mappa dei visibili (`ruoliEsercizi`, che carica tutti
 * gli esercizi) si calcola UNA volta per tutti i blocchi e si passa a
 * `bacinoRegola` — la stessa risoluzione di `assegna` e `verificaBatteria`,
 * non una seconda che possa divergere. Un ADMIN che insegna pesca così solo
 * fra ciò che vedrebbe da docente.
 *
 * `candidati` = bacino visibile ∩ esercizi con almeno una versione (un
 * esercizio senza versione non si può consegnare: `idsConVersione`, una
 * query sola per tutti i blocchi). NON esclude ancora i doppioni fra
 * blocchi: quello dipende dal sorteggio, ed è compito di `estraiDaBacini`.
 *
 * Etichette: l'argomento; il nome della raccolta solo se chi assegna la
 * vede (altrimenti "Raccolta non disponibile": nessun oracolo sui nomi
 * delle raccolte private altrui; il bacino, per `bacinoRegola`, è vuoto);
 * "Esercizi scelti" per gli scelti.
 *
 * `nonDisponibili` (solo "scelti", Decisioni punto 3): per ogni scelto che
 * non è fra i candidati, nell'ordine in cui il docente li ha scelti — il
 * titolo vero se chi assegna lo vede (è visibile ma senza versione: può
 * capire quale togliere), "Esercizio non disponibile" se non lo vede (reso
 * privato da un collega, o eliminato): MAI il titolo di un esercizio
 * invisibile. Un doppione fra gli scelti conta una volta sola, come in
 * `bacinoRegola`.
 *
 * Un blocco "scelti" vuoto (la pagina può mandarlo mentre il docente lo sta
 * componendo) non passa da `bacinoRegola`, che lo tratterebbe — giustamente,
 * per una riga salvata — come una regola malformata: dà zero candidati e
 * zero richiesti. Non arriverà mai a una riga: `creaBatteria` rifiuta una
 * regola senza forma. */
export async function baciniDeiBlocchi(
  blocchi: Blocco[],
  chi: Utente,
): Promise<{ etichetta: string; candidati: string[]; richiesti: number; nonDisponibili: string[]; scelti: boolean }[]> {
  const docente = comeDocente(chi);
  const visibili = await ruoliEsercizi(docente);

  const grezzi = await Promise.all(
    blocchi.map((b) =>
      b.tipo === "scelti" && b.esercizioIds.length === 0
        ? Promise.resolve<string[]>([])
        : bacinoRegola(rigaDaBlocco(b), docente, visibili),
    ),
  );
  const conVersione = await idsConVersione([...new Set(grezzi.flat())]);

  // I titoli servono solo per gli scelti visibili che non sono candidati
  // (cioè senza versione): una query sola, e mai per un id che chi assegna
  // non vede — il titolo di un invisibile non deve nemmeno essere letto.
  const daTitolare = new Set<string>();
  for (const b of blocchi) {
    if (b.tipo !== "scelti") continue;
    for (const id of b.esercizioIds) if (visibili.has(id) && !conVersione.has(id)) daTitolare.add(id);
  }
  const titoli = new Map(
    daTitolare.size === 0
      ? []
      : (await prisma.esercizio.findMany({ where: { id: { in: [...daTitolare] } }, select: { id: true, title: true } }))
          .map((r) => [r.id, r.title] as const),
  );

  return Promise.all(
    blocchi.map(async (b, i) => {
      const candidati = grezzi[i]!.filter((id) => conVersione.has(id));
      if (b.tipo === "argomento") {
        return { etichetta: b.argomento, candidati, richiesti: b.quanti, nonDisponibili: [], scelti: false };
      }
      if (b.tipo === "raccolta") {
        const raccolta = (await ruoloContenitore(docente, b.contenitoreId))
          ? await prisma.contenitore.findUnique({ where: { id: b.contenitoreId }, select: { name: true } })
          : null;
        return {
          etichetta: raccolta?.name ?? RACCOLTA_NON_DISPONIBILE,
          candidati,
          richiesti: b.quanti,
          nonDisponibili: [],
          scelti: false,
        };
      }
      const scelti = [...new Set(b.esercizioIds)];
      const presenti = new Set(candidati);
      const nonDisponibili = scelti
        .filter((id) => !presenti.has(id))
        .map((id) => (visibili.has(id) ? titoli.get(id) ?? ESERCIZIO_NON_DISPONIBILE : ESERCIZIO_NON_DISPONIBILE));
      // `candidati` resta nell'ordine scelto dal docente: `bacinoRegola`
      // conserva l'ordine degli scelti, e i filtri qui sopra non lo cambiano.
      return { etichetta: ETICHETTA_SCELTI, candidati, richiesti: scelti.length, nonDisponibili, scelti: true };
    }),
  );
}

/** I candidati che restano a un blocco: tolti quelli `esclusi`, senza
 * doppioni, ORDINATI — così il sorteggio non dipende dall'ordine in cui il
 * database ha restituito il bacino. È la regola che `assegna` ha sempre
 * applicato (prima in `candidatiDisponibili`, batterie.ts, ora tolta: una
 * copia sola), per i blocchi casuali. */
function liberiOrdinati(candidati: readonly string[], esclusi: (id: string) => boolean): string[] {
  return [...new Set(candidati)].filter((id) => !esclusi(id)).sort();
}

/** Il sorteggio vero, con il dettaglio che serve al riepilogo (e al
 * messaggio di rifiuto di `assegna`). Pura: nessuna query, solo il seme.
 *
 * **Gli esercizi scelti a mano vincono sempre** (spec, 281721c). Prima di
 * pescare si raccolgono i candidati di TUTTI i blocchi "scelti" (`riservati`)
 * e si tolgono dai bacini di tutti i blocchi casuali (argomento/raccolta),
 * che vengano prima o dopo. Senza questo, la sufficienza di un blocco
 * scelti dipendeva dal seme: un blocco casuale precedente poteva pescarne
 * un esercizio e lasciarlo corto, con "Assegna" abilitato a un "Estrai di
 * nuovo" sì e all'altro no. Così un blocco scelti è soddisfatto ogni volta
 * che i suoi esercizi sono disponibili, qualunque seme.
 *
 * Per i blocchi casuali l'algoritmo è quello che `assegna` (compiti.ts) ha
 * sempre usato, e che ora usa da qui: `seedrandom(seme)`, blocchi IN
 * ORDINE, candidati tolti i già presi (e i riservati) e ordinati
 * (`liberiOrdinati`), Fisher–Yates seminato con lo stesso `rng` condiviso
 * fra i blocchi, poi i primi `richiesti`. Una batteria senza blocchi
 * scelti estrae esattamente come prima. Stesso seme e stessi bacini ⇒
 * stessa estrazione: è ciò che permette ad "Assegna" di rifare
 * l'estrazione vista in anteprima e confrontarla.
 *
 * I blocchi "scelti" non si mescolano e NON consumano `rng`: prendono i
 * loro esercizi nell'ordine in cui il docente li ha scelti (tolti solo
 * quelli già presi da un blocco scelti precedente: lo stesso esercizio
 * scelto in due blocchi va al primo). L'ordine nel compito resta l'ordine
 * dei blocchi.
 *
 * Un blocco insufficiente rende nulla l'estrazione (`esercizi: null`), ma
 * il ciclo CONTINUA sui blocchi seguenti senza che quello prenda niente: il
 * riepilogo vuole i numeri di tutti i blocchi, non solo fino al primo che
 * manca. Il primo blocco insufficiente ha comunque esattamente i numeri che
 * `assegna` ha sempre riportato (tutti i precedenti hanno pescato).
 *
 * `duplicatiTolti`: quanti esercizi un blocco ha PERSO perché già presi
 * altrove — la somma, blocco per blocco, dei suoi candidati tolti perché
 * (a) già PRESI da un blocco precedente, o (b) per un blocco casuale,
 * scelti a mano in un blocco scelti (che vince, prima o dopo che sia).
 * Non la sovrapposizione fra i bacini: due blocchi casuali con 6 esercizi
 * in comune di cui il primo ne prende 1 tolgono 1, non 6 — "1 esercizio
 * era già in un blocco precedente" (spec, zona 3). Un esercizio tolto a
 * due blocchi conta due volte: è stato tolto due volte. */
export function estraiConDettaglio(
  bacini: Bacino[],
  seme: string,
): { esercizi: string[] | null; disponibili: number[]; duplicatiTolti: number } {
  const rng = seedrandom(seme);
  const riservati = new Set(bacini.filter((b) => b.scelti).flatMap((b) => b.candidati));
  const presi = new Set<string>();
  const esercizi: string[] = [];
  const disponibili: number[] = [];
  let duplicatiTolti = 0;
  let sufficiente = true;

  for (const { candidati, richiesti, scelti } of bacini) {
    const unici = [...new Set(candidati)];
    let liberi: string[];
    if (scelti) {
      // Ordine del docente, nessun sorteggio.
      liberi = unici.filter((id) => !presi.has(id));
    } else {
      liberi = liberiOrdinati(unici, (id) => presi.has(id) || riservati.has(id));
    }
    duplicatiTolti += unici.length - liberi.length;
    disponibili.push(liberi.length);
    if (liberi.length < richiesti) {
      sufficiente = false;
      continue;
    }

    if (!scelti) {
      // Fisher–Yates seminato, identico a quello che `assegna` ha sempre
      // fatto: stabile per lo stesso seme, diverso per un seme nuovo.
      for (let i = liberi.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [liberi[i], liberi[j]] = [liberi[j]!, liberi[i]!];
      }
    }
    for (const id of liberi.slice(0, richiesti)) {
      presi.add(id);
      esercizi.push(id);
    }
  }

  return { esercizi: sufficiente ? esercizi : null, disponibili, duplicatiTolti };
}

/** L'estrazione e basta: gli id degli esercizi estratti, nell'ordine dei
 * blocchi, o `null` se un blocco resta insufficiente dopo l'esclusione dei
 * già presi. Pura (vedi `estraiConDettaglio`). */
export function estraiDaBacini(bacini: Bacino[], seme: string): string[] | null {
  return estraiConDettaglio(bacini, seme).esercizi;
}

/** L'ultima versione di ciascun esercizio, con il titolo dell'esercizio.
 * Un id senza versione semplicemente non compare.
 *
 * Due query, non una: il `distinct` di Prisma NON diventa un `DISTINCT ON`
 * in SQL — carica tutte le righe e scarta i doppioni in memoria. Se la
 * prima query portasse anche `content`, si caricherebbe il contenuto (il
 * JSON intero dell'esercizio) di OGNI versione di ogni esercizio estratto
 * per tenerne una sola. Quindi: prima solo gli id (riga leggera, ordinata
 * per versione decrescente, la prima per esercizio è l'ultima), poi il
 * contenuto e il titolo soltanto delle versioni scelte. */
export async function ultimeVersioni(
  esercizioIds: string[],
): Promise<Map<string, { versioneId: string; titolo: string; content: unknown }>> {
  const ultime = await ultimeVersioniIds(esercizioIds);
  const righe = await versioniConContenuto([...ultime.values()]);
  return new Map([...righe.values()].map((r) => [r.esercizioId, { versioneId: r.versioneId, titolo: r.titolo, content: r.content }]));
}

/** Solo l'id dell'ultima versione di ciascun esercizio (esercizioId →
 * versioneId), senza contenuto: la prima delle due query di
 * `ultimeVersioni`, da sola per chi non ha bisogno del contenuto — il
 * congelamento dei bacini (`riepilogoPerModo`, compiti.ts) mappa così tutti
 * i candidati di tutti i blocchi, che possono essere centinaia. */
export async function ultimeVersioniIds(esercizioIds: string[]): Promise<Map<string, string>> {
  if (esercizioIds.length === 0) return new Map();
  const leggere = await prisma.esercizioVersione.findMany({
    where: { esercizioId: { in: esercizioIds } },
    orderBy: [{ esercizioId: "asc" }, { version: "desc" }],
    distinct: ["esercizioId"],
    select: { id: true, esercizioId: true },
  });
  return new Map(leggere.map((r) => [r.esercizioId, r.id]));
}

/** Titolo e contenuto di versioni GIÀ scelte (versioneId → riga): la
 * seconda query di `ultimeVersioni`, e ciò che serve all'anteprima di
 * un'estrazione fatta sugli id versione (il bacino congelato). Una
 * versione sparita semplicemente non compare. */
export async function versioniConContenuto(
  versionIds: string[],
): Promise<Map<string, { versioneId: string; esercizioId: string; titolo: string; content: unknown }>> {
  if (versionIds.length === 0) return new Map();
  const righe = await prisma.esercizioVersione.findMany({
    where: { id: { in: versionIds } },
    select: { id: true, esercizioId: true, content: true, esercizio: { select: { title: true } } },
  });
  return new Map(
    righe.map((r) => [r.id, { versioneId: r.id, esercizioId: r.esercizioId, titolo: r.esercizio.title, content: r.content }]),
  );
}

/** Il riepilogo della zona 3: risolve i blocchi (come docente), estrae con
 * `seme` e, se tutti i blocchi bastano, carica titolo e contenuto
 * dell'ultima versione degli estratti, nell'ordine dell'estrazione. Nessuna
 * scrittura: è ciò che la pagina chiede a ogni modifica e per "Estrai di
 * nuovo" (con un seme nuovo). */
export async function riepilogoEstrazione(blocchi: Blocco[], chi: Utente, seme: string): Promise<Riepilogo> {
  const bacini = await baciniDeiBlocchi(blocchi, chi);
  const { esercizi: ids, disponibili, duplicatiTolti } = estraiConDettaglio(bacini, seme);

  let esercizi: EsercizioEstratto[] = [];
  if (ids) {
    const versioni = await ultimeVersioni(ids);
    // Ogni candidato ha una versione per costruzione (`idsConVersione`);
    // una versione sparita fra le due query (esercizio eliminato in quel
    // momento) lascia fuori l'esercizio invece di inventarne una.
    esercizi = ids.flatMap((id) => {
      const v = versioni.get(id);
      return v ? [{ esercizioId: id, ...v }] : [];
    });
  }
  const sufficiente = ids !== null && esercizi.length === ids.length;

  return {
    blocchi: bacini.map((b, i) => ({
      etichetta: b.etichetta,
      richiesti: b.richiesti,
      disponibili: disponibili[i]!,
      nonDisponibili: b.nonDisponibili,
    })),
    duplicatiTolti,
    totale: bacini.reduce((s, b) => s + b.richiesti, 0),
    sufficiente,
    esercizi: sufficiente ? esercizi : [],
  };
}
