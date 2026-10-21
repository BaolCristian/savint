/** Estrazione degli esercizi dal testo che il docente incolla dopo averlo
 * fatto generare a un'IA.
 *
 * Modulo puro, senza dipendenze dal server: lo usano sia l'anteprima nel
 * browser sia la rotta che importa davvero (che rifà tutto da capo, perché
 * non si fida del client). Qui si decide solo *quali* elementi ci sono; se
 * ciascuno sia un esercizio valido lo stabiliscono lo schema e la verifica
 * a valle. */

/** Oltre questa soglia l'import si rifiuta per intero: meglio dividere il
 * file che lasciare il docente davanti a un'anteprima interminabile. */
export const MAX_ESERCIZI_IMPORT = 30;

export type EsitoEstrazione =
  | { ok: true; elementi: unknown[] }
  | { ok: false; motivo: "vuoto" | "non_json" | "troppi"; messaggio: string };

/** Il primo blocco recintato ```...``` (con o senza `json`): le IA spesso
 * avvolgono il JSON in un blocco di codice con una frase prima e dopo. */
const BLOCCO_RECINTATO = /```(?:json)?[ \t]*\r?\n?([\s\S]*?)```/i;

function eOggetto(valore: unknown): valore is Record<string, unknown> {
  return typeof valore === "object" && valore !== null && !Array.isArray(valore);
}

/** Il pezzo di testo che con ogni probabilità è il JSON: il contenuto del
 * blocco recintato se c'è, ritagliato dal primo `{`/`[` all'ultimo `}`/`]`
 * così che le frasi di cortesia attorno non disturbino `JSON.parse`. */
function ritagliaJson(testo: string): string {
  const recintato = BLOCCO_RECINTATO.exec(testo);
  const candidato = recintato ? recintato[1] : testo;
  const inizi = [candidato.indexOf("{"), candidato.indexOf("[")].filter((i) => i >= 0);
  const fine = Math.max(candidato.lastIndexOf("}"), candidato.lastIndexOf("]"));
  if (inizi.length === 0 || fine < 0) return candidato.trim();
  const inizio = Math.min(...inizi);
  return fine > inizio ? candidato.slice(inizio, fine + 1) : candidato.trim();
}

export function estraiEsercizi(testo: string): EsitoEstrazione {
  // Il BOM arriva copiando da certi editor e da file salvati su Windows:
  // per `JSON.parse` è un carattere estraneo.
  const pulito = testo.replace(/^﻿/, "").trim();
  if (pulito === "") {
    return { ok: false, motivo: "vuoto", messaggio: "Il testo è vuoto: incolla il JSON generato dall'IA." };
  }

  let valore: unknown;
  try {
    valore = JSON.parse(ritagliaJson(pulito));
  } catch (e) {
    const dettaglio = e instanceof Error ? e.message : String(e);
    // Le virgolette tipografiche sono l'errore più comune quando il testo
    // passa da un programma di videoscrittura: vale la pena dirlo esplicito.
    const virgolette = /[“”]/.test(pulito) ? " — controlla le virgolette: devono essere \" e non “ ”" : "";
    return { ok: false, motivo: "non_json", messaggio: `Il testo non è JSON valido: ${dettaglio}${virgolette}` };
  }

  // Tre forme accettate: l'involucro { "esercizi": [...] }, l'array nudo,
  // un esercizio singolo.
  const elementi: unknown[] =
    eOggetto(valore) && Array.isArray(valore.esercizi)
      ? valore.esercizi
      : Array.isArray(valore)
        ? valore
        : [valore];

  if (elementi.length === 0) {
    return { ok: false, motivo: "vuoto", messaggio: "Il JSON non contiene nessun esercizio." };
  }
  if (elementi.length > MAX_ESERCIZI_IMPORT) {
    return {
      ok: false,
      motivo: "troppi",
      messaggio: `Il JSON contiene ${elementi.length} esercizi: il massimo per un import è ${MAX_ESERCIZI_IMPORT}.`,
    };
  }
  return { ok: true, elementi };
}

/** Aggiunge i campi vuoti che l'IA tende a omettere (e che lo schema
 * dell'editor richiede), solo se mancano: un valore presente, anche
 * sbagliato, resta com'è perché sia lo schema a segnalarlo. Tutto ciò che
 * non è un oggetto passa invariato. */
export function normalizza(elemento: unknown): unknown {
  if (!eOggetto(elemento)) return elemento;
  const risultato: Record<string, unknown> = { ...elemento };
  if (eOggetto(risultato.meta)) {
    const meta: Record<string, unknown> = { ...risultato.meta };
    if (meta.descrizione === undefined) meta.descrizione = "";
    if (meta.tag === undefined) meta.tag = [];
    risultato.meta = meta;
  }
  if (risultato.suggerimento === undefined) risultato.suggerimento = "";
  if (risultato.variabili === undefined) risultato.variabili = [];
  if (risultato.condizione === undefined) risultato.condizione = "";
  return risultato;
}
