import { prisma } from "@/lib/db/client";

/** Una regola nasce con l'uno o l'altro: `contenitoreId` per pescare da una
 * raccolta a mano, oppure `argomento` (con `anno` e `difficoltaMax`
 * opzionali) per pescare fra gli esercizi i cui metadati corrispondono. MAI
 * entrambi, MAI nessuno dei due — l'invariante di tutto questo file (Task
 * 1, docente-via-veloce). Vedi `formaRegola` più sotto per dove viene
 * imposta in scrittura e riverificata in lettura. */
export interface RegolaInput {
  count: number;
  contenitoreId?: string;
  argomento?: string;
  anno?: number;
  difficoltaMax?: number;
}

/** L'invariante, in un solo posto: "contenitore" se la regola ha SOLO
 * `contenitoreId`, "filtro" se ha SOLO `argomento`, `null` altrimenti — un
 * `null` copre sia "ha entrambi" sia "non ha nessuno dei due": non sono due
 * errori diversi, sono la stessa violazione. Chi chiama decide da sé come
 * reagire a `null`: `creaBatteria` lo trasforma in un rifiuto in
 * scrittura; `bacinoRegola` lo trasforma in un'eccezione in lettura. Né
 * l'uno né l'altro deve MAI indovinare una forma di default o trattarla
 * come "nessun candidato" — vedi il commento sopra `bacinoRegola`. */
function formaRegola(r: { contenitoreId: string | null; argomento: string | null }): "contenitore" | "filtro" | null {
  const haContenitore = r.contenitoreId != null;
  const haArgomento = r.argomento != null;
  if (haContenitore === haArgomento) return null;
  return haContenitore ? "contenitore" : "filtro";
}

/** Gli id, fra quelli passati, che hanno almeno una `EsercizioVersione`: un
 * esercizio senza versione non può mai essere consegnato a uno studente,
 * quindi non conta come "disponibile" — né per `verificaBatteria` né per la
 * pesca vera in `assegna` (compiti.ts). Una query sola per tutti gli
 * esercizi coinvolti, non una per regola. */
export async function idsConVersione(esercizioIds: string[]): Promise<Set<string>> {
  if (esercizioIds.length === 0) return new Set();
  const righe = await prisma.esercizioVersione.findMany({
    where: { esercizioId: { in: esercizioIds } },
    select: { esercizioId: true },
    distinct: ["esercizioId"],
  });
  return new Set(righe.map((r) => r.esercizioId));
}

/** Gli id degli esercizi nel bacino GREZZO di una regola, quale che sia la
 * sua forma — appartenenza a un contenitore, o corrispondenza a un filtro
 * (`argomento` esatto, `anno` esatto se presente, `difficoltaMax` come
 * soglia superiore inclusiva). NON filtra per versione né per "già
 * pescati": quel passo è a valle, in `candidatiDisponibili` più sotto,
 * identico per le due forme — la disponibilità di versione non dipende da
 * come l'esercizio è stato trovato.
 *
 * LANCIA se la regola non rispetta l'invariante (`formaRegola` sopra torna
 * `null`) invece di restituire un array vuoto. È la parte che conta di
 * tutto il task: un bacino vuoto per una regola malformata sarebbe
 * indistinguibile da un bacino vuoto per una regola valida che
 * semplicemente non trova corrispondenze, e verrebbe trattato in silenzio
 * come "zero candidati" da chi chiama — un compito consegnato più corto
 * del promesso e congelato per sempre, la stessa famiglia del difetto
 * critico già pagato quando un esercizio senza versione veniva contato
 * come disponibile (Fix round 1). Una regola malformata non dovrebbe mai
 * esistere — `creaBatteria` la rifiuta in scrittura — ma questa funzione
 * non si fida di quel controllo esterno: lo riverifica, perché è l'unico
 * punto che TUTTE le letture (`verificaBatteria` qui sotto, `assegna` in
 * compiti.ts) attraversano per risolvere una regola in candidati. */
