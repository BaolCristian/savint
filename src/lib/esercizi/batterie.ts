import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { comeDocente, ruoliContenitori, ruoliEsercizi, ruoloContenitore, type Ruolo, type Utente } from "./accesso";
import { bloccoDaRegola, type Blocco } from "./estrazione";

/** Una regola nasce con l'uno o l'altro: `contenitoreId` per pescare da una
 * raccolta a mano, oppure `argomento` (con `anno` e `difficoltaMax`
 * opzionali) per pescare fra gli esercizi i cui metadati corrispondono. MAI
 * entrambi, MAI nessuno dei due — l'invariante di tutto questo file (Task
 * 1, docente-via-veloce). Il Nuovo compito (Task 2) aggiunge una terza
 * forma, `esercizioIds` ("scelti a mano"), con la stessa regola: una sola
 * forma per regola. Vedi `formaRegola` più sotto per dove viene imposta in
 * scrittura e riverificata in lettura. */
export interface RegolaInput {
  count: number;
  contenitoreId?: string;
  argomento?: string;
  anno?: number;
  difficoltaMax?: number;
  /** Nuovo compito (Task 2): la terza forma, "scelti a mano" — gli id degli
   * esercizi scelti dal docente, tutti assegnati. Da sola: niente
   * `contenitoreId` né `argomento`, e `count` uguale a quanti sono. */
  esercizioIds?: string[];
}

/** L'invariante, in un solo posto: "contenitore" se la regola ha SOLO
 * `contenitoreId`, "filtro" se ha SOLO `argomento`, "scelti" se ha SOLO
 * `esercizioIds` non vuoto (Nuovo compito, Task 2: la terza forma), `null`
 * altrimenti — un `null` copre sia "ne ha più d'una" sia "non ne ha
 * nessuna": non sono due errori diversi, sono la stessa violazione. Un
 * `esercizioIds` vuoto non è una forma (è il default della colonna per le
 * regole delle altre due): conta come "assente". Chi chiama decide da sé come
 * reagire a `null`: `creaBatteria` lo trasforma in un rifiuto in
 * scrittura; `bacinoRegola` lo trasforma in un'eccezione in lettura. Né
 * l'uno né l'altro deve MAI indovinare una forma di default o trattarla
 * come "nessun candidato" — vedi il commento sopra `bacinoRegola`. */
export function formaRegola(r: {
  contenitoreId: string | null;
  argomento: string | null;
  esercizioIds?: readonly string[];
}): "contenitore" | "filtro" | "scelti" | null {
  const haContenitore = r.contenitoreId != null;
  const haArgomento = r.argomento != null;
  const haScelti = (r.esercizioIds?.length ?? 0) > 0;
  if (Number(haContenitore) + Number(haArgomento) + Number(haScelti) !== 1) return null;
  return haContenitore ? "contenitore" : haArgomento ? "filtro" : "scelti";
}

/** Gli id, fra quelli passati, che hanno almeno una `EsercizioVersione`: un
 * esercizio senza versione non può mai essere consegnato a uno studente,
 * quindi non conta come "disponibile" — né per il riepilogo né per la
 * pesca vera (`baciniDeiBlocchi`, estrazione.ts). Una query sola per tutti gli
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
 * pescati": quel passo è a valle, nel sorteggio (`estraiConDettaglio`,
 * estrazione.ts), identico per tutte le forme — la disponibilità di versione non dipende da
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
 * punto che TUTTE le letture (`baciniDeiBlocchi` in estrazione.ts, quindi
 * riepilogo e assegnazione) attraversano per risolvere una regola in
 * candidati.
 *
 * Proprietà e condivisione (spec "Batterie"): il bacino è sempre ristretto
 * agli esercizi che `chi` — il docente che assegna o che conta — vede. Le
 * batterie restano comuni, ma una regola non diventa mai una strada
 * laterale verso un esercizio privato altrui. Una regola su una raccolta
 * a cui `chi` non ha accesso dà un bacino VUOTO, non un errore: è lo stesso
 * esito, e lo stesso messaggio al docente, di una raccolta che non ha
 * abbastanza esercizi. Non contraddice il discorso sopra sulla regola
 * malformata: lì il vuoto nasconderebbe un dato rotto, qui è la risposta
 * vera ("per te, qui, non c'è niente").
 *
 * `chi` conta sempre come docente qualunque (`comeDocente`): un ADMIN che
 * insegna pesca e conta solo fra ciò che vedrebbe da docente, mai fra le
 * bozze private dei colleghi. Vale per tutte le funzioni di pesca e
 * conteggio di questo modulo e di compiti.ts.
 *
 * `visibili` è la mappa di `ruoliEsercizi(comeDocente(chi))` già calcolata:
 * chi risolve più regole nella stessa richiesta (`baciniDeiBlocchi`) la
 * calcola una volta sola e la passa, perché carica
 * tutti gli esercizi. Senza, la calcola qui. */
