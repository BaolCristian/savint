"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { MathfieldElement } from "mathlive";
import { Button } from "@/components/ui/button";
import { withBasePath } from "@/lib/base-path";
import type { RisultatoFormula } from "./finestra-formula";

/** La traduzione di `\var{nome}` per MathLive.
 *
 * `\var{}` è una sostituzione del motore, non un comando LaTeX: senza
 * questa macro MathLive lo tratta da comando sconosciuto e disegna un
 * riquadro d'errore al posto del nome (misurato: `validateLatex` risponde
 * `unknown-command`). È deliberatamente la stessa traduzione che l'eco del
 * campo di testo insegna a KaTeX (`MACRO_ECO` in
 * `campo-testo-matematico.tsx`): le due superfici devono disegnare
 * `\var{a}` allo stesso modo, o l'una mentirebbe sull'altra.
 *
 * La macro serve a *disegnare*: il LaTeX che esce di qui resta `\var{a}`,
 * perché `getValue()` non espande le macro. È ciò che deve succedere — nel
 * testo dell'esercizio il motore si aspetta il comando, non la sua resa. */
const MACRO_VAR = "\\mathit{#1}";

/** Dove MathLive cerca i suoi venti font — una rete di sicurezza che di
 * norma non si tende mai.
 *
 * **Come stanno le cose davvero** (misurato dalla revisione finale, leggendo
 * il caricatore dentro `mathlive.min.mjs`): MathLive controlla per prime le
 * dodici famiglie `KaTeX_*` già presenti in `document.fonts`, e **se ci sono
 * tutte esce prima di leggere `fontsDirectory`**. In questa applicazione ci
 * sono sempre: `src/app/layout.tsx` importa `katex/dist/katex.min.css` nel
 * layout di RADICE, cioè su ogni pagina, e quel CSS dichiara esattamente
 * quelle dodici famiglie. I venti `.woff2` sotto `public/fonts/mathlive/`
 * sono per giunta identici byte per byte a quelli che katex già serve.
 * Quindi: in condizioni normali **nessuno di questi file viene mai
 * richiesto**, e in una scheda Rete non compare affatto — non «senza 404»,
 * proprio assente.
 *
 * **Perché la riga e i file restano lo stesso** (296 KB): senza di loro il
 * funzionamento della finestra dipenderebbe in silenzio da un import in un
 * file che non c'entra niente con lei. Il giorno in cui `layout.tsx`
 * smettesse di importare katex, le formule perderebbero i font e nessun test
 * lo direbbe. Costano nulla finché katex li precede, e coprono l'unico caso
 * in cui servono.
 *
 * **Come si verifica davvero che la catena regga** — non guardando la rete,
 * che per quanto sopra non dice niente:
 *
 * 1. che i file siano *serviti* sotto il prefisso di percorso lo dice
 *    `curl`, ed è un controllo vero:
 *    `BASE_PATH=/demo npm run build && BASE_PATH=/demo npx next start -p 3200`,
 *    poi `curl -sI http://localhost:3200/demo/fonts/mathlive/KaTeX_Main-Regular.woff2`
 *    deve dare `200` e `content-type: font/woff2`, e lo **stesso file senza
 *    il prefisso** deve dare `404` (si ferma il server per porta:
 *    `lsof -ti:3200 | xargs kill`);
 * 2. che la cartella sia quella giusta *quando serve* si vede solo togliendo
 *    chi la precede: si commenta l'import di `katex.min.css` in
 *    `src/app/layout.tsx`, si apre «Scrivi la formula» e si guarda
 *    `document.fonts` in console — devono comparire le dodici famiglie
 *    `KaTeX_*` caricate da `/fonts/mathlive/`. Se la cartella è sbagliata,
 *    MathLive mette la classe `ML__fonts-did-not-load` su `<body>` e la
 *    formula esce col carattere di sistema invece dei serif della
 *    matematica. Poi si rimette l'import.
 *
 * Il prefisso non si compone a mano: `withBasePath` è la fonte unica di
 * questa installazione (`__NEXT_ROUTER_BASEPATH` sul client, `BASE_PATH`
 * sul server), e i file stanno in `public/fonts/mathlive/`. */
const CARTELLA_FONT = "/fonts/mathlive";

