"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Formula } from "@/components/esercizi/player/formula";
import { TastieraSimboli, useTastieraSimboli } from "@/components/esercizi/tastiera-simboli";
import { ecoDi } from "./eco-jme";

export interface CampoJmeProps {
  id: string;
  etichetta: string;
  valore: string;
  onChange: (v: string) => void;
  /** Il tastierino compare solo dove serve davvero: non sotto ogni campo. */
  tastierino?: boolean;
  aiuto?: string;
  /** Il campo è sbagliato per una ragione che il chiamante conosce e l'eco
   * no — una definizione vuota accanto a un nome compilato, per esempio: per
   * `ecoDi` è solo un campo vuoto, per il pannello è un errore. Segna il
   * campo come `aria-invalid`, che è anche ciò che gli dà il bordo rosso
   * (`input.tsx`). L'eco d'errore ha già il suo canale, sotto: i due non si
   * sovrappongono mai (dove l'eco parla, il campo non è vuoto). */
  invalido?: boolean;
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
 * davvero un problema da vedere. Nello stesso momento, e per la stessa
 * ragione, il campo diventa `aria-invalid`: il bordo rosso e l'avviso sono
 * lo stesso fatto detto due volte, e devono accendersi insieme.
 *
 * L'eco è legata al campo con `aria-describedby`, non annunciata da sola:
 * cambia a ogni tasto premuto, e un `aria-live` la farebbe leggere a voce
 * dopo ogni lettera, coprendo ciò che il docente sta scrivendo. Come
 * descrizione del campo resta invece disponibile quando serve, cioè quando
 * ci si ferma sopra. */
export function CampoJme({
  id,
  etichetta,
  valore,
  onChange,
  tastierino = false,
  aiuto,
  invalido = false,
}: CampoJmeProps) {
  const tCampo = useTranslations("esercizi.redazione.campoJme");
  const [haFocus, setHaFocus] = useState(false);
  const { campoRef, inserisciSimbolo } = useTastieraSimboli(valore, onChange);

  const esito = ecoDi(valore);
  const idEco = `${id}-eco`;
  const idAiuto = `${id}-aiuto`;
  const descrizioni = [aiuto ? idAiuto : null, esito.stato === "vuoto" ? null : idEco].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {etichetta}
      </label>

      {tastierino && <TastieraSimboli onInserisci={inserisciSimbolo} />}

      <Input
        id={id}
        ref={campoRef}
        inputMode="text"
        autoComplete="off"
        value={valore}
        aria-invalid={invalido || (esito.stato === "errore" && !haFocus)}
        aria-describedby={descrizioni || undefined}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setHaFocus(true)}
        onBlur={() => setHaFocus(false)}
      />

      {aiuto && (
        <p id={idAiuto} className="text-xs text-muted-foreground">
          {aiuto}
        </p>
      )}

      {esito.stato === "reso" && (
        <div id={idEco} className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{tCampo("interpretatoCome")}</span>
          <Formula tex={esito.latex} />
        </div>
      )}

      {esito.stato === "errore" && (
        <p id={idEco} className={cn("text-xs", haFocus ? "text-muted-foreground" : "text-destructive")}>
          {esito.messaggio}
        </p>
      )}
    </div>
  );
}