export async function bacinoRegola(
  regola: {
    contenitoreId: string | null;
    argomento: string | null;
    anno: number | null;
    difficoltaMax: number | null;
    // Facoltativo nel tipo perché i chiamanti che costruiscono una regola a
    // mano (test, `rigaDaBlocco`) non lo passano; le righe lette da
    // Prisma lo portano sempre (default `[]`).
    esercizioIds?: readonly string[];
  },
  chi: Utente,
  visibili?: ReadonlyMap<string, Ruolo>,
): Promise<string[]> {
  const forma = formaRegola(regola);
  if (forma === null) {
    throw new Error(
      "BatteriaRegola malformata: deve avere una sola forma fra contenitoreId, argomento ed esercizioIds " +
        `(contenitoreId=${regola.contenitoreId ?? "null"}, argomento=${regola.argomento ?? "null"}, ` +
        `esercizioIds=${regola.esercizioIds?.length ?? 0})`,
    );
  }

  const docente = comeDocente(chi);
  const vede = visibili ?? (await ruoliEsercizi(docente));

  // Forma "scelti" (Nuovo compito, Task 2): il bacino sono gli scelti
  // stessi, ristretti a quelli che `chi` vede — un esercizio scelto e poi
  // reso privato dal suo autore (o eliminato) esce dal bacino, e il blocco
  // diventa insufficiente invece di consegnare una bozza altrui. Nessuna
  // query: la mappa dei visibili basta. Nell'ordine in cui il docente li ha
  // scelti, senza doppioni (`creaBatteria` li rifiuta, ma qui non ci si
  // fida, come per la forma).
  if (forma === "scelti") {
    return [...new Set(regola.esercizioIds!)].filter((id) => vede.has(id));
  }

  if (forma === "contenitore") {
    if (!(await ruoloContenitore(docente, regola.contenitoreId!))) return [];
    const righe = await prisma.contenitoreEsercizio.findMany({
      where: { contenitoreId: regola.contenitoreId! },
      select: { esercizioId: true },
    });
    return righe.map((r) => r.esercizioId).filter((id) => vede.has(id));
  }

  const righe = await prisma.esercizio.findMany({
    where: {
      topic: regola.argomento!,
      ...(regola.anno != null ? { yearLevel: regola.anno } : {}),
      ...(regola.difficoltaMax != null ? { difficulty: { lte: regola.difficoltaMax } } : {}),
    },
    select: { id: true },
  });
  return righe.map((r) => r.id).filter((id) => vede.has(id));
}

