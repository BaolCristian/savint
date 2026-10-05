"use client";

import { useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import { PulsanteImmagine } from "./pulsante-immagine";
import { PulsanteGrafico } from "./pulsante-grafico";

export interface CampoConsegnaProps {
  valore: string;
  onChange: (valore: string) => void;
}

/** La consegna di una parte: un'area di testo, come prima, più i pulsanti
 * «Inserisci immagine» e «Inserisci grafico», che mettono il segnaposto dove
 * sta il cursore (in fondo, se il campo non è mai stato toccato). Comune alle
 * tre parti dell'editor. */
export function CampoConsegna({ valore, onChange }: CampoConsegnaProps) {
  const t = useTranslations("esercizi.redazione.parti");
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
        <div className="flex gap-1.5">
          <PulsanteImmagine onInserisci={inserisci} />
          <PulsanteGrafico onInserisci={inserisci} />
        </div>
      </div>
      <Textarea id={id} ref={campo} value={valore} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
