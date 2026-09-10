import { randomUUID } from "crypto";
import seedrandom from "seedrandom";
import { prisma } from "@/lib/db/client";
import { candidatiDisponibili, idsConVersione, bacinoRegola, etichettaRegola, creaBatteria } from "./batterie";

type MotivoAssegna =
  | "batteria_non_trovata"
  | "classe_non_trovata"
  | "non_insegni_questa_classe"
  | "esercizi_insufficienti"
  | "scadenza_prima_apertura"
  | "scadenza_nel_passato"
  // Prodotto SOLO da `assegnaDiretto` (Onda di correzioni sui numeri), mai
  // da `assegna`: la traduzione, nella forma di `EsitoAssegna`, del rifiuto
  // `conteggio_non_valido` che `creaBatteria` restituisce quando `quanti`
  // non è un intero positivo — vedi il commento su `assegnaDiretto` più
  // sotto per il perché la convalida vive in `creaBatteria` e non qui.
  | "quantita_non_valida";

/** L'esito di un'assegnazione. Esportato (Task 2, docente-via-veloce) perché
 * da questo task in poi ha DUE produttori — `assegna` (per raccolta) e
 * `assegnaDiretto` (per filtro) — e il secondo deve dichiarare di restituire
 * esattamente lo stesso tipo del primo, a cui delega per intero: un tipo
 * proprio, anche se strutturalmente identico, potrebbe divergere in silenzio
 * a una futura modifica di uno solo dei due. */
export type EsitoAssegna =
  | { ok: true; compitoId: string }
  | { ok: false; motivo: MotivoAssegna; dettaglio?: unknown };

/** Assegna una batteria a una classe: pesca UNA volta, con un seme nuovo, e
 * fissa il risultato nel Compito. Da quel momento in poi nessuna modifica al
 * contenitore, alle versioni degli esercizi o una nuova assegnazione della
 * stessa batteria può cambiare cosa quella classe ha ricevuto: il seme e le
 * versioni pescate sono già scritte nella riga.
 *
 * Le regole vengono eseguite nel loro `order`: un esercizio pescato da una
 * regola non può essere ripescato da una regola successiva della stessa
 * batteria (due contenitori possono condividere un esercizio, Task 3).
 * Questo significa che l'ORDINE delle regole decide chi ha la precedenza su
 * un esercizio condiviso — la prima regola che lo trova nel suo contenitore
 * se lo prende, e alla regola successiva non resta più disponibile, anche
 * se questo la fa fallire per insufficienza. Un esercizio senza nessuna
 * `EsercizioVersione` non conta mai come disponibile, per nessuna regola:
 * non potrebbe comunque essere consegnato (vedi `candidatiDisponibili` e
 * `idsConVersione` in batterie.ts — quest'ultima condivisa anche da
 * `verificaBatteria`, che stima la stessa cosa senza un sorteggio vero).
 *
 * Tutti i controlli (batteria, classe, insegnamento, capienza dei
 * contenitori) avvengono PRIMA di qualunque scrittura: un fallimento non
 * lascia nessun Compito a metà.
 *
 * **Una classe archiviata non riceve assegnazioni (Fix round 2, Task 3
 * docente-via-veloce).** `archivedAt` non cancella la riga `ClasseDocente`
 * — un docente che insegnava una classe poi archiviata la vede ancora
 * come "sua" per quella tabella — quindi senza questo controllo
 * un'assegnazione qui passava comunque. `classiDelDocente` (classi.ts),
 * che `compiti/diretto/route.ts` usa per il proprio pre-controllo, esclude
 * già `archivedAt` non nullo dal suo elenco: la stessa classe archiviata
 * rispondeva già `non_insegni_questa_classe` da quella rotta. Senza
 * questo controllo QUI, `/api/esercizi/compiti` (che non ha un
 * pre-controllo proprio, delega interamente a questa funzione) rispondeva
 * diversamente alla stessa identica domanda — anzi, non rifiutava affatto.
 * Stesso motivo di "non la insegna" (`non_insegni_questa_classe`), non un
 * terzo nuovo: dal punto di vista di chi assegna, una classe archiviata e
 * una mai insegnata meritano la stessa risposta — nessuna delle due è una
 * classe a cui questo docente possa assegnare lavoro adesso. */
