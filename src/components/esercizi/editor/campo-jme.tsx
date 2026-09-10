"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Formula } from "@/components/esercizi/player/formula";
import { SIMBOLI, type SimboloTastiera } from "@/components/esercizi/player/parti/espressione";
import { ecoDi } from "./eco-jme";

export interface CampoJmeProps {
  id: string;
  etichetta: string;
  valore: string;
  onChange: (v: string) => void;
  /** Il tastierino compare solo dove serve davvero: non sotto ogni campo. */
  tastierino?: boolean;
  aiuto?: string;
}

/** Un campo JME: l'etichetta, il campo di testo, opzionalmente la tastiera
 * di simboli dello studente (`tastierino`), ed **sempre** l'eco del motore
 * — come il motore ha capito ciò che è scritto, calcolata con `ecoDi` (vedi
 * `eco-jme.tsx`).
 *
 * L'eco in stato d'errore non è mai rossa e allarmante mentre si scrive:
 * quasi ogni prefisso di un'espressione valida non lo è a sua volta
 * (`"12*x^"` non compila, ma è solo a metà), quindi uno stato d'errore
 * mentre il campo ha ancora il fuoco è la norma, non l'eccezione. Resta
 * discreta (`text-muted-foreground`) finché il campo scrive; diventa un
 * avviso (`text-destructive`) solo dopo che ha perso il fuoco — il momento
 * in cui il docente ha finito, e un'espressione ancora sgrammaticata è
 * davvero un problema da vedere. */
export function CampoJme({ id, etichetta, valore, onChange, tastierino = false, aiuto }: CampoJmeProps) {
  const t = useTranslations("esercizi");
  const tCampo = useTranslations("esercizi.redazione.campoJme");
  const [haFocus, setHaFocus] = useState(false);
  const campoRef = useRef<HTMLInputElement>(null);
  // Stesso motivo del gemello in `player/parti/espressione.tsx`: il cursore
  // va spostato dopo che `valore` è arrivato dal genitore e il campo si è
  // ridisegnato col nuovo testo, non prima (verrebbe sovrascritto).
  const posizioneCaretInSospeso = useRef<number | null>(null);

  useEffect(() => {
    const posizione = posizioneCaretInSospeso.current;
    if (posizione !== null && campoRef.current) {
      campoRef.current.setSelectionRange(posizione, posizione);
      posizioneCaretInSospeso.current = null;
    }
  }, [valore]);

  const esito = ecoDi(valore);

  function inserisciSimbolo(simbolo: SimboloTastiera) {
    const campo = campoRef.current;
    const inizio = campo?.selectionStart ?? valore.length;
    const fine = campo?.selectionEnd ?? valore.length;
    const nuovoTesto = valore.slice(0, inizio) + simbolo.inserisci + valore.slice(fine);
    posizioneCaretInSospeso.current = inizio + simbolo.offsetCaret;
    onChange(nuovoTesto);
    campo?.focus();
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {etichetta}
      </label>

      {tastierino && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("tastieraSimboli")}>
          {SIMBOLI.map((simbolo) => (
            <button
              key={simbolo.id}
              type="button"
              aria-label={t(simbolo.chiaveEtichetta)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => inserisciSimbolo(simbolo)}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-input text-base font-medium transition-colors hover:bg-accent"
            >
              {simbolo.glifo}
            </button>
          ))}
        </div>
      )}

      <Input
        id={id}
        ref={campoRef}
        inputMode="text"
        autoComplete="off"
        value={valore}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setHaFocus(true)}
        onBlur={() => setHaFocus(false)}
      />

      {aiuto && <p className="text-xs text-muted-foreground">{aiuto}</p>}

      {esito.stato === "reso" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{tCampo("interpretatoCome")}</span>
          <Formula tex={esito.latex} />
        </div>
      )}

      {esito.stato === "errore" && (
        <p className={cn("text-xs", haFocus ? "text-muted-foreground" : "text-destructive")}>{esito.messaggio}</p>
      )}
    </div>
  );
}
