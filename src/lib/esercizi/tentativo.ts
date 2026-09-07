import { randomUUID } from "crypto";
import type { TentativoStatus } from "@prisma/client";
import type { Answer, QuestionState, MarkingResult, Locale } from "@savint/engine";
import { prisma } from "@/lib/db/client";
import { ricalcola } from "./marking";
import { compitoApribile } from "./compiti";

export interface TentativoAperto {
  tentativoId: string;
  seed: string;
  content: unknown;
  state: QuestionState | null;
  score: number;
  maxScore: number;
  status: TentativoStatus;
  /** L'ultimo tocco sul tentativo (`@updatedAt`): serve al player per dire
   * QUANDO risale il lavoro che sta riprendendo, non solo che lo sta
   * riprendendo. */
  lastActivityAt: Date;
}

/** Restituisce il tentativo in corso dello studente su quell'esercizio, o ne
 * apre uno nuovo sull'ultima versione. `null` se l'esercizio non esiste.
 *
 * `compitoId`, se passato, viene VALIDATO da `compitoApribile` (dominio,
 * compiti.ts) prima di essere scritto o anche solo usato per cercare il
 * tentativo in corso — mai fidandosi del valore ricevuto. Il link nella home
 * dello studente è letteralmente `?compitoId=...`: senza questo controllo
 * qualunque studente autenticato può scriverci un id qualunque (di un'altra
 * classe, di un compito non ancora aperto, o abbinato a un esercizio che
 * quel compito non ha mai pescato) e farlo contare come lavoro consegnato
 * per quel compito. Il committente lo ha dimostrato: uno studente che non
 * aveva risolto NESSUNO degli esercizi assegnati compariva come 5/3 nella
 * tabella del docente, sopra chi ne aveva fatto davvero uno.
 *
 * Scelta esplicita (Fix round finale, item 1): un `compitoId` che fallisce
 * la validazione non fa fallire la pagina — l'esercizio è comunque
 * accessibile dal link libero, indipendentemente dal compito — ma lo apre
 * COME libero, silenziosamente ignorando l'id ricevuto (`compitoIdEffettivo`
 * sotto). Rifiutare la pagina intera sarebbe eccessivo per il caso più
 * comune e meno malizioso (un compito non ancora aperto, o uno studente
 * appena uscito dalla classe che vuole comunque esercitarsi): l'esercizio
 * resta comunque nel bacino libero. Quel che NON deve succedere in nessun
 * caso è che un `compitoId` non valido venga scritto sul tentativo — questo
 * sì, senza eccezioni.
 *
 * Una volta risolto, `compitoIdEffettivo` gioca lo stesso ruolo che
 * `compitoId` giocava prima: viene scritto sul tentativo e usato anche per
 * TROVARLO, così un esercizio aperto dentro e fuori da un compito produce
 * sempre due tentativi distinti (vedi il commento gemello più sotto, ora
 * sul valore validato). */
export async function avviaORiprendi(
  studentId: string,
  esercizioId: string,
  compitoId?: string,
): Promise<TentativoAperto | null> {
  const versione = await prisma.esercizioVersione.findFirst({
    where: { esercizioId },
    orderBy: { version: "desc" },
  });
  if (!versione) return null;

  const compitoIdEffettivo = compitoId && (await compitoApribile(compitoId, studentId, esercizioId))
    ? compitoId
    : undefined;

  // Conservazione pigra, come per PracticeRun: un tentativo fermo da più della
  // finestra non si riprende, se ne apre uno nuovo. Nessun lavoro pianificato
  // in questo sotto-progetto.
  const giorni = Number(process.env.TENTATIVI_RETENTION_DAYS ?? 180);
  const sogliaAttivita = new Date(Date.now() - giorni * 86_400_000);

  const inCorso = await prisma.tentativo.findFirst({
    where: {
      studentId, esercizioVersioneId: versione.id, status: "IN_PROGRESS",
      compitoId: compitoIdEffettivo ?? null,
      lastActivityAt: { gte: sogliaAttivita },
    },
    orderBy: { startedAt: "desc" },
  });

  const t = inCorso ?? (await prisma.tentativo.create({
    data: { studentId, esercizioVersioneId: versione.id, seed: randomUUID(), compitoId: compitoIdEffettivo ?? null },
  }));

  return {
    tentativoId: t.id,
    seed: t.seed,
    content: versione.content,
    state: (t.state as QuestionState | null) ?? null,
    score: t.score,
    maxScore: t.maxScore,
    status: t.status,
    lastActivityAt: t.lastActivityAt,
  };
}

type EsitoRisposta =
  | { ok: true; score: number; maxScore: number; feedback: MarkingResult["feedback"] }
  | { ok: false; motivo: "non_trovato" | "non_tuo" | "gia_completato" | "parte_sconosciuta" };