export interface ContenutoFormulaProps {
  /** Il LaTeX di partenza: stringa vuota per una formula nuova. */
  iniziale: string;
  onChiudi: () => void;
  onConferma: (risultato: RisultatoFormula) => void;
}

/** Il contenuto della finestra: il campo di MathLive e le due azioni.
 *
 * Vive in un modulo a sé perché è **questo** l'unico che importa
 * `mathlive` — 843 KB — e `finestra-formula.tsx` lo carica solo quando la
 * finestra si apre. Un import di `mathlive` in un file che la pagina
 * importa direttamente annullerebbe il caricamento pigro senza che nessun
 * test lo dica: la sonda che lo sorveglia sta in
 * `__tests__/finestra-formula.test.tsx`.
 *
 * Il campo non è JSX ma un elemento creato a mano. Non è un vezzo: la
 * cartella dei font è una proprietà statica che MathLive legge mentre il
 * primo campo si connette al documento, e con un `<math-field>` in JSX
 * React lo connetterebbe prima che qualunque effetto possa impostarla —
 * i font partirebbero verso la cartella predefinita, una volta sola per
 * tutta la sessione. */
export function ContenutoFormula({ iniziale, onChiudi, onConferma }: ContenutoFormulaProps) {
  const t = useTranslations("esercizi.redazione.finestraFormula");
  const ospite = useRef<HTMLDivElement | null>(null);
  const campo = useRef<MathfieldElement | null>(null);
  const idEtichetta = useId();

  useEffect(() => {
    const contenitore = ospite.current;
    if (!contenitore) return;

    // Prima di far nascere il campo: vedi il commento su `CARTELLA_FONT`.
    MathfieldElement.fontsDirectory = withBasePath(CARTELLA_FONT);
    // Niente suoni. MathLive li cerca in `./sounds` — una cartella che non
    // esiste in questa installazione — al primo tasto della sua tastiera
    // virtuale: un 404 che si vedrebbe solo in produzione, cioè la stessa
    // famiglia di difetto dei font. I file non si spediscono perché quei
    // suoni servono alla tastiera su schermo, e questo è uno strumento da
    // scrivania, con una tastiera vera sotto le mani. `null` spegne il
    // giro alla radice: MathLive non prova nemmeno a scaricarli.
    MathfieldElement.soundsDirectory = null;

    const mathfield = new MathfieldElement();
    contenitore.append(mathfield);
    mathfield.macros = { ...mathfield.macros, var: MACRO_VAR };
    mathfield.value = iniziale;
    mathfield.setAttribute("aria-labelledby", idEtichetta);
    campo.current = mathfield;
    // Per ultimo: il fuoco è l'unica cosa qui dentro che tocchi il mondo
    // fuori dal campo, e il pulsante «Inserisci» deve funzionare anche se
    // quel giro andasse storto.
    mathfield.focus();

    // Il fuoco NON si toglie qui: quando React fa girare la pulizia degli
    // effetti di questo componente ha già staccato i suoi nodi dal
    // documento, e MathLive a quel punto ha già distrutto il campo — un
    // `blur()` non fa più niente (misurato: `isConnected: false`). Lo
    // toglie la finestra, che è il genitore e le cui pulizie girano prima
    // (vedi `congeda` in `finestra-formula.tsx`).
    return () => {
      mathfield.remove();
      campo.current = null;
    };
  }, [iniziale, idEtichetta]);

  function conferma() {
    const mathfield = campo.current;
    if (!mathfield) return;
    // Il LaTeX per il testo dell'esercizio, l'ASCIIMath per chi converte
    // verso JME: chiederlo dopo vorrebbe dire cambiare questa firma a
    // lavoro fatto.
    onConferma({ latex: mathfield.getValue(), asciiMath: mathfield.getValue("ascii-math") });
  }

  return (
    <div className="flex flex-col gap-4">
      <span id={idEtichetta} className="sr-only">
        {t("campo")}
      </span>
      <div ref={ospite} className="rounded-md border border-input p-2 text-lg" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onChiudi}>
          {t("annulla")}
        </Button>
        <Button type="button" onClick={conferma}>
          {t("inserisci")}
        </Button>
      </div>
    </div>
  );
}