/** L'elenco degli argomenti che gli esercizi dichiarano davvero, con quanti
 * esercizi ciascuno — la lista da cui il docente sceglie "+ Aggiungi da un
 * argomento" nel Nuovo compito (nata per il modulo di assegnazione diretta,
 * Task 2 docente-via-veloce, tolto nel Task 7 del Nuovo compito): un campo a
 * scelta, non libero, così non si può chiedere un argomento che non esiste.
 * Nel racconto che segue, `quantiCorrispondono` è il conteggio (tolto con
 * quel modulo) che la voce del menu doveva eguagliare; oggi lo stesso
 * vale per i "disponibili" del riepilogo del Nuovo compito.
 *
 * NON fonde grafie diverse («equazioni» ed «Equazioni», o «equazioni » con
 * uno spazio in coda): ognuna resta la sua voce, col proprio conteggio
 * ESATTO. Giro di correzioni 1 (Task 2, docente-via-veloce) — la specifica
 * diceva inizialmente sia "diventa due voci nel menu" sia "si normalizza in
 * lettura per il menu" (contraddittorio, corretto in cae8f1a): fondere
 * significa mostrarne una sola con la somma dei conteggi, ma il filtro che
 * pesca (`bacinoRegola`, via `quantiCorrispondono`) confronta il testo
 * ESATTO — con 99 esercizi «equazioni» e 1 «Equazioni» il menu fuso direbbe
 * «Equazioni — 100» e selezionarla ne troverebbe 1, lo stesso contatore che
 * dovrebbe prevenire la sorpresa a contraddirsi da solo sulla stessa
 * schermata, e 99 esercizi diventati permanentemente inassegnabili da qui.
 * Una lista con voci duplicate è più lunga ma sempre raggiungibile; una
 * fusa è più corta ma mente su quanti esercizi selezionarla raggiunge.
 *
 * Ordina ignorando la cassa (non il testo esatto): le grafie diverse dello
 * stesso argomento finiscono così adiacenti nella lista, visibili a colpo
 * d'occhio come il segnale che quei metadati vanno sistemati — nasconderle
 * nasconderebbe il problema. A parità di cassa, l'ordine è quello del testo
 * originale: deterministico, non "quella arrivata per prima dalla query"
 * (Prisma non garantisce un ordine senza `orderBy`).
 *
 * NON tocca la riga salvata (solo `select`, nessuna scrittura): normalizzare
 * sul serio i dati è un lavoro diverso, deliberatamente fuori da questo task.
 *
 * `anno`, se passato, filtra per `yearLevel` esatto — lo stesso significato
 * che ha in un blocco argomento.
 *
 * **Conta solo ciò che il sorteggio può davvero consegnare (Onda di
 * correzioni sui numeri): stesso filtro di disponibilità di versione di
 * `idsConVersione`, non l'appartenenza grezza al topic.** Dimostrato dal
 * revisore sul database di sviluppo: 16 esercizi col topic «prova», di cui
 * 3 senza `EsercizioVersione` (lo stato ordinario di uno che il docente ha
 * appena creato e non ancora salvato) — il menu diceva «prova — 16», la
 * riga sotto («N esercizi disponibili», da `quantiCorrispondono`) diceva
 * 13, le due cifre in contraddizione sulla stessa schermata. È la stessa
 * famiglia del difetto che questo ramo ha già rifiutato di spedire (Giro
 * di correzioni 1, sopra, sulla fusione delle grafie): una voce di menu
 * non deve mai promettere più esercizi di quanti selezionarla raggiunga.
 * La versione precedente di questo commento derubricava il caso a
 * "sotto-promessa accettabile" insieme alla difficoltà — sbagliando verso:
 * dal lato del docente è il MENU a sovra-promettere, non
 * `quantiCorrispondono` a sotto-consegnare.
 *
 * Resta invece un limite superiore legittimo, non un difetto, rispetto a
 * `difficoltaMax`: quel filtro si applica dopo, quando il docente ha già
 * scelto la voce e sta decidendo quanti esercizi chiederne (lo stesso
 * momento in cui chiama `quantiCorrispondono`) — a questa schermata la
 * difficoltà non è ancora stata scelta, quindi non c'è nulla da contare
 * qui. Per costruzione — stesso `topic` esatto, stesso `anno` esatto,
 * stesso filtro di versione — il conteggio qui e quello di
 * `quantiCorrispondono` per la stessa voce coincidono SEMPRE quando
 * `difficoltaMax` non viene passato: non una stima, la stessa risoluzione
 * (`idsConVersione`, condivisa) applicata alla stessa identica domanda.
 *
 * Per lo stesso motivo conta solo gli esercizi che `chi` vede, come fa
 * `bacinoRegola`: un argomento fatto solo di esercizi privati altrui non
 * compare nemmeno nel menu (spec, anti-obiettivo sui conteggi). */
