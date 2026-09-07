import { randomUUID } from "crypto";
import seedrandom from "seedrandom";
import { prisma } from "@/lib/db/client";
import { candidatiDisponibili, idsConVersione } from "./batterie";

type MotivoAssegna =
  | "batteria_non_trovata"
  | "classe_non_trovata"
  | "non_insegni_questa_classe"
  | "esercizi_insufficienti"
  | "scadenza_prima_apertura"
  | "scadenza_nel_passato";

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
 * lascia nessun Compito a metà. */
export async function assegna(
  batteriaId: string,
  classeId: string,
  assignedById: string,
  opzioni?: { opensAt?: Date; dueAt?: Date },
): Promise<
  | { ok: true; compitoId: string }
  | { ok: false; motivo: MotivoAssegna; dettaglio?: unknown }
> {
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
        include: { contenitore: { include: { esercizi: true } } },
      },
    },
  });
  if (!batteria) return { ok: false, motivo: "batteria_non_trovata" };

  const classe = await prisma.classe.findUnique({ where: { id: classeId } });
  if (!classe) return { ok: false, motivo: "classe_non_trovata" };

  const insegna = await prisma.classeDocente.findUnique({
    where: { classeId_teacherId: { classeId, teacherId: assignedById } },
  });
  if (!insegna) return { ok: false, motivo: "non_insegni_questa_classe" };

  const tuttiGliId = [...new Set(batteria.regole.flatMap((r) => r.contenitore.esercizi.map((e) => e.esercizioId)))];
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

  for (const regola of batteria.regole) {
    const candidati = candidatiDisponibili(
      regola.contenitore.esercizi.map((e) => e.esercizioId),
      giaPescati,
      conVersione,
    );
    if (candidati.length < regola.count) {
      return {
        ok: false,
        motivo: "esercizi_insufficienti",
        dettaglio: {
          contenitore: regola.contenitore.name,
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
 * non sparsi fra chiamante e dominio. */
export async function compitoApribile(
  compitoId: string,
  studentId: string,
  esercizioId: string,
): Promise<boolean> {
  const compito = await prisma.compito.findUnique({ where: { id: compitoId } });
  if (!compito) return false;
  if (compito.opensAt && compito.opensAt > new Date()) return false;
  if (compito.drawnVersionIds.length === 0) return false;

  const iscritto = await prisma.classeStudente.findUnique({
    where: { classeId_studentId: { classeId: compito.classeId, studentId } },
  });
  if (!iscritto) return false;

  const versionePescata = await prisma.esercizioVersione.findFirst({
    where: { id: { in: compito.drawnVersionIds }, esercizioId },
    select: { id: true },
  });
  return versionePescata != null;
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