export async function bacinoRegola(regola: {
  contenitoreId: string | null;
  argomento: string | null;
  anno: number | null;
  difficoltaMax: number | null;
}): Promise<string[]> {
  const forma = formaRegola(regola);
  if (forma === null) {
    throw new Error(
      "BatteriaRegola malformata: deve avere contenitoreId oppure argomento, mai entrambi né nessuno dei due " +
        `(contenitoreId=${regola.contenitoreId ?? "null"}, argomento=${regola.argomento ?? "null"})`,
    );
  }

  if (forma === "contenitore") {
    const righe = await prisma.contenitoreEsercizio.findMany({
      where: { contenitoreId: regola.contenitoreId! },
      select: { esercizioId: true },
    });
    return righe.map((r) => r.esercizioId);
  }

  const righe = await prisma.esercizio.findMany({
    where: {
      topic: regola.argomento!,
      ...(regola.anno != null ? { yearLevel: regola.anno } : {}),
      ...(regola.difficoltaMax != null ? { difficulty: { lte: regola.difficoltaMax } } : {}),
    },
    select: { id: true },
  });
  return righe.map((r) => r.id);
}

/** L'etichetta con cui una regola compare nei messaggi rivolti al docente:
 * il nome del contenitore per una regola a raccolta, l'argomento per una a
 * filtro. Usata da `elencoBatterie` qui sotto e da `assegna` (compiti.ts)
 * nel dettaglio di un rifiuto per capienza insufficiente. */
export function etichettaRegola(regola: { contenitore: { name: string } | null; argomento: string | null }): string {
  return regola.contenitore?.name ?? regola.argomento ?? "?";
}

/** Il bacino di candidati di una regola — già risolto da `bacinoRegola`,
 * quale che ne fosse la forma — dopo aver tolto gli esercizi già REALMENTE
 * pescati da regole precedenti della stessa batteria (l'insieme `presi`
 * cresce con le scelte vere del sorteggio, non con una stima) e quelli
 * senza versione risolvibile. Usata da `assegna` in compiti.ts, che
 * mescola quello che risulta con un seme vero e ne prende `count`.
 *
 * NON usata da `verificaBatteria` qui sotto: prima di un'assegnazione non
 * esiste un seme, quindi non c'è un "presi" vero da passare — quella
 * funzione stima invece un limite superiore al consumo possibile (vedi il
 * suo commento). Le due condividono `idsConVersione`, non questa. */
export function candidatiDisponibili(
  esercizioIds: string[],
  presi: ReadonlySet<string>,
  conVersione: ReadonlySet<string>,
): string[] {
  return esercizioIds.filter((id) => conVersione.has(id) && !presi.has(id)).sort();
}

/** Crea una batteria con le sue regole, in una transazione: o vanno dentro
 * tutte, o niente. L'ordine delle regole (per la pesca, più avanti) è
 * l'ordine in cui compaiono nell'array.
 *
 * Controlla PRIMA (prima di qualunque interrogazione: costa niente) che
 * ogni regola rispetti l'invariante — il contenitore, oppure l'argomento,
 * mai entrambi, mai nessuno dei due (Task 1, docente-via-veloce). Poi
 * controlla che ogni `contenitoreId` nominato da una regola esista
 * davvero: senza questo secondo controllo (Fix round finale, item 5) un id
 * inesistente arrivava intatto fino a `batteriaRegola.createMany`, che
 * violava il vincolo di chiave esterna e lasciava scappare l'errore grezzo
 * di Prisma — la rotta lo trasformava in un 500 senza nessun messaggio utile
 * al docente, l'unico punto di questo modulo dove un input scorretto non
 * produceva un rifiuto con un motivo. Stessa forma delle funzioni gemelle
 * (`assegna`, `eliminaBatteria`, `eliminaContenitore`): un `{ ok: false,
 * motivo, dettaglio }`, non un'eccezione. */
export async function creaBatteria(
  createdById: string,
  name: string,
  regole: RegolaInput[],
  description?: string,
): Promise<
  | { ok: true; id: string }
  | { ok: false; motivo: "contenitore_non_trovato"; dettaglio: { contenitoreId: string } }
  | { ok: false; motivo: "regola_malformata"; dettaglio: { index: number } }