export async function assegna(
  batteriaId: string,
  classeId: string,
  assignedById: string,
  opzioni?: { opensAt?: Date; dueAt?: Date },
): Promise<EsitoAssegna> {
  // Controllo di forma sulle date, prima di qualunque interrogazione: non
  // richiede il database, quindi è il più economico da fare per primo. Una
  // scadenza prima dell'apertura non ha senso (la finestra sarebbe già
  // chiusa quando si apre), e una scadenza già nel passato produce un
  // compito "scaduto all'arrivo" — probabilmente un anno digitato male —
  // senza che nessuno, dominio, rotta o form, se ne accorga.
  if (opzioni?.opensAt && opzioni?.dueAt && opzioni.dueAt < opzioni.opensAt) {
    return { ok: false, motivo: "scadenza_prima_apertura" };
  }
  if (opzioni?.dueAt && opzioni.dueAt < new Date()) {
    return { ok: false, motivo: "scadenza_nel_passato" };
  }

  const batteria = await prisma.batteria.findUnique({
    where: { id: batteriaId },
    include: {
      regole: {
        orderBy: { order: "asc" },
        include: { contenitore: true },
      },
    },
  });
  if (!batteria) return { ok: false, motivo: "batteria_non_trovata" };

  const classe = await prisma.classe.findUnique({ where: { id: classeId } });
  if (!classe) return { ok: false, motivo: "classe_non_trovata" };
  // Vedi il commento sopra la funzione: stesso motivo di "non la insegna",
  // controllata prima della query su ClasseDocente perché una classe
  // archiviata la rifiuta comunque, quale che sia quella riga.
  if (classe.archivedAt != null) return { ok: false, motivo: "non_insegni_questa_classe" };

  const insegna = await prisma.classeDocente.findUnique({
    where: { classeId_teacherId: { classeId, teacherId: assignedById } },
  });
  if (!insegna) return { ok: false, motivo: "non_insegni_questa_classe" };

  // Il bacino grezzo di ciascuna regola, quale che sia la sua forma (Task 1:
  // contenitore o filtro) — bacinoRegola lancia se una regola non rispetta
  // l'invariante, invece di restituire un bacino vuoto (vedi batterie.ts):
  // la stessa risoluzione che usa `verificaBatteria`, non una seconda.
  const bacini = await Promise.all(batteria.regole.map((r) => bacinoRegola(r)));
  const tuttiGliId = [...new Set(bacini.flat())];
  const conVersione = await idsConVersione(tuttiGliId);

  const drawSeed = randomUUID();
  const rng = seedrandom(drawSeed);
  const drawnVersionIds: string[] = [];
  // Un esercizio già pescato da una regola non può essere ripescato da
  // un'altra regola della stessa batteria: due contenitori possono
  // condividere un esercizio (Task 3), e senza questa esclusione un compito
  // "5 da Equazioni, 3 da Sistemi" potrebbe consegnare meno di 8 esercizi
  // distinti se il sorteggio pesca lo stesso esercizio da entrambi i lati.
  const giaPescati = new Set<string>();

  for (let i = 0; i < batteria.regole.length; i++) {
    const regola = batteria.regole[i]!;
    const candidati = candidatiDisponibili(bacini[i]!, giaPescati, conVersione);
    if (candidati.length < regola.count) {
      return {
        ok: false,
        motivo: "esercizi_insufficienti",
        dettaglio: {
          contenitore: etichettaRegola(regola),
          richiesti: regola.count,
          disponibili: candidati.length,
        },
      };
    }

    // Fisher-Yates seminato: stabile per lo stesso seme, diverso ad ogni
    // nuova assegnazione perché il seme è nuovo ogni volta.
    const mescolati = [...candidati];
    for (let i = mescolati.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [mescolati[i], mescolati[j]] = [mescolati[j]!, mescolati[i]!];
    }

    for (const esercizioId of mescolati.slice(0, regola.count)) {
      giaPescati.add(esercizioId);
      const versione = await prisma.esercizioVersione.findFirst({
        where: { esercizioId },
        orderBy: { version: "desc" },
      });
      if (versione) drawnVersionIds.push(versione.id);
    }
  }

  const compito = await prisma.compito.create({
    data: {
      batteriaId,
      classeId,
      assignedById,
      drawSeed,
      drawnVersionIds,
      opensAt: opzioni?.opensAt,
      dueAt: opzioni?.dueAt,
    },
  });

  return { ok: true, compitoId: compito.id };
}

