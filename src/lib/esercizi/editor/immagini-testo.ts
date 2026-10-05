import { NOME_FILE_IMMAGINE } from "../immagini";
import { leggiSpecificaGrafico, type SpecificaGrafico } from "../grafici";

/** Le immagini nel testo del docente.
 *
 * Nell'editor un'immagine è un segnaposto leggibile, `![descrizione](file)`;
 * nel file dell'esercizio è `<img data-savint-immagine="file" alt="…">`. Le
 * due funzioni qui sotto sono una l'inversa dell'altra, BYTE PER BYTE: è la
 * condizione perché un esercizio con immagini si riapra nell'editor (vedi
 * `estraiTesto` in da-numbas.ts, che rifiuta tutto ciò che non torna
 * identico). Solo il nome del file finisce nel file, mai un indirizzo: lo
 * costruisce il player (`urlImmagine`). */

/** Un segnaposto nel testo GIÀ scappato da `escapaTesto`: la descrizione
 * non contiene `]` né a capo (vedi `tokenImmagine`), il nome è uno di quelli
 * della piattaforma. */
const SEGNAPOSTO = /!\[([^\]\n]*)\]\(([^)\s]+)\)/g;

/** Un `<img>` esattamente nella forma che produce `testoVersoHtml`. */
const IMG = /<img data-savint-immagine="([^"]+)" alt="([^"]*)">/g;

/** Un grafico di funzione nel testo del docente: `[grafico: espressione | x:
 * da..a]`, con `| y: da..a` facoltativo (senza, l'intervallo è automatico).
 * Nel file diventa uno `<span>` vuoto con espressione e intervalli negli
 * attributi; lo disegna il player, con i numeri dello studente (vedi
 * src/lib/esercizi/grafici.ts). */
const SEGNAPOSTO_GRAFICO = /\[grafico:\s*([^|\]\n]+?)\s*\|\s*x:\s*([^|\]\s]+)\s*(?:\|\s*y:\s*([^|\]\s]+)\s*)?\]/g;

/** Uno `<span>` di grafico esattamente nella forma che produce `testoVersoHtml`. */
const SPAN_GRAFICO = /<span data-savint-grafico="([^"]+)" data-x="([^"]+)"(?: data-y="([^"]+)")?><\/span>/g;

/** Come `escapaTesto` (verso-numbas.ts): ripetuta qui perché quel modulo
 * importa questo, e la regola è la stessa. */
function escapa(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapa(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** Il testo del docente come HTML del file: scappato come sempre, e con
 * ogni segnaposto di un'immagine della piattaforma trasformato in `<img>`.
 * Un segnaposto con un nome qualsiasi (un indirizzo, un percorso) resta
 * testo: non diventa mai un'immagine che il browser andrebbe a caricare. */
export function testoVersoHtml(testo: string): string {
  return escapa(testo)
    .replace(SEGNAPOSTO, (intero, alt: string, file: string) =>
      NOME_FILE_IMMAGINE.test(file)
        ? `<img data-savint-immagine="${file}" alt="${alt.replace(/"/g, "&quot;")}">`
        : intero,
    )
    .replace(SEGNAPOSTO_GRAFICO, (intero, espressione: string, x: string, y: string | undefined) => {
      // L'espressione è già scappata: la si valida com'era nel testo.
      const specifica = leggiSpecificaGrafico(unescapa(espressione), x, y);
      if (!specifica) return intero;
      return `<span data-savint-grafico="${espressione.trim()}" data-x="${x}"${y ? ` data-y="${y}"` : ""}></span>`;
    });
}

/** L'inverso di `testoVersoHtml`: ogni `<img>` nella forma canonica torna
 * segnaposto, poi il testo si disfa come sempre. Ciò che non è nella forma
 * canonica resta com'è, e il confronto in `estraiTesto` lo rifiuta. */
export function htmlVersoTesto(html: string): string {
  return unescapa(
    html
      .replace(IMG, (intero, file: string, alt: string) =>
        NOME_FILE_IMMAGINE.test(file) ? `![${alt.replace(/&quot;/g, '"')}](${file})` : intero,
      )
      .replace(SPAN_GRAFICO, (_intero, espressione: string, x: string, y: string | undefined) =>
        `[grafico: ${espressione} | x: ${x}${y ? ` | y: ${y}` : ""}]`,
      ),
  );
}

function numero(n: number): string {
  return String(Number(n.toPrecision(12)));
}

/** Le specifiche dei grafici contenuti in un HTML di esercizio (testo,
 * suggerimento, consegna), per la verifica dei venti sorteggi. Solo quelli
 * nella forma canonica e con una specifica valida: gli altri il player non
 * li disegna comunque. */
export function graficiNelHtml(html: string): SpecificaGrafico[] {
  const out: SpecificaGrafico[] = [];
  for (const m of html.matchAll(SPAN_GRAFICO)) {
    const specifica = leggiSpecificaGrafico(unescapa(m[1]!.replace(/&quot;/g, '"')), m[2]!, m[3]);
    if (specifica) out.push(specifica);
  }
  return out;
}

/** Il segnaposto di un grafico, nella forma canonica che l'editor inserisce. */
export function tokenGrafico(s: SpecificaGrafico): string {
  const x = `${numero(s.x[0])}..${numero(s.x[1])}`;
  const y = s.y ? ` | y: ${numero(s.y[0])}..${numero(s.y[1])}` : "";
  return `[grafico: ${s.espressione.trim()} | x: ${x}${y}]`;
}

/** Il segnaposto da inserire nel campo dopo un caricamento. La descrizione
 * perde le parentesi quadre e gli a capo, che chiuderebbero il segnaposto
 * prima del tempo. */
export function tokenImmagine(descrizione: string, file: string): string {
  const pulita = descrizione.replace(/[[\]]/g, "").replace(/\s*\n\s*/g, " ").trim();
  return `![${pulita}](${file})`;
}
