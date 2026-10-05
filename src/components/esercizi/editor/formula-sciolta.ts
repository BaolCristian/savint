import { trovaProssimaFormula } from "@/components/esercizi/player/contenuto-html";

/** Una formula scritta FUORI da `\( \)` — `3*x^2-6=0`, `sqrt(16)`, `\frac{1}{2}`
 * — che lo studente leggerebbe carattere per carattere, asterischi e
 * accenti circonflessi compresi. È successo a un docente al primo esercizio:
 * nell'anteprima la consegna mostrava «3*x^2-6=0». Restituisce il pezzo da
 * mostrare nell'avviso (la «parola» che contiene il segno sospetto), o `null`.
 *
 * Non sono formule sciolte: ciò che sta dentro `\( \)`/`\[ \]`, e i
 * segnaposto di immagini, grafici, diagrammi e figure, che contengono
 * espressioni come `a*x+b` di proposito. */
const SEGNAPOSTI = /!\[[^\]\n]*\]\([^)\s]*\)|\[(?:grafico|diagramma|figura):[^\]\n]*\]/g;

const SOSPETTI = [
  /[A-Za-z0-9)]\s*\^/, // potenza: x^2, (a+b)^2
  /[0-9A-Za-z)]\s*\*\s*[A-Za-z0-9(]/, // prodotto con l'asterisco: 3*x
  /\bsqrt\s*\(/, // radice scritta come funzione
  /\\(?:frac|cdot|sqrt|times|var|simplify)\b/, // comandi LaTeX fuori da una formula
];

export function formulaSciolta(testo: string): string | null {
  // Il testo con le zone matematiche e i segnaposto sostituiti da spazi della
  // stessa lunghezza: le posizioni restano quelle del testo originale.
  let fuori = testo.replace(SEGNAPOSTI, (m) => " ".repeat(m.length));
  for (let da = 0; ; ) {
    const zona = trovaProssimaFormula(testo, da);
    if (!zona) break;
    fuori = fuori.slice(0, zona.inizio) + " ".repeat(zona.fine - zona.inizio) + fuori.slice(zona.fine);
    da = zona.fine;
  }

  for (const sospetto of SOSPETTI) {
    const m = sospetto.exec(fuori);
    if (!m) continue;
    // La «parola» intorno al segno: fino agli spazi.
    let inizio = m.index;
    let fine = m.index + m[0].length;
    while (inizio > 0 && !/\s/.test(fuori[inizio - 1]!)) inizio--;
    while (fine < fuori.length && !/\s/.test(fuori[fine]!)) fine++;
    return testo.slice(inizio, fine);
  }
  return null;
}
