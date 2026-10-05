"use client";

import { useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import { PulsanteImmagine } from "./pulsante-immagine";
import { PulsanteGrafico } from "./pulsante-grafico";
import { PulsanteDiagramma } from "./pulsante-diagramma";
import { PulsanteFigura } from "./pulsante-figura";
import { ContenutoHtml } from "@/components/esercizi/player/contenuto-html";
import { testoVersoHtml } from "@/lib/esercizi/editor/immagini-testo";
import { AvvisoFormulaSciolta } from "./avviso-formula-sciolta";
import { MacroFormula } from "@/components/esercizi/player/formula";
import { MACRO_ECO } from "./campo-testo-matematico";

export interface CampoConsegnaProps {
  valore: string;
  onChange: (valore: string) => void;
}

/** La consegna di una parte: un'area di testo, come prima, più i pulsanti
 * «Inserisci immagine», «… grafico», «… diagramma» e «… figura», che mettono il segnaposto dove
 * sta il cursore (in fondo, se il campo non è mai stato toccato). Comune alle
 * tre parti dell'editor. */
export function CampoConsegna({ valore, onChange }: CampoConsegnaProps) {
  const t = useTranslations("esercizi.redazione.parti");
  const tTesto = useTranslations("esercizi.redazione.campoTesto");
  const id = useId();
  const campo = useRef<HTMLTextAreaElement>(null);

  function inserisci(segnaposto: string) {
    const el = campo.current;
    const inizio = el?.selectionStart ?? valore.length;
    const fine = el?.selectionEnd ?? valore.length;
    onChange(valore.slice(0, inizio) + segnaposto + valore.slice(fine));
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">{t("consegna")}</label>
        <div className="flex flex-wrap justify-end gap-1.5">
          <PulsanteImmagine onInserisci={inserisci} />
          <PulsanteGrafico onInserisci={inserisci} />
          <PulsanteDiagramma onInserisci={inserisci} />
          <PulsanteFigura onInserisci={inserisci} />
        </div>
      </div>
      <Textarea id={id} ref={campo} value={valore} onChange={(e) => onChange(e.target.value)} />
      {/* Come per il testo dell'esercizio: la consegna così come la vedrà lo
          studente, e un avviso se c'è una formula fuori da \( \). Senza, un
          «3*x^2-6=0» scritto come testo si scopriva solo nell'anteprima. */}
      {valore.trim() !== "" && (
        <div className="mt-1 space-y-1 text-sm text-muted-foreground">
          <p>{tTesto("comeSiVedra")}</p>
          <div className="text-foreground">
            <MacroFormula.Provider value={MACRO_ECO}>
              <ContenutoHtml html={`<p>${testoVersoHtml(valore)}</p>`} />
            </MacroFormula.Provider>
          </div>
          <AvvisoFormulaSciolta testo={valore} />
        </div>
      )}
    </div>
  );
}