> {
  for (let i = 0; i < regole.length; i++) {
    const r = regole[i]!;
    if (formaRegola({ contenitoreId: r.contenitoreId ?? null, argomento: r.argomento ?? null }) === null) {
      return { ok: false, motivo: "regola_malformata", dettaglio: { index: i } };
    }
  }

  const contenitoreIds = [...new Set(regole.map((r) => r.contenitoreId).filter((id): id is string => id != null))];
  if (contenitoreIds.length > 0) {
    const esistenti = await prisma.contenitore.findMany({
      where: { id: { in: contenitoreIds } },
      select: { id: true },
    });
    const trovati = new Set(esistenti.map((c) => c.id));
    const mancante = contenitoreIds.find((id) => !trovati.has(id));
    if (mancante) {
      return { ok: false, motivo: "contenitore_non_trovato", dettaglio: { contenitoreId: mancante } };
    }
  }

  const id = await prisma.$transaction(async (tx) => {
    const b = await tx.batteria.create({ data: { createdById, name, description } });
    if (regole.length > 0) {
      await tx.batteriaRegola.createMany({
        data: regole.map((r, i) => {
          // Rivalidato (già controllato sopra, prima di qualunque
          // scrittura): normalizza i campi dell'altra forma a null invece
          // di persistere ciò che il chiamante ha eventualmente passato per
          // sbaglio insieme a un contenitoreId — una riga non deve mai
          // portare campi di una forma che non è la sua.
          const forma = formaRegola({ contenitoreId: r.contenitoreId ?? null, argomento: r.argomento ?? null });
          return {
            batteriaId: b.id,
            order: i,
            count: r.count,
            contenitoreId: forma === "contenitore" ? r.contenitoreId! : null,
            argomento: forma === "filtro" ? r.argomento! : null,
            anno: forma === "filtro" ? r.anno ?? null : null,
            difficoltaMax: forma === "filtro" ? r.difficoltaMax ?? null : null,
          };
        }),
      });
    }
    return b.id;
  });
  return { ok: true, id };
}

/** Tutte le batterie create a mano (esclude quelle `automatica`, generate
 * dal sistema per un'assegnazione diretta: sono provenienza di un Compito,
 * non contenuto che il docente componga o gestisca da qui — vedi il
 * commento su `Batteria.automatica` nello schema), con le loro regole
 * (l'etichetta della regola + quanti) e il numero di compiti a cui sono
 * già state assegnate. */
export async function elencoBatterie(): Promise<
  { id: string; name: string; regole: { contenitore: string; count: number }[]; compiti: number }[]
> {
  const righe = await prisma.batteria.findMany({
    where: { automatica: false },
    orderBy: { name: "asc" },
    include: {
      regole: { orderBy: { order: "asc" }, include: { contenitore: true } },
      _count: { select: { compiti: true } },
    },
  });
  return righe.map((b) => ({
    id: b.id,
    name: b.name,
    regole: b.regole.map((r) => ({ contenitore: etichettaRegola(r), count: r.count })),
    compiti: b._count.compiti,
  }));
}

/** Confronta, per ogni regola della batteria, quanti esercizi chiede contro
 * quanti il suo contenitore può davvero fornire — tenendo conto sia del
 * filtro di disponibilità di versione (un esercizio senza
 * `EsercizioVersione` non conta mai) sia della sovrapposizione con le
 * regole precedenti, con una stima **per difetto** (Fix round 2), non con
 * un sorteggio simulato.
 *
 * CONTRATTO, e perché è cambiato: qui non esiste ancora un seme (nessuna
 * assegnazione è avvenuta), quindi non si può sapere con certezza QUALI
 * esercizi condivisi una regola precedente "si prenderebbe" — dipende dal
 * sorteggio vero, che è casuale. Un tentativo di simularlo con una scelta
 * qualunque (per id, ad esempio) è un'esecuzione ARBITRARIA, non la
 * PEGGIORE: un'assegnazione vera sfortunata può consumare più
 * sovrapposizione di quanto quella scelta arbitraria preveda, facendo dire
 * qui "ok" a una batteria che poi fallisce — lo stesso difetto per cui
 * questa funzione è stata corretta nel giro precedente, spostato di un
 * livello. Per questo la stima assume il caso PEGGIORE possibile: per ogni
 * regola, quanti dei suoi esercizi potrebbero essere già stati consumati
 * dalle regole precedenti è limitato da due cose — non più di quanti
 * esercizi condivisi esistono davvero (`overlap`), e non più di quanti le
 * regole precedenti possono complessivamente pescare in tutto
 * (`sum(count precedenti)`); il minore dei due è un limite superiore vero
 * al consumo reale, in QUALUNQUE esecuzione, non una stima plausibile.
 *
 * Il contratto che ne segue: un verdetto positivo (`{ ok: true }`)
 * GARANTISCE che `assegna` (compiti.ts) su questa batteria non fallirà per
 * `esercizi_insufficienti`, qualunque seme venga estratto. Un verdetto
 * negativo NON garantisce il contrario: può capitare che un'assegnazione
 * vera avrebbe comunque avuto successo (la stima è per difetto, non
 * esatta) — in tal caso il rimedio più economico è aggiungere un esercizio
 * al contenitore scarso, non ignorare l'avviso. Errare da questo lato
 * costa un minuto al docente; l'errore opposto — dire "ok" e poi fallire —
 * gli costa un'assegnazione persa dopo che gli era stato detto che andava
 * bene.
 *
 * Non guarda i compiti già assegnati: è un controllo "questa batteria è
 * ancora assegnabile?", non uno storico.
 *
 * Task 1 (docente-via-veloce) — il contratto RI-verificato, non ereditato,
 * per le regole a filtro: la dimostrazione sopra (limite superiore =
 * min(overlap, somma dei count precedenti)) non usa in nessun punto COME
 * il bacino di una regola sia stato calcolato — dipende solo dal fatto che
 * sia un INSIEME di id, e dal fatto che `assegna` non possa mai prendere
 * più di `count` id distinti da quell'insieme. Una regola a filtro produce
 * un insieme (via `bacinoRegola`) esattamente come una a contenitore: la
 * prova vale, invariata, anche quando i bacini coinvolti vengono da forme
 * diverse nella stessa batteria. La garanzia regge perché — non solo
 * perché — questa funzione e `assegna` (compiti.ts) risolvono OGNI regola
 * attraverso la STESSA `bacinoRegola`: non c'è un secondo modo di
 * calcolare "quanti esercizi ha questa regola" che possa divergere da
 * quello usato alla pesca vera. */