/** I filtri di una regola a "argomento" (Task 1: la seconda forma di
 * `BatteriaRegola`, alternativa al contenitore) così come li raccoglie il
 * modulo di assegnazione diretta. `anno` non è mai facoltativo qui: la
 * specifica lo dice esplicitamente ("l'anno non si chiede") — viene sempre
 * dalla classe scelta dal docente, mai da un campo che lui compila. */
export type FiltroDiretto = { anno: number; argomento: string; difficoltaMax?: number };

/** Quanti esercizi risponderebbero a questo filtro **se si assegnasse ora**
 * — il numero che il docente legge mentre sceglie, prima di impegnarsi
 * ("quanti esercizi corrispondono", nella specifica). Deve contare
 * esattamente ciò che la pesca vera potrebbe consegnare, non l'appartenenza
 * grezza al filtro: passa dalla STESSA risoluzione di `bacinoRegola` —
 * l'unico punto che tutte le letture attraversano (Task 1) — e dallo STESSO
 * filtro di disponibilità di versione di `idsConVersione`, non da una nuova
 * query che potrebbe divergere in silenzio da quella che la pesca userà.
 *
 * Nessuna esclusione per "già pescati" da applicare qui, a differenza di
 * `candidatiDisponibili`: una batteria automatica (`assegnaDiretto` più
 * sotto) ha sempre e solo UNA regola, quindi non esiste una regola
 * precedente della stessa batteria con cui accavallarsi — lo stesso motivo
 * per cui `verificaBatteria` (batterie.ts) non ha bisogno di un `presi`
 * prima che un'assegnazione sia mai avvenuta.
 *
 * "Un conteggio che promette più di quanto la pesca consegni sarebbe peggio
 * di nessun conteggio" (dal brief): qui non può succedere per costruzione —
 * non è una stima, è la stessa identica risoluzione che `assegna` userebbe
 * per questa regola. */
export async function quantiCorrispondono(f: FiltroDiretto): Promise<number> {
  const bacino = await bacinoRegola({
    contenitoreId: null,
    argomento: f.argomento,
    anno: f.anno,
    difficoltaMax: f.difficoltaMax ?? null,
  });
  const conVersione = await idsConVersione(bacino);
  return conVersione.size;
}