export async function argomentiDisponibili(
  chi: Utente,
  anno?: number,
): Promise<{ argomento: string; quanti: number }[]> {
  const [tutte, vede] = await Promise.all([
    prisma.esercizio.findMany({
      where: anno != null ? { yearLevel: anno } : {},
      select: { id: true, topic: true },
    }),
    // Da docente qualunque, come `bacinoRegola`.
    ruoliEsercizi(comeDocente(chi)),
  ]);
  const righe = tutte.filter((r) => vede.has(r.id));

  const conVersione = await idsConVersione(righe.map((r) => r.id));

  const conteggi = new Map<string, number>();
  for (const { id, topic } of righe) {
    if (!conVersione.has(id)) continue;
    conteggi.set(topic, (conteggi.get(topic) ?? 0) + 1);
  }

  return [...conteggi.entries()]
    .map(([argomento, quanti]) => ({ argomento, quanti }))
    .sort((a, b) => {
      const ca = a.argomento.toLowerCase();
      const cb = b.argomento.toLowerCase();
      if (ca !== cb) return ca < cb ? -1 : 1;
      // Stessa grafia a meno della cassa: ordine deterministico secondario
      // sul testo esatto, non "quella arrivata per prima dalla query".
      return a.argomento < b.argomento ? -1 : a.argomento > b.argomento ? 1 : 0;
    });
}

/** L'etichetta con cui una regola compare nei messaggi rivolti al docente:
 * il nome del contenitore per una regola a raccolta, l'argomento per una a
 * filtro (e "Esercizi scelti"). Usata dall'elenco dei modelli qui sotto. */
export function etichettaRegola(regola: {
  contenitore: { name: string } | null;
  argomento: string | null;
  esercizioIds?: readonly string[];
}): string {
  if ((regola.esercizioIds?.length ?? 0) > 0) return "Esercizi scelti";
  return regola.contenitore?.name ?? regola.argomento ?? "?";
}

/** Crea una batteria con le sue regole, in una transazione: o vanno dentro
 * tutte, o niente. L'ordine delle regole (per la pesca, più avanti) è
 * l'ordine in cui compaiono nell'array.
 *
 * Prima di scrivere, `rifiutoRegole`: ogni regola rispetta l'invariante
 * (una sola forma fra raccolta, argomento e scelti a mano), il suo `count`
 * è un intero positivo (Onda di correzioni sui numeri: un `count` zero
 * produceva un compito vuoto, mai apribile), e ogni `contenitoreId`
 * nominato esiste (Fix round finale, item 5: altrimenti la chiave esterna
 * lasciava scappare un errore grezzo di Prisma). Un rifiuto è un `{ ok:
 * false, motivo, dettaglio }`, non un'eccezione.
 *
 * Dal Task 7 del Nuovo compito nessuna rotta la chiama più (l'assegnazione
 * scrive con `scriviBatteria` dentro la propria transazione, e la
 * scorciatoia `assegnaDiretto` che la usava è stata tolta): resta il punto
 * di scrittura convalidato per script e prove. */
export async function creaBatteria(
  createdById: string,
  name: string,
  regole: RegolaInput[],
  description?: string,
  // `automatica` marca una batteria generata dal sistema per un compito
  // (la sua copia dei blocchi), non un modello del docente.
  automatica = false,
): Promise<{ ok: true; id: string } | RifiutoRegole> {
  const rifiuto = await rifiutoRegole(createdById, regole);
  if (rifiuto) return rifiuto;
  const id = await prisma.$transaction((tx) => scriviBatteria(tx, createdById, name, regole, description, automatica));
  return { ok: true, id };
}

