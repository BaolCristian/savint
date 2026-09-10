"use client";

import { useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { renderLatex } from "@savint/engine";
import { Input } from "@/components/ui/input";
import { Formula } from "../formula";
import type { InputParteProps } from "./index";

/** Un tasto della tastiera di simboli: `inserisci` è il testo che finisce
 * nel campo, `offsetCaret` dove va il cursore dopo, contato dall'inizio del
 * testo inserito (non dalla fine): per un tasto come `^` è 1, la lunghezza
 * di tutto ciò che si inserisce; per una funzione come `sqrt()` è 5, cioè
 * subito dopo la parentesi aperta, in modo da poter scrivere l'argomento
 * senza dover spostare il cursore a mano. */
/** Esportati per riuso in `editor/campo-jme.tsx`: stessa tastiera di
 * simboli, stessa lista, non una seconda copia. */
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
 * telefono). */
export const SIMBOLI: SimboloTastiera[] = [
  { id: "potenza", glifo: "x²", chiaveEtichetta: "tastoPotenza", inserisci: "^", offsetCaret: 1 },
  { id: "radice", glifo: "√", chiaveEtichetta: "tastoRadice", inserisci: "sqrt()", offsetCaret: 5 },
  { id: "frazione", glifo: "/", chiaveEtichetta: "tastoFrazione", inserisci: "/", offsetCaret: 1 },
  { id: "pi-greco", glifo: "π", chiaveEtichetta: "tastoPiGreco", inserisci: "pi", offsetCaret: 2 },
  { id: "parentesi", glifo: "()", chiaveEtichetta: "tastoParentesi", inserisci: "()", offsetCaret: 1 },
];

/** `jme`: la risposta è un'espressione matematica in sintassi JME, testo
 * libero (lettere, operatori, parentesi: non un `inputMode` numerico).
 *
 * Solo la variante non in linea ha la tastiera di simboli e l'anteprima:
 * quella in linea sta in mezzo alla frase di un gapfill, dove una riga di
 * tasti romperebbe l'impaginazione (vedi `numero.tsx` per lo stesso
 * ragionamento sul contenitore `span`). */
export function InputEspressione({ parte, valore, onChange, disabilitato, inLinea }: InputParteProps) {
  const t = useTranslations("esercizi");
  const id = `campo-${parte.path}`;
  const testo = typeof valore === "string" ? valore : "";
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
  }, [testo]);

  // Il motore lancia sulla maggior parte dei prefissi non validi ("12*x^" lo
  // è, come ogni suo prefisso), ma non su tutti: `sqrt()` (l'argomento
  // mancante appena premuto il tasto radice, prima che lo studente scriva
  // qualcosa) non lancia e produce invece "\sqrt{ undefined }" — un buco
  // del motore che non si può chiudere da qui (non si tocca
  // `packages/engine`). Si scarta anche questo caso, non solo quello che
  // lancia: mostrare la parola "undefined" dentro una radice sarebbe un
  // errore del motore travestito da anteprima.
  const anteprimaLatex = useMemo(() => {
    const espressione = testo.trim();
    if (!espressione) return null;
    try {
      const latex = renderLatex(espressione);
      return /\bundefined\b/.test(latex) ? null : latex;
    } catch {
      return null;
    }
  }, [testo]);

  function inserisciSimbolo(simbolo: SimboloTastiera) {
    const campo = campoRef.current;
    const inizio = campo?.selectionStart ?? testo.length;
    const fine = campo?.selectionEnd ?? testo.length;
    const nuovoTesto = testo.slice(0, inizio) + simbolo.inserisci + testo.slice(fine);
    posizioneCaretInSospeso.current = inizio + simbolo.offsetCaret;
    onChange(nuovoTesto);
    // Il cursore torna al campo: lo studente continua a scrivere senza
    // dover ricliccare, il tasto non deve "rubare" il focus in modo
    // permanente (vedi anche l'`onMouseDown` sul tasto, sotto).
    campo?.focus();
  }

  const contenuto = (
    <>
      <label htmlFor={id} className="sr-only">
        {t("rispostaEspressione")}
      </label>
      <Input
        id={id}
        ref={campoRef}
        inputMode="text"
        autoComplete="off"
        placeholder={inLinea ? undefined : t("segnapostoEspressione")}
        className={inLinea ? "w-40" : undefined}
        value={testo}
        disabled={disabilitato}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );

  if (inLinea) {
    // Vedi `numero.tsx`: in linea il contenitore è uno `span`, perché il
    // campo sta dentro la frase del prompt di un gapfill.
    return <span className="inline-flex items-center gap-2 align-middle">{contenuto}</span>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("tastieraSimboli")}>
        {SIMBOLI.map((simbolo) => (
          <button
            key={simbolo.id}
            type="button"
            aria-label={t(simbolo.chiaveEtichetta)}
            disabled={disabilitato}
            // Impedisce al tasto di rubare il focus dal campo: senza
            // questo, il `mousedown` sposterebbe il focus prima ancora del
            // `click`, e il cursore nel campo non sarebbe più affidabile.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => inserisciSimbolo(simbolo)}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-input text-base font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          >
            {simbolo.glifo}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">{contenuto}</div>
      {anteprimaLatex !== null && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{t("anteprimaEspressione")}</span>
          <Formula tex={anteprimaLatex} />
        </div>
      )}
    </div>
  );
}
