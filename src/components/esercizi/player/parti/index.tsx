"use client";

import type { Answer, PartType } from "@savint/engine";
import { ContenutoHtml } from "../contenuto-html";
import { InputNumero } from "./numero";
import { InputSceltaSingola } from "./scelta-singola";
import { InputSceltaMultipla } from "./scelta-multipla";
import { InputGriglia } from "./griglia";
import { InputTesto } from "./testo";
import { InputEspressione } from "./espressione";
import { InputGapfill } from "./gapfill";

/** La forma di una parte esposta al player: HTML già pronto (variabili già
 * sostituite da chi costruisce questo oggetto), mai da sostituire qui. */
export interface PartePubblica {
  path: string;
  type: PartType;
  promptHtml: string;
  marks: number;
  /** 1_n_2, m_n_2: gli HTML delle scelte, nell'ordine del docente. */
  scelte?: string[];
  /** 1_n_2, m_n_2: l'ordine in cui MOSTRARLE a questo studente (indici
   * originali, dal mescolamento del motore, `shuffleAnswers`). Le risposte
   * restano sempre nell'ordine originale. Assente: l'ordine del docente. */
  ordine?: number[];
  /** m_n_x: le scelte (righe). */
  righe?: string[];
  /** m_n_x: le risposte (colonne). */
  colonne?: string[];
  /** gapfill: una parte per spazio da riempire. */
  gaps?: PartePubblica[];
}

export interface InputParteProps {
  parte: PartePubblica;
  valore: Answer;
  onChange: (v: Answer) => void;
  disabilitato: boolean;
  /** Vero per uno spazio di un `gapfill` reso al posto del suo segnaposto
   * `[[n]]`, in mezzo al testo del prompt: i contenitori diventano `span` e
   * il campo si restringe, così la riga continua a leggersi come una frase
   * invece di spezzarsi. */
  inLinea?: boolean;
}

/** Dispatcher: rende il prompt una volta sola, poi il campo di input del
 * tipo giusto. I singoli campi non ripetono il prompt.
 *
 * Il `gapfill` è l'eccezione: il suo prompt contiene i segnaposti degli
 * spazi, quindi è `InputGapfill` a renderlo — testo e campi si intrecciano e
 * non si possono mettere uno sopra l'altro. */
export function InputParte(props: InputParteProps) {
  const { parte, inLinea } = props;

  if (parte.type === "gapfill") {
    return (
      <div className="space-y-2" data-parte={parte.path}>
        <InputGapfill {...props} />
      </div>
    );
  }

  if (inLinea) {
    return (
      <span className="inline-flex items-center gap-2 align-middle" data-parte={parte.path}>
        <ContenutoHtml html={parte.promptHtml} />
        {campo(props)}
      </span>
    );
  }

  return (
    <div className="space-y-2" data-parte={parte.path}>
      <ContenutoHtml html={parte.promptHtml} />
      {campo(props)}
    </div>
  );
}

function campo(props: InputParteProps) {
  switch (props.parte.type) {
    case "numberentry":
      return <InputNumero {...props} />;
    case "patternmatch":
      return <InputTesto {...props} />;
    case "jme":
      return <InputEspressione {...props} />;
    case "1_n_2":
      return <InputSceltaSingola {...props} />;
    case "m_n_2":
      return <InputSceltaMultipla {...props} />;
    case "m_n_x":
      return <InputGriglia {...props} />;
    case "information":
      return null;
    default:
      return null;
  }
}
