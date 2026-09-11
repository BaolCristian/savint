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
        [Symbol.iterator]: function* () {},
      },
    });
  }
}