/** L'assegnazione diretta (Task 2, docente-via-veloce): classe, argomento,
 * quanti, entro quando — senza che il docente componga prima una raccolta.
 *
 * **Non è una seconda strada di pesca.** Crea una `Batteria` marcata
 * `automatica` con UNA sola regola a filtro (la forma che Task 1 ha aggiunto
 * a `BatteriaRegola`), e delega interamente ad `assegna`: stessa pesca,
 * stesso controllo di capienza, stesso congelamento in `drawnVersionIds`,
 * stessa esclusione fra regole (qui vuota, non essendocene una seconda),
 * stesso rifiuto col dettaglio — `{ contenitore, richiesti, disponibili }`,
 * dove `contenitore` porta l'argomento e non un nome di raccolta, perché
 * `etichettaRegola` risolve così una regola a filtro. Un secondo percorso di
 * pesca sarebbe un secondo posto dove sbagliare esattamente ciò che
 * `assegna` ha già pagato per correggere due volte (vedi i suoi commenti).
 *
 * La batteria creata qui non compare mai in `elencoBatterie` (che esclude
 * `automatica: true`, Task 1): è provenienza di questo compito, non
 * contenuto che il docente componga o gestisca.
 *
 * `creaBatteria` può rifiutare in tre modi. Due sono impossibili per
 * costruzione — `regola_malformata` (la regola che costruiamo ha sempre e
 * solo `argomento`, mai `contenitoreId`) e `contenitore_non_trovato` (non ne
 * nominiamo mai uno) — un rifiuto lì sarebbe un bug di QUESTA funzione, non
 * un input scorretto del chiamante: si lancia, invece di forzare un
 * `MotivoAssegna` che non esiste per quel caso in `EsitoAssegna`.
 *
 * **Il terzo — `conteggio_non_valido` — è invece raggiungibile (Onda di
 * correzioni sui numeri).** `quanti` viene dal chiamante (un docente, una
 * rotta, uno script) senza che questa funzione lo convalidi prima —
 * `creaBatteria` è dove quel controllo vive (vedi il suo commento: un solo
 * punto di scrittura, una sola convalida, per ogni provenienza, non
 * ripetuta qui). Un `quanti` zero, negativo o non intero non è un bug di
 * `assegnaDiretto`: è esattamente il genere di input scorretto che questa
 * funzione esiste per rifiutare con un motivo, non con un'eccezione — si
 * traduce quindi in `{ ok: false, motivo: "quantita_non_valida", dettaglio:
 * { quanti } }`. Nessuna pulizia da fare in questo ramo: `creaBatteria`
 * rifiuta il conteggio PRIMA di scrivere qualunque riga (stesso ordine
 * della verifica di forma), quindi qui non esiste ancora nessuna batteria
 * — a differenza del ramo `!esito.ok` più sotto, dove la riga è già stata
 * scritta.
 *
 * Prima di questa convalida, `assegnaDiretto` produceva il difetto
 * dimostrato dal revisore: `quanti: 0` (o negativo) superava
 * `creaBatteria` indenne — che verificava la FORMA della regola ma non il
 * suo conteggio — e arrivava fino ad `assegna`, il cui ciclo sulle regole
 * (`batteria.regole`) non ha nulla da rifiutare quando `count` è zero o
 * negativo (`candidati.length < regola.count` è vera per definizione con
 * zero candidati richiesti, e la pesca di `mescolati.slice(0, regola.count)`
 * su un conteggio negativo non pesca semplicemente nulla): un `Compito` con
 * `drawnVersionIds: []` veniva scritto per davvero, mai apribile da nessuno
 * studente, e — poiché non era un rifiuto di `assegna` — la pulizia più
 * sotto non scattava mai: l'unico caso, fra tutti quelli che questo file
 * ripulisce, in cui il tentativo è un SUCCESSO apparente, non un rifiuto né
 * un'eccezione.
 *
 * **Un rifiuto di `assegna` non lascia una batteria orfana (Fix round 1).**
 * La `Batteria` automatica viene scritta PRIMA che `assegna` validi
 * qualunque cosa (date, classe, insegnamento, capienza) — se `assegna`
 * rifiuta, quella riga non è mai servita a nulla e va cancellata, non
 * dimenticata: `elencoBatterie` la nasconde comunque (esclude
 * `automatica: true`), quindi senza questa pulizia resterebbe per sempre
 * un residuo invisibile, uno per ogni tentativo di assegnazione diretta
 * mal dimensionato o su una classe/scadenza sbagliata.
 *
 * Niente pre-controllo prima di cancellare: il contratto di `assegna`
 * ("un fallimento non lascia nessun Compito a metà", vedi il suo commento)
 * garantisce che, nel ramo `!esito.ok`, nessun `Compito` referenzia ancora
 * questa batteria — cancellarla non può quindi incontrare mai il vincolo
 * `onDelete: Restrict` di `Compito.batteria`. Se lo incontrasse (un bug
 * futuro in `assegna` che rifiuta DOPO aver scritto), l'errore di Prisma
 * esplode qui, rumorosamente, invece di essere pre-intercettato con un
 * controllo scritto a mano (come farebbe `eliminaBatteria`, che conta i
 * `Compito` prima di cancellare): "cancella solo ciò che non ha prodotto
 * nulla" resta vera per costruzione — il vincolo del database — non per
 * quanto ci si ricorda di controllare qui. `BatteriaRegola` cascata con la
 * sua `Batteria` (`onDelete: Cascade`), quindi non serve una cancellazione
 * separata per la regola.
 *
 * Nessuna validazione duplicata qui per anticipare il rifiuto: sarebbe un
 * secondo posto dove `assegna` potrebbe essere sbagliata — esattamente il
 * rischio che l'intero task è nato per evitare (vedi sopra). Si lascia
 * rifiutare, poi si pulisce.
 *
 * **La pulizia copre anche il caso in cui `assegna` LANCI, non solo quello
 * in cui rifiuti (Fix round 2).** Un rifiuto (`!esito.ok`) e un'eccezione
 * sono la stessa situazione vista da due porte diverse — in entrambe la
 * batteria appena creata non è mai servita a nulla — ma senza un
 * `try/catch` solo la prima veniva ripulita: un'eccezione (un guasto del
 * database a metà chiamata, o una futura modifica di `assegna` che lancia
 * dove oggi rifiuta) avrebbe lasciato lo stesso residuo invisibile che
 * questo giro di correzioni esiste per togliere, dalla porta rimasta
 * aperta. Nessun percorso noto lo raggiunge oggi (la regola che
 * costruiamo qui è valida per costruzione, vedi sopra), ma è esattamente
 * il tipo di regressione che nessuno nota — la garanzia smette di valere
 * in silenzio e nessun test lo dice — quindi vale la pena difendersi ora.
 *
 * Il fallimento della pulizia stessa (qui: solo se `assegna` lancia PRIMA
 * di aver mai scritto nulla che referenzi la batteria — l'unico caso in
 * cui questo ramo viene raggiunto — la cancellazione non dovrebbe mai
 * incontrare `onDelete: Restrict`, ma un guasto del database potrebbe
 * comunque colpire anche lei) viene inghiottito, non propagato: l'errore
 * ORIGINALE è l'unica cosa vera che il chiamante deve vedere — un
 * fallimento della pulizia non deve mai sostituirlo. */