export async function verificaBatteria(
  batteriaId: string,
): Promise<{ ok: true } | { ok: false; mancanti: { contenitore: string; richiesti: number; disponibili: number }[] }> {
  const batteria = await prisma.batteria.findUniqueOrThrow({
    where: { id: batteriaId },
    include: {
      regole: {
        orderBy: { order: "asc" },
        include: { contenitore: true },
      },
    },
  });

  // Il bacino grezzo di ciascuna regola, quale che sia la sua forma —
  // bacinoRegola lancia se una regola non rispetta l'invariante, invece di
  // restituire un bacino vuoto (vedi il suo commento).
  const baciniGrezzi = await Promise.all(batteria.regole.map((r) => bacinoRegola(r)));
  const tuttiGliId = [...new Set(baciniGrezzi.flat())];
  const conVersione = await idsConVersione(tuttiGliId);

  // Il bacino di ciascuna regola, filtrato sulla disponibilità di versione
  // (non ancora sulla sovrapposizione con le regole precedenti: quella si
  // stima per difetto qui sotto, regola per regola).
  const bacini = baciniGrezzi.map((ids) => new Set(ids.filter((id) => conVersione.has(id))));

  const mancanti: { contenitore: string; richiesti: number; disponibili: number }[] = [];
  const precedentiUnione = new Set<string>();
  let sommaContiPrecedenti = 0;
  for (let i = 0; i < batteria.regole.length; i++) {
    const regola = batteria.regole[i]!;
    const bacino = bacini[i]!;

    const overlap = [...bacino].filter((id) => precedentiUnione.has(id)).length;
    const consumoPeggiore = Math.min(overlap, sommaContiPrecedenti);
    const disponibili = bacino.size - consumoPeggiore;

    if (disponibili < regola.count) {
      mancanti.push({ contenitore: etichettaRegola(regola), richiesti: regola.count, disponibili });
    }

    for (const id of bacino) precedentiUnione.add(id);
    sommaContiPrecedenti += regola.count;
  }

  if (mancanti.length > 0) return { ok: false, mancanti };
  return { ok: true };
}

/** Cancella una batteria libera. Se ha già dei `Compito` assegnati, rifiuta
 * prima di tentare — stessa forma di `eliminaContenitore` in
 * contenitori.ts: il vincolo `onDelete: Restrict` sullo schema resta la
 * rete di sicurezza, questo controllo è ciò che dà un messaggio al docente
 * invece di un errore del database. */
export async function eliminaBatteria(id: string): Promise<{ ok: true } | { ok: false; motivo: "in_uso" }> {
  const usi = await prisma.compito.count({ where: { batteriaId: id } });
  if (usi > 0) return { ok: false, motivo: "in_uso" };
  await prisma.batteria.delete({ where: { id } });
  return { ok: true };
}
