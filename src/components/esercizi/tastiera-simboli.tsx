"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useTranslations } from "next-intl";

/** Un tasto della tastiera di simboli: `inserisci` è il testo che finisce
 * nel campo, `offsetCaret` dove va il cursore dopo, contato dall'inizio del
 * testo inserito (non dalla fine): per un tasto come `^` è 1, la lunghezza
 * di tutto ciò che si inserisce; per una funzione come `sqrt()` è 5, cioè
 * subito dopo la parentesi aperta, in modo da poter scrivere l'argomento
 * senza dover spostare il cursore a mano. */
export interface SimboloTastiera {
  id: string;
  glifo: string;
  chiaveEtichetta: "tastoPotenza" | "tastoRadice" | "tastoFrazione" | "tastoPiGreco" | "tastoParentesi";
  inserisci: string;
  offsetCaret: number;
}

/** I cinque simboli che uno studente delle superiori cerca davvero quando
 * scrive un'espressione algebrica (vedi `content/esercizi/`: potenze,
 * radici, frazioni, π, parentesi ricorrono in ogni anno; il resto della
 * sintassi JME — `+`, `-`, `*`, cifre, lettere — sta già sulla tastiera del
 * telefono).
 *
 * `readonly`: la lista è condivisa fra due superfici (lo studente che
 * risponde e il docente che redige), e una superficie che la mutasse
 * cambierebbe la tastiera dell'altra senza che nessun test lo dica. */
export const SIMBOLI: readonly SimboloTastiera[] = [
  { id: "potenza", glifo: "x²", chiaveEtichetta: "tastoPotenza", inserisci: "^", offsetCaret: 1 },
  { id: "radice", glifo: "√", chiaveEtichetta: "tastoRadice", inserisci: "sqrt()", offsetCaret: 5 },
  { id: "frazione", glifo: "/", chiaveEtichetta: "tastoFrazione", inserisci: "/", offsetCaret: 1 },
  { id: "pi-greco", glifo: "π", chiaveEtichetta: "tastoPiGreco", inserisci: "pi", offsetCaret: 2 },
  { id: "parentesi", glifo: "()", chiaveEtichetta: "tastoParentesi", inserisci: "()", offsetCaret: 1 },
];

export interface TastieraSimboliAgganci {
  /** Va sul campo di testo servito dalla tastiera. */
  campoRef: RefObject<HTMLInputElement | null>;
  /** Da passare a `TastieraSimboli` come `onInserisci`. */
  inserisciSimbolo: (simbolo: SimboloTastiera) => void;
}

/** Il comportamento del cursore per un campo servito dalla tastiera di
 * simboli: il simbolo entra dove sta il cursore (non in fondo al campo) e il
 * cursore resta dove serve continuare a scrivere — dentro le parentesi di
 * `sqrt()`, subito dopo il `^`.
 *
 * Sta in un hook, e non ricopiato in ogni chiamante, proprio perché è
 * *stato locale*: due `useRef` e un `useEffect` che nessuno dei due
 * chiamanti deve conoscere. Incapsularlo è ciò per cui esistono gli hook
 * personalizzati; averne due copie significherebbe correggere il cursore in
 * una sola delle due superfici, senza che nessun test dica che l'altra è
 * rimasta indietro. */
export function useTastieraSimboli(valore: string, onChange: (v: string) => void): TastieraSimboliAgganci {
  const campoRef = useRef<HTMLInputElement>(null);
  // Il cursore va spostato dopo che `valore` è arrivato dal genitore e il
  // campo si è ridisegnato col nuovo testo: impostarlo subito, prima del
  // ridisegno, verrebbe sovrascritto dal valore ancora vecchio.
  const posizioneCaretInSospeso = useRef<number | null>(null);

  useEffect(() => {
    const posizione = posizioneCaretInSospeso.current;
    if (posizione !== null && campoRef.current) {
      campoRef.current.setSelectionRange(posizione, posizione);
      posizioneCaretInSospeso.current = null;
    }
  }, [valore]);

  function inserisciSimbolo(simbolo: SimboloTastiera) {
    const campo = campoRef.current;
    const inizio = campo?.selectionStart ?? valore.length;
    const fine = campo?.selectionEnd ?? valore.length;
    const nuovoTesto = valore.slice(0, inizio) + simbolo.inserisci + valore.slice(fine);
    posizioneCaretInSospeso.current = inizio + simbolo.offsetCaret;
    onChange(nuovoTesto);
    // Il cursore torna al campo: chi scrive continua senza dover ricliccare,
    // il tasto non deve "rubare" il focus in modo permanente (vedi anche
    // l'`onMouseDown` sul tasto, sotto).
    campo?.focus();
  }

  return { campoRef, inserisciSimbolo };
}

export interface TastieraSimboliProps {
  onInserisci: (simbolo: SimboloTastiera) => void;
  disabilitato?: boolean;
}

/** La riga dei cinque tasti, identica ovunque compaia: è la stessa tastiera
 * che vede lo studente, e il docente che redige l'esercizio deve poter
 * scrivere la risposta attesa con gli stessi gesti con cui la scriverà lui. */
export function TastieraSimboli({ onInserisci, disabilitato }: TastieraSimboliProps) {
  const t = useTranslations("esercizi");
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("tastieraSimboli")}>
      {SIMBOLI.map((simbolo) => (
        <button
          key={simbolo.id}
          type="button"
          aria-label={t(simbolo.chiaveEtichetta)}
          disabled={disabilitato}
          // Impedisce al tasto di rubare il focus dal campo: senza questo, il
          // `mousedown` sposterebbe il focus prima ancora del `click`, e il
          // cursore nel campo non sarebbe più affidabile.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInserisci(simbolo)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-input text-base font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
        >
          {simbolo.glifo}
        </button>
      ))}
    </div>
  );
}