export async function assegnaDiretto(input: {
  classeId: string;
  teacherId: string;
  filtro: FiltroDiretto;
  quanti: number;
  opensAt?: Date;
  dueAt?: Date;
}): Promise<EsitoAssegna> {
  const creazione = await creaBatteria(
    input.teacherId,
    `Assegnazione diretta: ${input.filtro.argomento}`,
    [{
      count: input.quanti,
      argomento: input.filtro.argomento,
      anno: input.filtro.anno,
      difficoltaMax: input.filtro.difficoltaMax,
    }],
    undefined,
    true,
  );
  if (!creazione.ok) {
    if (creazione.motivo === "conteggio_non_valido") {
      return { ok: false, motivo: "quantita_non_valida", dettaglio: { quanti: input.quanti } };
    }
    throw new Error(
      `creaBatteria (automatica) rifiutata inaspettatamente in assegnaDiretto: ${creazione.motivo}`,
    );
  }

  let esito: EsitoAssegna;
  try {
    esito = await assegna(creazione.id, input.classeId, input.teacherId, {
      opensAt: input.opensAt,
      dueAt: input.dueAt,
    });
  } catch (erroreOriginale) {
    try {
      await prisma.batteria.delete({ where: { id: creazione.id } });
    } catch {
      // Inghiottito: un fallimento della pulizia non deve mai sostituire
      // l'errore vero nella console di chi chiama.
    }
    throw erroreOriginale;
  }

  if (!esito.ok) {
    await prisma.batteria.delete({ where: { id: creazione.id } });
  }

  return esito;
}

