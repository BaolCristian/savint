"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CampoJme } from "./campo-jme";
import type { ParteEditor, Tolleranza } from "@/lib/esercizi/editor/modello";

type ParteNumericaEditor = Extract<ParteEditor, { tipo: "numerica" }>;

export interface ParteNumericaProps {
  parte: ParteNumericaEditor;
  onChange: (parte: ParteNumericaEditor) => void;
  onRimuovi: () => void;
  /** I nomi dichiarati nel pannello variabili: servono al cancello che
   * converte una formula disegnata verso JME, che senza di essi non può
   * distinguere una variabile vera da un nome nato per giustapposizione. */
  nomiVariabili: string[];
}

/** La parte numerica: valore atteso e tolleranza, mai `minValue`/`maxValue`
 * — quella traduzione appartiene al codice sotto (`versoNumbas`), il
 * docente non deve incontrarla qui (vedi il brief del Task 7). */
export function ParteNumerica({ parte, onChange, onRimuovi, nomiVariabili }: ParteNumericaProps) {
  const t = useTranslations("esercizi.redazione.parti");
  // `useId`, non costanti: questo componente è reso dentro un `map` sulle
  // parti (`editor-esercizio.tsx`), e due parti numeriche nello stesso
  // esercizio sono un caso supportato — tant'è che ciascuna porta il suo
  // «Parte N». Con `id` costanti le due parti li condividerebbero, e da
  // quegli `id` discendono ora anche `${id}-eco` e l'`aria-describedby` del
  // campo: il valore atteso della parte 2 risulterebbe descritto dall'eco
  // del motore della parte 1, cioè da un'informazione sbagliata. Lo stesso
  // vale per il `name` dei tre radio della tolleranza, che qui deriva dallo
  // stesso `id`: due gruppi omonimi sono per il browser un gruppo solo, e
  // scegliere «margine» nella parte 2 spegnerebbe la scelta della parte 1.
  const idBase = useId();
  const idValore = `${idBase}-valore`;
  const idMargine = `${idBase}-margine`;
  const idCifre = `${idBase}-cifre`;

  function aggiornaTolleranza(tolleranza: Tolleranza) {
    onChange({ ...parte, tolleranza });
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">{t("consegna")}</label>
        <Textarea value={parte.consegna} onChange={(e) => onChange({ ...parte, consegna: e.target.value })} />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex w-24 flex-col gap-1">
          <label className="text-sm font-medium">{t("punti")}</label>
          <Input
            type="number"
            min={1}
            value={parte.punti}
            onChange={(e) => onChange({ ...parte, punti: Number(e.target.value) })}
          />
        </div>
        <div className="flex-1">
          <CampoJme
            id={idValore}
            etichetta={t("numerica.valore")}
            valore={parte.valore}
            onChange={(valore) => onChange({ ...parte, valore })}
            tastierino
            assistenteFormula={{ nomiNoti: nomiVariabili }}
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("numerica.tolleranza")}</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name={`tolleranza-${idValore}`}
              checked={parte.tolleranza.tipo === "esatta"}
              onChange={() => aggiornaTolleranza({ tipo: "esatta" })}
            />
            {t("numerica.tolleranzaEsatta")}
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name={`tolleranza-${idValore}`}
              checked={parte.tolleranza.tipo === "margine"}
              onChange={() => aggiornaTolleranza({ tipo: "margine", margine: "" })}
            />
            {t("numerica.tolleranzaMargine")}
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name={`tolleranza-${idValore}`}
              checked={parte.tolleranza.tipo === "decimali"}
              onChange={() => aggiornaTolleranza({ tipo: "decimali", cifre: 2 })}
            />
            {t("numerica.tolleranzaDecimali")}
          </label>
        </div>

        {parte.tolleranza.tipo === "margine" && (
          <div className="max-w-40">
            {/* Nessun tastierino, e nessun assistente per le formule: il
                margine è una tolleranza, un decimale come `0.01` — `π`,
                `√`, `^` non si scrivono lì, e un editor visuale di formule
                non ha niente da disegnare. L'eco invece resta, come su ogni
                campo JME: anche una tolleranza va vista come il motore
                l'ha capita. */}
            <CampoJme
              id={idMargine}
              etichetta={t("numerica.margine")}
              valore={parte.tolleranza.margine}
              onChange={(margine) => aggiornaTolleranza({ tipo: "margine", margine })}
            />
          </div>
        )}

        {parte.tolleranza.tipo === "decimali" && (
          <div className="flex max-w-40 flex-col gap-1">
            <label htmlFor={idCifre} className="text-sm font-medium">
              {t("numerica.cifreDecimali")}
            </label>
            <Input
              id={idCifre}
              type="number"
              min={0}
              max={6}
              value={parte.tolleranza.cifre}
              onChange={(e) => aggiornaTolleranza({ tipo: "decimali", cifre: Number(e.target.value) })}
            />
          </div>
        )}
      </fieldset>

      <Button type="button" variant="outline" size="sm" onClick={onRimuovi}>
        {t("rimuovi")}
      </Button>
    </div>
  );
}