/** I tre rifiuti possibili di un elenco di regole (vedi `creaBatteria`). */
export type RifiutoRegole =
  | { ok: false; motivo: "contenitore_non_trovato"; dettaglio: { contenitoreId: string } }
  | { ok: false; motivo: "regola_malformata"; dettaglio: { index: number } }
  | { ok: false; motivo: "conteggio_non_valido"; dettaglio: { index: number; count: number } };

/** La convalida di `creaBatteria`, staccata dalla scrittura (Nuovo compito,
 * Task 3) perché `assegnaCompito` (compiti.ts) deve scrivere la copia dei
 * blocchi, l'eventuale modello, il compito e le estrazioni degli studenti
 * in UNA transazione sola: non può chiamare `creaBatteria`, che apre la
 * propria. Deve però convalidare esattamente come lei, quindi la
 * convalida è una sola, qui, e `creaBatteria` la usa per prima. `null` =
 * le regole vanno bene. Nessuna scrittura. */
export async function rifiutoRegole(createdById: string, regole: RegolaInput[]): Promise<RifiutoRegole | null> {
  for (let i = 0; i < regole.length; i++) {
    const r = regole[i]!;
    const forma = formaRegola({ contenitoreId: r.contenitoreId ?? null, argomento: r.argomento ?? null, esercizioIds: r.esercizioIds });
    if (forma === null) {
      return { ok: false, motivo: "regola_malformata", dettaglio: { index: i } };
    }
    // Forma "scelti" (Nuovo compito, Task 2): un doppione è una regola
    // malformata (lo stesso esercizio due volte nello stesso compito non
    // esiste: l'estrazione esclude i già presi), e `count` DEVE essere
    // quanti sono gli scelti — "tutti assegnati" è la definizione del
    // blocco, un count diverso sarebbe una seconda verità sul numero.
    if (forma === "scelti" && new Set(r.esercizioIds).size !== r.esercizioIds!.length) {
      return { ok: false, motivo: "regola_malformata", dettaglio: { index: i } };
    }
    if (!Number.isInteger(r.count) || r.count <= 0 || (forma === "scelti" && r.count !== r.esercizioIds!.length)) {
      return { ok: false, motivo: "conteggio_non_valido", dettaglio: { index: i, count: r.count } };
    }
  }

  // Una raccolta che chi crea non vede è "non trovata", come una che non
  // esiste: nessun oracolo sull'esistenza delle raccolte private altrui, e
  // nessuna batteria che le leghi a sé (le renderebbe `in_uso`). Chi crea
  // conta come docente qualunque (`comeDocente`, come per la pesca): anche
  // un ADMIN compone batterie solo sulle raccolte che vedrebbe da docente,
  // perché sono quelle da cui poi pescherà.
  const contenitoreIds = [...new Set(regole.map((r) => r.contenitoreId).filter((id): id is string => id != null))];
  if (contenitoreIds.length > 0) {
    const docente = comeDocente(createdById);
    for (const contenitoreId of contenitoreIds) {
      if (!(await ruoloContenitore(docente, contenitoreId))) {
        return { ok: false, motivo: "contenitore_non_trovato", dettaglio: { contenitoreId } };
      }
    }
  }

  return null;
}

/** La scrittura di `creaBatteria`, dentro una transazione data da chi
 * chiama (vedi `rifiutoRegole` per il perché è separata). NON convalida: si
 * chiama solo dopo che `rifiutoRegole` ha restituito `null` per le stesse
 * regole. Restituisce l'id della batteria. */