/** Controlla che un `compitoId` arrivato dalla query string (il link nella
 * home dello studente è letteralmente `?compitoId=...`, niente da
 * indovinare) sia davvero legittimo per QUESTO studente e QUESTO esercizio,
 * PRIMA che venga scritto su un `Tentativo` — l'unico punto che lo scrive è
 * `avviaORiprendi` (tentativo.ts), che chiama questa funzione e non fida mai
 * del valore ricevuto.
 *
 * Quattro condizioni, tutte necessarie: il compito esiste; è già aperto
 * (`opensAt` assente o passato); lo studente è iscritto ORA alla sua classe;
 * l'esercizio che sta aprendo è fra quelli che l'assegnazione ha davvero
 * pescato (`drawnVersionIds`), non uno qualunque. Senza l'ultimo controllo
 * uno studente potrebbe abbinare un `compitoId` vero a un esercizio mai
 * assegnato da quel compito e farlo contare come consegna sua — la stessa
 * famiglia di scorciatoia che le funzioni sotto (Fix round finale) chiudono
 * dal lato della lettura.
 *
 * Stessa forma delle funzioni gemelle di questo file (`assegna`): tutti i
 * controlli avvengono qui, in un solo posto, prima di qualunque scrittura —
 * non sparsi fra chiamante e dominio.
 *
 * **Restituisce l'id della `EsercizioVersione` pescata da questo compito
 * per questo esercizio, non solo `true`/`false` (Onda di correzioni
 * finale, C2)**: prima di questa correzione la firma diceva solo SE un
 * `compitoId` fosse valido, mai QUALE versione l'assegnazione avesse
 * davvero pescato — il chiamante (`avviaORiprendi`) non aveva altra scelta
 * che aprire sempre l'ULTIMA versione dell'esercizio (`orderBy: {version:
 * "desc"}`), la stessa per un esercizio libero e per uno assegnato. Finché
 * solo il seed creava versioni "ultima" e "pescata" coincidevano sempre;
 * appena un docente corregge un esercizio già assegnato (questo task lo
 * rende possibile per la prima volta), non più — uno studente che riapre
 * il link del compito otteneva un tentativo NUOVO su un seme nuovo e una
 * versione MAI pescata da quel compito: lavoro in corso perso, e anche un
 * completamento successivo non contava come consegna (`consegneDelCompito`
 * filtra su `esercizioVersioneId: { in: drawnVersionIds }`). Il valore
 * `null` copre sia "non valido" sia "non trovato", esattamente come prima
 * il booleano `false` — il chiamante non ha bisogno di distinguerli. */
export async function compitoApribile(
  compitoId: string,
  studentId: string,
  esercizioId: string,
): Promise<string | null> {
  const compito = await prisma.compito.findUnique({ where: { id: compitoId } });
  if (!compito) return null;
  if (compito.opensAt && compito.opensAt > new Date()) return null;
  if (compito.drawnVersionIds.length === 0) return null;

  const iscritto = await prisma.classeStudente.findUnique({
    where: { classeId_studentId: { classeId: compito.classeId, studentId } },
  });
  if (!iscritto) return null;

  const versionePescata = await prisma.esercizioVersione.findFirst({
    where: { id: { in: compito.drawnVersionIds }, esercizioId },
    select: { id: true },
  });
  return versionePescata?.id ?? null;
}

/** I compiti assegnati a una classe, per la vista del docente. */
export async function compitiDellaClasse(
  classeId: string,
): Promise<{ id: string; batteria: string; dueAt: Date | null; esercizi: number }[]> {
  const righe = await prisma.compito.findMany({
    where: { classeId },
    include: { batteria: true },
    orderBy: { createdAt: "desc" },
  });
  return righe.map((c) => ({
    id: c.id,
    batteria: c.batteria.name,
    dueAt: c.dueAt,
    esercizi: c.drawnVersionIds.length,
  }));
}

/** I compiti che uno studente vede, con i titoli degli esercizi pescati e
 * quanti ne ha completati. Guarda le classi CORRENTI dello studente, non uno
 * snapshot al momento dell'assegnazione: chi entra in classe dopo vede
 * comunque il compito. */
export async function compitiDelloStudente(studentId: string): Promise<
  { id: string; batteria: string; dueAt: Date | null; esercizi: { esercizioId: string; title: string }[]; fatti: number }[]
