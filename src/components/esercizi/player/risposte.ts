import type { Answer, PartState } from "@savint/engine";
import type { PartePubblica } from "./parti";

// Il passaggio fra le risposte dei campi e lo stato del motore, comune al
// player della pratica e alla prova di verifica.

export function trovaStato(path: string, stati: PartState[] | undefined): PartState | undefined {
  return stati?.find((s) => s.path === path);
}

/** La risposta da cui ripartire per una parte, ricostruita dallo stato
 * salvato. Per un `gapfill` lo stato tiene le risposte sui gap, mai sulla
 * parte madre (Task 8 dell'engine, `state.ts`): si ricompone l'array
 * ricorsivamente dagli stati dei gap. Un gap senza risposta nello stato
 * diventa `null` — il contratto di `InputGapfill` per "mai risposto", non
 * ancora la risposta che va al motore (vedi `preparaRispostaPerMotore`). */
export function rispostaDaStato(parte: PartePubblica, stati: PartState[] | undefined): Answer {
  const stato = trovaStato(parte.path, stati);
  if (parte.type === "gapfill") {
    return (parte.gaps ?? []).map((gap) => rispostaDaStato(gap, stato?.gaps));
  }
  return (stato?.answer ?? null) as Answer;
}

/** Segnalazione del coordinatore: un gap mai toccato viaggia come `null`
 * nell'array della risposta di un `gapfill` — l'unica scelta type-legale
 * per `InputGapfill`, dato che `Answer` non ammette `undefined`. Ma
 * `GapFillPart#storeAnswer` (engine, `gapfill-part.ts`) inoltra ogni voce
 * dell'array al gap corrispondente INVARIATA: solo `undefined` significa
 * davvero "nessuna risposta"; `null` diventa una risposta letterale. Per un
 * gap di testo/numero il risultato è solo un'altra risposta sbagliata
 * (innocuo ma comunque falso: quel gap non è stato risposto). Per un gap a
 * scelta multipla (`1_n_2`/`m_n_2`/`m_n_x`) è peggio: la sua
 * `setStudentAnswer` chiama `.map()` sulla risposta, e un `null` la fa
 * incappare in un `TypeError` che risale fino a rompere l'invio
 * dell'INTERA parte gapfill (verificato al banco). Un gap davvero mai
 * risposto deve quindi arrivare al motore — e finire nello stato che si
 * manda al server — come OMESSO, non come `null`: la conversione va fatta
 * qui, al confine con `parts.PartBase#submit`, prima che l'array lasci il
 * player. */
export function preparaRispostaPerMotore(parte: PartePubblica, valore: Answer): Answer {
  if (parte.type !== "gapfill" || !Array.isArray(valore)) return valore;
  const senzaNull = valore.map((v) => (v === null ? undefined : v));
  return senzaNull as unknown as Answer;
}
