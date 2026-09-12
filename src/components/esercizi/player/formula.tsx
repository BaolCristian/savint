"use client";

import katex from "katex";
import { createContext, useContext, useMemo } from "react";
import { proteggiTextrm } from "./proteggi-textrm";

/** Le macro che KaTeX deve conoscere mentre rende le formule di questo
 * sottoalbero — vuoto dappertutto tranne dove qualcuno lo dichiara.
 *
 * Serve a una sola superficie, l'eco del docente, che deve disegnare un
 * `\var{}` ancora da sostituire invece di rifiutarlo. Sta in un contesto e
 * non in una prop perché fra l'eco e questa `Formula` ci sono quattro
 * funzioni di `contenuto-html.tsx` — il file dello studente — che di macro
 * non hanno alcun bisogno: infilarci un parametro attraverso le
 * attraverserebbe tutte e quattro per un bisogno che non è loro.
 *
 * Il valore di partenza è `undefined`, e senza un fornitore le opzioni
 * passate a KaTeX restano identiche a prima, byte per byte. Questo è
 * deliberato: un `\var{}` che arrivasse allo studente sarebbe un difetto
 * del motore — la sostituzione non è avvenuta — e deve vedersi come
 * riquadro rumoroso, non nascondersi dietro una lettera in corsivo
 * plausibile. */
export const MacroFormula = createContext<Readonly<Record<string, string>> | undefined>(undefined);

export interface FormulaProps {
  /** Il LaTeX prodotto dal motore. */
  tex: string;
  /** Formula centrata su riga propria invece che nel testo. */
  display?: boolean;
}

/** Rende una formula con KaTeX. Non lancia mai: se il LaTeX non è
 * renderizzabile nemmeno dopo la protezione, mostra il sorgente. */
export function Formula({ tex, display = false }: FormulaProps) {
  const macro = useContext(MacroFormula);
  const reso = useMemo(() => {
    try {
      return katex.renderToString(proteggiTextrm(tex), {
        displayMode: display,
        throwOnError: true,
        strict: "ignore",
        // Una copia a ogni resa: un `\gdef` nel sorgente farebbe scrivere
        // KaTeX dentro la tabella che riceve, e una tabella condivisa
        // accumulerebbe definizioni da una formula all'altra.
        ...(macro ? { macros: { ...macro } } : {}),
      });
    } catch {
      return null;
    }
  }, [tex, display, macro]);

  if (reso === null) {
    return <code className="rounded bg-muted px-1 py-0.5 text-sm">{tex}</code>;
  }
  return <span dangerouslySetInnerHTML={{ __html: reso }} />;
}