> {
  const iscrizioni = await prisma.classeStudente.findMany({ where: { studentId }, select: { classeId: true } });
  const classeIds = iscrizioni.map((i) => i.classeId);
  if (classeIds.length === 0) return [];

  const compiti = await prisma.compito.findMany({
    where: { classeId: { in: classeIds } },
    include: { batteria: true },
    orderBy: { createdAt: "desc" },
  });

  const risultati: Awaited<ReturnType<typeof compitiDelloStudente>> = [];
  for (const c of compiti) {
    const versioni = await prisma.esercizioVersione.findMany({
      where: { id: { in: c.drawnVersionIds } },
      include: { esercizio: true },
    });
    const perId = new Map(versioni.map((v) => [v.id, v]));
    const esercizi = c.drawnVersionIds
      .map((vid) => perId.get(vid))
      .filter((v): v is NonNullable<typeof v> => v != null)
      .map((v) => ({ esercizioId: v.esercizioId, title: v.esercizio.title }));

    // `esercizioVersioneId: { in: c.drawnVersionIds }` (Fix round finale,
    // item 1) non è ridondante col filtro su `compitoId`: quest'ultimo da
    // solo si fida di qualunque valore scritto sul tentativo, compresi
    // quelli scritti PRIMA che `avviaORiprendi` validasse `compitoId in
    // ingresso (vedi `compitoApribile` più sopra) — righe già nel database
    // che portano un `compitoId` vero ma un esercizio mai pescato da
    // quell'assegnazione. Senza intersecare con `drawnVersionIds`, quelle
    // righe continuerebbero a contare come consegne di un compito a cui non
    // appartengono, anche dopo che l'ingresso è stato chiuso.
    //
    // `distinct: ["esercizioVersioneId"]` (Secondo giro, item 1): completare
    // un esercizio non ne consuma la possibilità di riaprirlo —
    // `avviaORiprendi` cerca solo un tentativo IN_PROGRESS da riprendere, mai
    // uno COMPLETED, quindi riaprire il link di un esercizio già consegnato
    // apre sempre un tentativo NUOVO. Completarlo una seconda volta scrive
    // una seconda riga COMPLETED per lo stesso esercizio — comportamento del
    // tutto ordinario, non un dato forgiato. Un `count` grezzo sulle righe
    // conterebbe entrambe: lo stesso esercizio due volte, `fatti` che supera
    // `totali`. Qui conta gli ESERCIZI distinti completati, non le righe.
    const completati = await prisma.tentativo.findMany({
      where: {
        studentId,
        compitoId: c.id,
        status: "COMPLETED",
        esercizioVersioneId: { in: c.drawnVersionIds },
      },
      select: { esercizioVersioneId: true },
      distinct: ["esercizioVersioneId"],
    });
    const fatti = completati.length;

    risultati.push({ id: c.id, batteria: c.batteria.name, dueAt: c.dueAt, esercizi, fatti });
  }
  return risultati;
}

/** Le consegne di un compito: parte dagli iscritti ATTUALI alla classe, non
 * dai tentativi, così chi non ha ancora iniziato compare comunque con zero.
 * Chi è uscito dalla classe sparisce da qui, ma i suoi tentativi restano nel
 * database (il compito li referenzia comunque).
 *
 * `teacherId` è chi sta guardando: autorizzato se insegna OGGI la classe del
 * compito (`classeDocente`, lo stesso controllo che `assegna` fa già sulla
 * scrittura — Fix round 1) OPPURE se è stato lui ad assegnarlo
 * (`assignedById`, Fix round finale, item 2). La seconda clausola non
 * sostituisce la prima, la allarga: `dichiaraInsegnamento` è una
 * sostituzione integrale dell'elenco (vedi il dominio in classi.ts), e con
 * due schede aperte salvare quella vecchia fa sparire silenziosamente una
 * classe dall'elenco insegnato di un docente — il compito che ci aveva
 * assegnato resta, gli studenti continuano a vederlo e a lavorarci, ma senza
 * questa seconda clausola NESSUNO potrebbe più leggerne le consegne: non il
 * docente che l'ha creato (non insegna più quella classe secondo
 * `classeDocente`), non un altro docente (non l'ha mai insegnata), non un
 * admin (nessuna eccezione di ruolo qui, invariato dal Fix round 1). Chi ha
 * assegnato un compito deve sempre poter vedere come è andato.
 *
 * Nessuna eccezione per ADMIN: qui vale la stessa regola di `assegna`, per
 * chiunque guardi. */
export async function consegneDelCompito(
  compitoId: string,
  teacherId: string,
): Promise<
  | { ok: true; righe: { studentId: string; nome: string; fatti: number; totali: number; punteggio: number; massimo: number }[] }
  | { ok: false; motivo: "non_insegni_questa_classe" }
