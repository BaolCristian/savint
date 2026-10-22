import { prisma } from "@/lib/db/client";
import { comeDocente, ruoliEsercizi, ruoloContenitore, type Ruolo, type Utente } from "./accesso";

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
 * punto che TUTTE le letture (`verificaBatteria` qui sotto, `assegna` in
 * compiti.ts) attraversano per risolvere una regola in candidati.
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
 * chi risolve più regole nella stessa richiesta (`assegna`,
 * `verificaBatteria`) la calcola una volta sola e la passa, perché carica
 * tutti gli esercizi. Senza, la calcola qui. */
export async function bacinoRegola(
  regola: {
    contenitoreId: string | null;
    argomento: string | null;
    anno: number | null;
    difficoltaMax: number | null;
    // Facoltativo nel tipo perché i chiamanti che costruiscono una regola a
    // mano (test, `quantiCorrispondono`) non lo passano; le righe lette da
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
 * esercizi ciascuno — la lista da cui il docente sceglie nel modulo di
 * assegnazione diretta (Task 2, docente-via-veloce): un campo a scelta, non
 * libero, così non si può chiedere un argomento che non esiste.
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
 * che ha in `FiltroDiretto` (compiti.ts).
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
 * filtro. Usata da `elencoBatterie` qui sotto e da `assegna` (compiti.ts)
 * nel dettaglio di un rifiuto per capienza insufficiente. */
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
 * Controlla PRIMA (prima di qualunque interrogazione: costa niente) che
 * ogni regola rispetti l'invariante — il contenitore, oppure l'argomento,
 * mai entrambi, mai nessuno dei due (Task 1, docente-via-veloce) — E che il
 * suo `count` sia un intero positivo (Onda di correzioni sui numeri).
 * Quest'ultimo controllo mancava: `creaBatteria` verificava la FORMA di una
 * regola ma non guardava mai il suo conteggio, così `count: 0` o `count:
 * -3` arrivavano intatti fino alla scrittura. Dimostrato dal revisore
 * attraverso `assegnaDiretto` (compiti.ts, che delega qui per la sua unica
 * regola): un `Compito` con `drawnVersionIds: []` veniva comunque creato —
 * mai apribile (`compitoApribile` ritorna `null` su un sorteggio vuoto) — e
 * la batteria automatica dietro di esso restava per sempre, perché la
 * pulizia di `assegnaDiretto` scatta solo quando `assegna` RIFIUTA, e con
 * zero regole da soddisfare non c'è nulla da rifiutare.
 *
 * Il guardiano vive QUI e non in `assegnaDiretto` — o in una singola rotta
 * — perché `creaBatteria` è l'UNICO punto di scrittura di una `Batteria`
 * per ENTRAMBE le provenienze (a mano, automatica) e per qualunque
 * chiamante futuro (un bulk import, uno script) che non passi da nessuna
 * rotta HTTP: una convalida qui protegge tutti loro con un solo controllo,
 * lo stesso principio già scelto per l'invariante contenitore/argomento.
 * Ripeterla in `assegnaDiretto` sarebbe un secondo posto dove sbagliarla —
 * esattamente il rischio contro cui il commento di `assegnaDiretto` mette
 * in guardia.
 *
 * Poi controlla che ogni `contenitoreId` nominato da una regola esista
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
  // Task 2 (docente-via-veloce): `automatica` marca una batteria generata
  // dal sistema per un'assegnazione diretta (vedi `assegnaDiretto` in
  // compiti.ts), non composta a mano dal docente. Quinto parametro
  // opzionale, in coda: ogni chiamata esistente (route comprese) ne passa
  // al più quattro e riceve `false` di default, lo stesso comportamento di
  // sempre. Un solo punto di creazione per ENTRAMBE le provenienze — stessa
  // validazione dell'invariante, stessa transazione — non un secondo percorso
  // di scrittura per il caso automatico.
  automatica = false,
): Promise<
  | { ok: true; id: string }
  | { ok: false; motivo: "contenitore_non_trovato"; dettaglio: { contenitoreId: string } }
  | { ok: false; motivo: "regola_malformata"; dettaglio: { index: number } }
  | { ok: false; motivo: "conteggio_non_valido"; dettaglio: { index: number; count: number } }
> {
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

  const id = await prisma.$transaction(async (tx) => {
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
 * quello usato alla pesca vera.
 *
 * Il verdetto vale per `chi`: due docenti possono avere bacini diversi per
 * la stessa batteria comune, perché ciascuno pesca solo fra ciò che vede
 * (vedi `bacinoRegola`). */
export async function verificaBatteria(
  batteriaId: string,
  chi: Utente,
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
  // Da docente qualunque, come `bacinoRegola`.
  const docente = comeDocente(chi);
  const visibili = await ruoliEsercizi(docente);
  const baciniGrezzi = await Promise.all(batteria.regole.map((r) => bacinoRegola(r, docente, visibili)));
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
