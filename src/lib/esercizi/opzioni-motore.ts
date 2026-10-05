import type { Locale } from "@savint/engine";

/** Le opzioni di lingua con cui l'applicazione carica una domanda nel motore:
 * la lingua dei messaggi e, per l'italiano, lo stile dei numeri MOSTRATI —
 * la virgola decimale («48,5»), la stessa che lo studente usa per
 * rispondere. Il codice della domanda (valori attesi, regole) resta col
 * punto: lo garantisce il motore (vedi packages/engine/DIVERGENCES.md, «Stile
 * dei numeri mostrati»).
 *
 * Un solo punto per tutte le vie che caricano una domanda — player,
 * ricalcolo sul server, verifica e anteprima dell'editor — così lo studente,
 * il server e il docente vedono gli stessi numeri. */
export function opzioniMotore(locale: Locale): { locale: Locale; numberStyle?: string } {
  return locale === "it" ? { locale, numberStyle: "plain-eu" } : { locale };
}
