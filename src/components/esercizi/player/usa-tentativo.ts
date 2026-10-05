import { withBasePath } from "@/lib/base-path";
import type { Answer, FeedbackItem, QuestionState } from "@savint/engine";

/** L'esito di una risposta a una parte, come lo dà la rotta del Task 6:
 * `score`/`maxScore` sono del TENTATIVO intero (ricalcolati dal server da
 * zero), `feedback` è quello della sola parte appena risposta. */
export interface EsitoRisposta {
  score: number;
  maxScore: number;
  feedback: FeedbackItem[];
  /** Il server ha ricalcolato e salvato tutte le parti: solo questo segnale
   * può avviare la chiusura automatica, mai il punteggio nel browser. */
  allCorrect?: boolean;
}

/** L'esito del completamento di un tentativo. */
export interface EsitoCompletamento {
  score: number;
  maxScore: number;
}

/** Incapsula le due chiamate di rete che il player fa verso le rotte del
 * Task 6, così `player-esercizio.tsx` non tocca `fetch` direttamente.
 *
 * Manda sempre `x-savint-locale`: le rotte lo leggono per tradurre il
 * feedback e, senza l'header, tornano all'italiano di default — uno
 * studente che lavora in inglese vedrebbe comunque messaggi in italiano. */
async function postJson<T>(percorso: string, corpo: unknown, locale: "it" | "en"): Promise<T> {
  const risposta = await fetch(withBasePath(percorso), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-savint-locale": locale },
    body: JSON.stringify(corpo ?? {}),
  });
  if (!risposta.ok) {
    throw new Error(`richiesta a ${percorso} fallita con stato ${risposta.status}`);
  }
  return (await risposta.json()) as T;
}

/** Invia la risposta di una parte. Il corpo è quello che la rotta si
 * aspetta: `partPath` (il percorso del motore, `"p0"`, `"p0g1"`), `answer`
 * (la risposta appena data, informativa: la rotta corregge sempre da
 * `state`) e `state` (`Question#toState()`, l'intera domanda). */
export function inviaRisposta(
  tentativoId: string,
  partPath: string,
  answer: Answer,
  state: QuestionState,
  locale: "it" | "en",
): Promise<EsitoRisposta> {
  return postJson<EsitoRisposta>(
    `/api/esercizi/tentativi/${tentativoId}/risposta`,
    { partPath, answer, state },
    locale,
  );
}

/** Chiude il tentativo: il punteggio finale è quello che ricalcola il server. */
export function completaTentativo(tentativoId: string, locale: "it" | "en"): Promise<EsitoCompletamento> {
  return postJson<EsitoCompletamento>(`/api/esercizi/tentativi/${tentativoId}/completa`, undefined, locale);
}

/** Abbandona il tentativo in corso: la rotta lo marca `ABANDONED` (mai
 * `COMPLETED`, vedi il dominio) senza aprirne uno nuovo. È compito di chi
 * chiama far ripartire `avviaORiprendi` — di norma un `router.refresh()` sulla
 * stessa pagina — così un solo posto sa come nasce un tentativo. */
export function abbandonaTentativo(tentativoId: string, locale: "it" | "en"): Promise<{ ok: true }> {
  return postJson<{ ok: true }>(`/api/esercizi/tentativi/${tentativoId}/abbandona`, undefined, locale);
}