export async function scriviBatteria(
  tx: Prisma.TransactionClient,
  createdById: string,
  name: string,
  regole: RegolaInput[],
  description: string | undefined,
  automatica: boolean,
): Promise<string> {
  const b = await tx.batteria.create({ data: { createdById, name, description, automatica } });
  if (regole.length > 0) {
    await tx.batteriaRegola.createMany({
      data: regole.map((r, i) => {
        // Rivalidato (già controllato sopra, prima di qualunque
        // scrittura): normalizza i campi dell'altra forma a null invece
        // di persistere ciò che il chiamante ha eventualmente passato per
        // sbaglio insieme a un contenitoreId — una riga non deve mai
        // portare campi di una forma che non è la sua.
        const forma = formaRegola({ contenitoreId: r.contenitoreId ?? null, argomento: r.argomento ?? null, esercizioIds: r.esercizioIds });
        return {
          batteriaId: b.id,
          order: i,
          count: r.count,
          contenitoreId: forma === "contenitore" ? r.contenitoreId! : null,
          argomento: forma === "filtro" ? r.argomento! : null,
          anno: forma === "filtro" ? r.anno ?? null : null,
          difficoltaMax: forma === "filtro" ? r.difficoltaMax ?? null : null,
          esercizioIds: forma === "scelti" ? r.esercizioIds! : [],
        };
      }),
    });
  }
  return b.id;
}

/** L'etichetta con cui una raccolta che chi guarda NON vede compare
 * nell'elenco dei modelli: mai il nome vero (stessa regola, e stessa
 * scritta, del riepilogo del Nuovo compito in estrazione.ts). */
const RACCOLTA_NON_DISPONIBILE = "Raccolta non disponibile";

/** Un modello nell'elenco (pagina Modelli). */
export type ModelloInElenco = {
  id: string;
  nome: string;
  autoreNome: string | null;
  /** Creato da chi guarda: decide il filtro "Miei" e, con ADMIN, "Elimina". */
  mio: boolean;
  blocchi: { etichetta: string; quanti: number }[];
  /** Quante volte è stato usato: vedi `elencoModelli`. */
  usato: number;
};

/** I modelli (Nuovo compito, Task 5): tutte le batterie NON automatiche
 * del database — comuni a tutta la scuola, come lo erano i "compiti
 * preparati" (Decisioni, punto 1: un'istanza è una scuola) — con l'autore,
 * i blocchi in breve e quante volte sono stati usati.
 *
 * `usato` conta i compiti DISTINTI che vengono dal modello per una delle due
 * strade: `modelloId` (i compiti del Nuovo compito, che portano con sé una
 * copia automatica dei blocchi) oppure `batteriaId` (i compiti assegnati da
 * un vecchio "compito preparato", che puntano a lui direttamente). Un
 * compito che le avesse entrambe conta una volta sola.
 *
 * Etichette dei blocchi come nel riepilogo del Nuovo compito: l'argomento,
 * "Esercizi scelti", il nome della raccolta solo se `chi` la vede — da
 * docente qualunque (`comeDocente`), cioè fra le raccolte da cui poi
 * pescherebbe usando il modello. Un modello è comune, una raccolta privata
 * no: il suo nome non deve uscire da qui. */
export async function elencoModelli(chi: Utente): Promise<ModelloInElenco[]> {
  const [righe, raccolteVisibili] = await Promise.all([
    prisma.batteria.findMany({
      where: { automatica: false },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        createdById: true,
        createdBy: { select: { name: true } },
        regole: {
          orderBy: { order: "asc" },
          select: { contenitoreId: true, argomento: true, count: true, esercizioIds: true, contenitore: { select: { name: true } } },
        },
      },
    }),
    ruoliContenitori(comeDocente(chi)),
  ]);
  if (righe.length === 0) return [];

  // Una query sola per gli usi di tutti i modelli, sulle due strade; il
  // Set per modello toglie il doppio conteggio.
  const ids = righe.map((b) => b.id);
  const compiti = await prisma.compito.findMany({
    where: { OR: [{ modelloId: { in: ids } }, { batteriaId: { in: ids } }] },
    select: { id: true, modelloId: true, batteriaId: true },
  });
  const usi = new Map<string, Set<string>>();
  const conta = (modelloId: string | null, compitoId: string) => {
    if (modelloId == null) return;
    const insieme = usi.get(modelloId) ?? new Set<string>();
    insieme.add(compitoId);
    usi.set(modelloId, insieme);
  };
  for (const c of compiti) {
    conta(c.modelloId, c.id);
    conta(c.batteriaId, c.id);
  }

  return righe.map((b) => ({
    id: b.id,
    nome: b.name,
    autoreNome: b.createdBy.name,
    mio: b.createdById === chi.id,
    blocchi: b.regole.map((r) => ({
      etichetta:
        r.contenitoreId != null && !raccolteVisibili.has(r.contenitoreId) ? RACCOLTA_NON_DISPONIBILE : etichettaRegola(r),
      quanti: r.count,
    })),
    usato: usi.get(b.id)?.size ?? 0,
  }));
}