> {
  const compito = await prisma.compito.findUnique({ where: { id: compitoId } });
  if (!compito) return { ok: true, righe: [] };

  const insegna = await prisma.classeDocente.findUnique({
    where: { classeId_teacherId: { classeId: compito.classeId, teacherId } },
  });
  const autorizzato = insegna != null || compito.assignedById === teacherId;
  if (!autorizzato) return { ok: false, motivo: "non_insegni_questa_classe" };

  const iscritti = await prisma.classeStudente.findMany({
    where: { classeId: compito.classeId },
    include: { studente: true },
    orderBy: { studente: { name: "asc" } },
  });

  // Autoritativo sul numero totale: quante delle versioni pescate esistono
  // ANCORA (Fix round finale, item 3), non quante ne furono pescate allora
  // (`drawnVersionIds.length`, crudo). `compitiDelloStudente` filtra già le
  // versioni risolvibili per costruire l'elenco esercizi dello studente; le
  // due letture devono concordare sullo stesso numero, non una contare 3 e
  // l'altra 2 per lo stesso compito — altrimenti lo studente resta bloccato
  // a "2 su 3" per sempre, senza modo di sapere che il terzo non esiste più.
  // Non raggiungibile oggi (niente cancella un Esercizio), ma corretto fin
  // da ora costa poco ed evita di doverci tornare quando l'editor degli
  // esercizi aprirà quella strada.
  const totali = await prisma.esercizioVersione.count({
    where: { id: { in: compito.drawnVersionIds } },
  });

  const righe = [];
  for (const i of iscritti) {
    // `esercizioVersioneId: { in: compito.drawnVersionIds } }` (Fix round
    // finale, item 1): senza intersecare con ciò che l'assegnazione ha
    // DAVVERO pescato, questa query conta qualunque tentativo che porti
    // questo `compitoId` — compresi quelli scritti prima che
    // `avviaORiprendi` validasse l'ingresso (`compitoApribile`), su un
    // esercizio mai assegnato da questo compito. Il committente ha
    // dimostrato l'esito: uno studente che non aveva risolto NESSUNO degli
    // esercizi assegnati compariva come 5/3, sopra chi ne aveva fatto
    // davvero uno.
    const tentativi = await prisma.tentativo.findMany({
      where: { studentId: i.studentId, compitoId, esercizioVersioneId: { in: compito.drawnVersionIds } },
    });

    // Raggruppa per esercizio (Secondo giro, item 1): `avviaORiprendi` non
    // riprende mai un tentativo COMPLETED, solo uno IN_PROGRESS — riaprire
    // il link di un esercizio già consegnato apre sempre un tentativo
    // nuovo, con un seme nuovo. Comportamento ordinario, non un caso raro:
    // uno studente che torna sul compito già svolto. Sommare `score` e
    // `maxScore` di TUTTE le righe (come faceva prima) conta lo stesso
    // esercizio più volte — la stessa patologia del "5/3" dimostrato dal
    // committente, raggiunta qui senza nessun id forgiato. Un solo
    // rappresentante per esercizio, quindi: il migliore fra i tentativi
    // COMPLETED se ce n'è almeno uno (rifare un esercizio è pratica, non va
    // penalizzato — il punteggio più alto vince), altrimenti il tentativo
    // più recente (per mostrare comunque un progresso in corso). `score` e
    // `maxScore` vengono SEMPRE dallo stesso tentativo: `punteggio` non può
    // mai superare `massimo`, esercizio per esercizio e quindi in totale.
    const perEsercizio = new Map<string, typeof tentativi>();
    for (const t of tentativi) {
      const gruppo = perEsercizio.get(t.esercizioVersioneId);
      if (gruppo) gruppo.push(t);
      else perEsercizio.set(t.esercizioVersioneId, [t]);
    }

    let fatti = 0;
    let punteggio = 0;
    let massimo = 0;
    for (const gruppo of perEsercizio.values()) {
      const completati = gruppo.filter((t) => t.status === "COMPLETED");
      const rappresentante = completati.length > 0
        ? completati.reduce((migliore, t) => (t.score > migliore.score ? t : migliore))
        : gruppo.reduce((piuRecente, t) => (t.startedAt > piuRecente.startedAt ? t : piuRecente));
      if (completati.length > 0) fatti++;
      punteggio += rappresentante.score;
      massimo += rappresentante.maxScore;
    }

    righe.push({
      studentId: i.studentId,
      nome: i.studente.name ?? i.studente.email,
      fatti,
      totali,
      punteggio,
      massimo,
    });
  }
  return { ok: true, righe };
}
