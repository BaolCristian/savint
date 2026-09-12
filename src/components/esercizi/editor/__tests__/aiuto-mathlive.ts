import { screen, waitFor } from "@testing-library/react";
import type { MathfieldElement } from "mathlive";

/** Cinque cose che MathLive usa e che jsdom non ha.
 *
 * Non è una comodità: senza di esse il costruttore del campo lancia, il
 * campo non nasce, e `getValue()` si limita a restituire la stringa che gli
 * è stata data. Una prova sul giro attraverso il parser di MathLive
 * sarebbe allora una finta — resterebbe verde anche se la macro `\var` non
 * fosse registrata affatto. Misurate una per una sul costruttore di
 * `MathfieldElement` 0.110.0:
 *
 * - `ResizeObserver` e `matchMedia` servono alla tastiera virtuale, che
 *   MathLive monta su `window` al caricamento del modulo: se il suo
 *   costruttore lancia, `window.mathVirtualKeyboard` resta `null` e il
 *   campo lancia a sua volta mentre si connette;
 * - `document.fonts` e `FontFace` servono al caricamento dei font;
 * - `scrollIntoView` serve a MathLive quando il campo prende il fuoco.
 *
 * I font qui NON si caricano davvero (`FontFace` è un guscio vuoto): che
 * arrivino sotto gli occhi del docente lo dice solo una prova a mano nel
 * browser — vedi la nota in `finestra-formula-contenuto.tsx`.
 *
 * Va chiamata al livello di modulo del file di prova, prima che un test
 * possa far nascere un campo: `document.fonts` deve esistere già quando
 * MathLive si connette. */
/** Le dodici famiglie che MathLive cerca in `document.fonts` prima di
 * decidere se scaricarne i file (copiate dal suo `loadFonts`). */
const FAMIGLIE_KATEX = [
  "KaTeX_Main",
  "KaTeX_Math",
  "KaTeX_AMS",
  "KaTeX_Caligraphic",
  "KaTeX_Fraktur",
  "KaTeX_SansSerif",
  "KaTeX_Script",
  "KaTeX_Typewriter",
  "KaTeX_Size1",
  "KaTeX_Size2",
  "KaTeX_Size3",
  "KaTeX_Size4",
];

export function preparaJsdomPerMathlive(): void {
  const globali = globalThis as unknown as Record<string, unknown>;

  if (typeof globali.ResizeObserver !== "function") {
    globali.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  // jsdom dichiara `matchMedia` senza implementarla: qui non basta
  // controllare che la chiave ci sia, va controllato che sia chiamabile.
  if (typeof globali.matchMedia !== "function") {
    globali.matchMedia = () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    });
  }

  if (typeof globali.FontFace !== "function") {
    globali.FontFace = class {
      load() {
        return Promise.resolve(this);
      }
    };
  }

  // jsdom non implementa lo scorrimento: MathLive lo usa per tenere in
  // vista il punto in cui si scrive, quando il campo prende il fuoco.
  const elemento = Element.prototype as unknown as Record<string, unknown>;
  for (const metodo of ["scrollIntoView", "scroll", "scrollTo", "scrollBy"]) {
    if (typeof elemento[metodo] !== "function") elemento[metodo] = () => {};
  }

  if (!document.fonts) {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        ready: Promise.resolve(),
        add() {},
        // Le famiglie si dichiarano già presenti, ed è il modo di tenere
        // pulito l'output delle prove: trovandole, MathLive salta il
        // caricamento: altrimenti proverebbe a risolvere la cartella dei
        // font con un `fetch` sul proprio file — che in jsdom è un
        // `file://`, fallisce, e stampa un `Invalid URL` a ogni apertura
        // della finestra. Rumore che nasconderebbe il prossimo errore
        // vero. Qui i font non si caricherebbero comunque (`FontFace` è un
        // guscio), e la prova sulla cartella guarda `fontsDirectory` —
        // cioè quel che il browser chiederebbe — non il caricamento.
        [Symbol.iterator]: function* () {
          for (const famiglia of FAMIGLIE_KATEX) yield { family: famiglia };
        },
      },
    });
  }
}

/** Il campo di MathLive dentro la finestra aperta adesso.
 *
 * Il pezzo che contiene MathLive arriva a parte (`dynamic()`), quindi fra
 * il clic che apre la finestra e la nascita del campo passa almeno un giro
 * d'orologio: cercarlo subito non lo troverebbe. Si cerca **dentro la
 * finestra**, non in tutto il documento: la finestra vive in un portale
 * fuori dal contenitore della resa, e una ricerca larga potrebbe trovare il
 * campo di un'altra resa rimasta appesa.
 *
 * Sta qui e non in ogni file di prova perché i campi che aprono questa
 * finestra sono più d'uno, e tre copie di questa attesa divergerebbero. */
export async function campoFormulaAperto(): Promise<MathfieldElement> {
  const finestra = await screen.findByRole("dialog");
  return await waitFor(() => {
    const campo = finestra.querySelector<MathfieldElement>("math-field");
    if (!campo) throw new Error("il campo delle formule non è nella finestra");
    return campo;
  });
}