/** Un modello coi suoi blocchi, per "Usa questo modello" (la pagina Nuovo
 * compito con `?modello={id}`). `null` se non esiste o se è una batteria
 * automatica (la copia propria di un compito, o un vecchio compito
 * preparato "eliminato", cioè nascosto: non sono modelli). I blocchi passano
 * da `bloccoDaRegola`, nell'ordine delle regole: una regola a filtro nata
 * senza anno dà un blocco argomento SENZA `anno` — lo riempie la pagina con
 * l'anno della classe scelta, qui non lo si inventa. Nessun controllo su
 * chi chiede: i modelli sono comuni, e la pesca resta comunque ristretta a
 * ciò che chi assegna vede (`bacinoRegola`). */
export async function caricaModello(id: string): Promise<{ id: string; nome: string; blocchi: Blocco[] } | null> {
  const b = await prisma.batteria.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      automatica: true,
      regole: {
        orderBy: { order: "asc" },
        select: { contenitoreId: true, argomento: true, anno: true, difficoltaMax: true, count: true, esercizioIds: true },
      },
    },
  });
  if (!b || b.automatica) return null;
  return { id: b.id, nome: b.name, blocchi: b.regole.map(bloccoDaRegola) };
}

/** Elimina un modello (Decisioni, punti 1 e 2). Solo chi l'ha creato o un
 * ADMIN: per chiunque altro è `non_trovato`, come un id che non esiste o una
 * batteria automatica (nessun oracolo, e la rotta risponde 404).
 *
 * Eliminare è sempre possibile e non tocca MAI un compito:
 * - se dei compiti puntano al modello con `batteriaId` (vecchi compiti
 *   assegnati da un "compito preparato": i loro blocchi SONO quelli del
 *   modello, e il vincolo `Restrict` ne impedisce comunque la
 *   cancellazione), il modello si NASCONDE diventando automatico — sparisce
 *   dall'elenco e da `caricaModello`, ma regole e compiti restano;
 * - altrimenti si cancella davvero (le regole vanno con lui, in cascata) e
 *   i compiti nati dal modello perdono solo il riferimento (`modelloId`
 *   torna null per `onDelete: SetNull`): i loro blocchi sono nella loro
 *   copia automatica. */
export async function eliminaModello(
  id: string,
  chi: Utente,
): Promise<{ ok: true } | { ok: false; motivo: "non_trovato" }> {
  const b = await prisma.batteria.findUnique({ where: { id }, select: { createdById: true, automatica: true } });
  if (!b || b.automatica || (!chi.admin && b.createdById !== chi.id)) return { ok: false, motivo: "non_trovato" };

  // Fra il conteggio e la scrittura passa un istante (Nuovo compito, Task
  // 7). Se intanto un compito ha cominciato a puntare al modello con
  // `batteriaId`, il vincolo Restrict rifiuta la cancellazione (P2003): si
  // ripiega sul nascondere, come se il conteggio l'avesse visto. Se intanto
  // qualcuno l'ha già eliminato (P2025, su una scrittura o sull'altra), è
  // `non_trovato` come un id che non esiste — non un errore 500.
  const nascondi = () => prisma.batteria.update({ where: { id }, data: { automatica: true } });
  try {
    const legacy = await prisma.compito.count({ where: { batteriaId: id } });
    if (legacy > 0) {
      await nascondi();
    } else {
      try {
        await prisma.batteria.delete({ where: { id } });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003")) throw e;
        await nascondi();
      }
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return { ok: false, motivo: "non_trovato" };
    throw e;
  }
  return { ok: true };
}
