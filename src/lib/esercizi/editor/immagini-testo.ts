import { NOME_FILE_IMMAGINE } from "../immagini";
import { leggiSpecificaGrafico, type SpecificaGrafico } from "../grafici";
import { leggiSpecificaDiagramma, type SpecificaDiagramma } from "../diagrammi";
import { leggiSpecificaFigura, type SpecificaFigura } from "../figure";

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

/** Un grafico statistico: `[diagramma: barre | valori: dati | etichette:
 * giorni]` (etichette facoltative), con `barre`, `istogramma` o `torta`. I
 * dati sono espressioni JME, di solito nomi di variabili (vedi
 * src/lib/esercizi/diagrammi.ts). */
const SEGNAPOSTO_DIAGRAMMA = /\[diagramma:\s*(\w+)\s*\|\s*valori:\s*([^|\]\n]+?)\s*(?:\|\s*etichette:\s*([^|\]\n]+?)\s*)?\]/g;

/** Una figura geometrica: `[figura: rettangolo | misure: b, h | unità: cm |
 * incognite: 2]`, con unità e incognite facoltative (vedi
 * src/lib/esercizi/figure.ts). */
const SEGNAPOSTO_FIGURA =
  /\[figura:\s*([a-z ]+?)\s*\|\s*misure:\s*([^|\]\n]+?)\s*(?:\|\s*unità:\s*([^|\]\n]+?)\s*)?(?:\|\s*incognite:\s*([^|\]\n]+?)\s*)?\]/g;

/** Uno `<span>` di figura esattamente nella forma che produce `testoVersoHtml`. */
const SPAN_FIGURA =
  /<span data-savint-figura="([a-z ]+)" data-misure="([^"]+)"(?: data-unita="([^"]+)")?(?: data-incognite="([^"]+)")?><\/span>/g;

/** Uno `<span>` di diagramma esattamente nella forma che produce `testoVersoHtml`. */
const SPAN_DIAGRAMMA = /<span data-savint-diagramma="(\w+)" data-valori="([^"]+)"(?: data-etichette="([^"]+)")?><\/span>/g;

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
    })
    .replace(SEGNAPOSTO_DIAGRAMMA, (intero, tipo: string, valori: string, etichette: string | undefined) => {
      const specifica = leggiSpecificaDiagramma(tipo, unescapa(valori), etichette === undefined ? undefined : unescapa(etichette));
      if (!specifica) return intero;
      return `<span data-savint-diagramma="${tipo}" data-valori="${valori.trim()}"${etichette ? ` data-etichette="${etichette.trim()}"` : ""}></span>`;
    })
    .replace(SEGNAPOSTO_FIGURA, (intero, tipo: string, misure: string, unita?: string, incognite?: string) => {
      const s = leggiSpecificaFigura(tipo, unescapa(misure), unita, incognite);
      if (!s) return intero;
      return (
        `<span data-savint-figura="${s.tipo}" data-misure="${s.misure.join(", ")}"` +
        (s.unita ? ` data-unita="${s.unita}"` : "") +
        (s.incognite.length > 0 ? ` data-incognite="${s.incognite.join(", ")}"` : "") +
        "></span>"
      );
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
      )
      .replace(SPAN_DIAGRAMMA, (_intero, tipo: string, valori: string, etichette: string | undefined) =>
        `[diagramma: ${tipo} | valori: ${valori}${etichette ? ` | etichette: ${etichette}` : ""}]`,
      )
      .replace(SPAN_FIGURA, (_intero, tipo: string, misure: string, unita?: string, incognite?: string) =>
        `[figura: ${tipo} | misure: ${misure}${unita ? ` | unità: ${unita}` : ""}${incognite ? ` | incognite: ${incognite}` : ""}]`,
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

/** Le specifiche dei diagrammi statistici contenuti in un HTML di esercizio,
 * per la verifica dei venti sorteggi (vedi `graficiNelHtml`). */
export function diagrammiNelHtml(html: string): SpecificaDiagramma[] {
  const out: SpecificaDiagramma[] = [];
  for (const m of html.matchAll(SPAN_DIAGRAMMA)) {
    const specifica = leggiSpecificaDiagramma(m[1]!, unescapa(m[2]!), m[3] === undefined ? undefined : unescapa(m[3]));
    if (specifica) out.push(specifica);
  }
  return out;
}

/** Le specifiche delle figure geometriche contenute in un HTML di esercizio,
 * per la verifica dei venti sorteggi. */
export function figureNelHtml(html: string): SpecificaFigura[] {
  const out: SpecificaFigura[] = [];
  for (const m of html.matchAll(SPAN_FIGURA)) {
    const s = leggiSpecificaFigura(m[1]!, unescapa(m[2]!), m[3], m[4]);
    if (s) out.push(s);
  }
  return out;
}

/** Il segnaposto di una figura geometrica, nella forma canonica. */
export function tokenFigura(s: SpecificaFigura): string {
  return (
    `[figura: ${s.tipo} | misure: ${s.misure.join(", ")}` +
    (s.unita ? ` | unità: ${s.unita}` : "") +
    (s.incognite.length > 0 ? ` | incognite: ${s.incognite.join(", ")}` : "") +
    "]"
  );
}

/** Il segnaposto di un diagramma statistico, nella forma canonica. */
export function tokenDiagramma(s: SpecificaDiagramma): string {
  return `[diagramma: ${s.tipo} | valori: ${s.valori.trim()}${s.etichette ? ` | etichette: ${s.etichette.trim()}` : ""}]`;
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