/** Applica una risposta e riscrive il punteggio con quello che calcola il
 * server. Lo stato del client serve solo a ricostruire le risposte: i numeri
 * che dichiara non vengono mai copiati sul database.
 *
 * `_answer` non entra nel calcolo: è nella firma per rispecchiare la singola
 * risposta appena data dal punto di vista del chiamante (ed è quel che la
 * rotta HTTP riceve come campo separato), ma la ricostruzione lavora solo su
 * `statoClient` — la risposta che conta è quella già dentro
 * `statoClient.parts[].answer` al percorso `partPath`. Non verificare che i
 * due coincidano è deliberato: un disallineamento non può comunque gonfiare
 * il punteggio, perché quello lo ricalcola sempre `ricalcola()` dal seme del
 * tentativo, mai da un valore dichiarato dal client. */
export async function applicaRisposta(
  tentativoId: string,
  studentId: string,
  partPath: string,
  _answer: Answer,
  statoClient: QuestionState | null,
  locale: Locale,
): Promise<EsitoRisposta> {
  const t = await prisma.tentativo.findUnique({
    where: { id: tentativoId },
    include: { versione: true },
  });
  if (!t) return { ok: false, motivo: "non_trovato" };
  if (t.studentId !== studentId) return { ok: false, motivo: "non_tuo" };
  if (t.status === "COMPLETED") return { ok: false, motivo: "gia_completato" };

  const esito = ricalcola(t.versione.content, t.seed, statoClient, locale);
  const parte = esito.feedback.find((f) => f.path === partPath);
  if (!parte) return { ok: false, motivo: "parte_sconosciuta" };

  await prisma.tentativo.update({
    where: { id: t.id },
    data: { state: esito.state as object, score: esito.score, maxScore: esito.maxScore },
  });

  return { ok: true, score: esito.score, maxScore: esito.maxScore, feedback: parte.items };
}

/** Chiude il tentativo fissando il punteggio ricalcolato.
 *
 * Chiudere un tentativo già chiuso non fa nulla: si restituisce il punteggio
 * fissato allora, senza rifar girare il motore e senza riscrivere
 * `completedAt`. Prima ogni chiamata ripeteva l'intero ricalcolo e spostava
 * in avanti il timestamp di chiusura, quindi un pulsante premuto due volte
 * (o una richiesta ritentata dopo un timeout) riscriveva la storia del
 * tentativo. Idempotente e non 409, a differenza della rotta sorella: un
 * ritentativo dopo una risposta persa deve trovare il tentativo chiuso e il
 * punteggio giusto, non un errore. */
export async function completa(
  tentativoId: string,
  studentId: string,
  locale: Locale,
): Promise<{ ok: true; score: number; maxScore: number } | { ok: false; motivo: "non_trovato" | "non_tuo" }> {
  const t = await prisma.tentativo.findUnique({ where: { id: tentativoId }, include: { versione: true } });
  if (!t) return { ok: false, motivo: "non_trovato" };
  if (t.studentId !== studentId) return { ok: false, motivo: "non_tuo" };
  if (t.status === "COMPLETED") return { ok: true, score: t.score, maxScore: t.maxScore };

  const esito = ricalcola(t.versione.content, t.seed, (t.state as QuestionState | null) ?? null, locale);
  await prisma.tentativo.update({
    where: { id: t.id },
    data: {
      state: esito.state as object, score: esito.score, maxScore: esito.maxScore,
      status: "COMPLETED", completedAt: new Date(),
    },
  });
  return { ok: true, score: esito.score, maxScore: esito.maxScore };
}

/** Abbandona il tentativo in corso: lo studente ricomincia da capo, senza
 * dover finire quello che ha davanti per liberarsi di risposte che non
 * riconosce più (il difetto riportato dal committente — vedi il dispaccio).
 *
 * Segna lo stato `ABANDONED`, mai `COMPLETED`: un sotto-progetto futuro
 * conterà i completamenti per stabilire se un compito è stato consegnato, e
 * un tentativo abbandonato non deve mai poter sembrare consegnato. Non crea
 * qui il tentativo nuovo — quello resta compito di `avviaORiprendi`, che ne
 * apre uno con un seme nuovo al primo accesso successivo, la stessa strada
 * già presa dopo un completamento (vedi il test gemello). Un solo punto che
 * sa come nasce un tentativo, non due.
 *
 * Rifiuta un tentativo già `COMPLETED`: abbandonare un lavoro già consegnato
 * non ha senso, e soprattutto non deve MAI poter spostare indietro quello
 * stato — è la garanzia che conta di più per il conteggio futuro. Idempotente
 * su un tentativo già `ABANDONED` (un doppio clic, o una richiesta ritentata
 * dopo un timeout, non deve fallire né riscrivere nulla), sullo stesso
 * modello di `completa` sopra. */
export async function abbandona(
  tentativoId: string,
  studentId: string,
): Promise<{ ok: true } | { ok: false; motivo: "non_trovato" | "non_tuo" | "gia_completato" }> {
  const t = await prisma.tentativo.findUnique({ where: { id: tentativoId } });
  if (!t) return { ok: false, motivo: "non_trovato" };
  if (t.studentId !== studentId) return { ok: false, motivo: "non_tuo" };
  if (t.status === "COMPLETED") return { ok: false, motivo: "gia_completato" };
  if (t.status === "ABANDONED") return { ok: true };

  await prisma.tentativo.update({ where: { id: t.id }, data: { status: "ABANDONED" } });
  return { ok: true };
}
