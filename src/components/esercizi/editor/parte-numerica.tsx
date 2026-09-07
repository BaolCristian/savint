"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ParteEditor, Tolleranza } from "@/lib/esercizi/editor/modello";

type ParteNumericaEditor = Extract<ParteEditor, { tipo: "numerica" }>;

export interface ParteNumericaProps {
  parte: ParteNumericaEditor;
  onChange: (parte: ParteNumericaEditor) => void;
  onRimuovi: () => void;
}

/** La parte numerica: valore atteso e tolleranza, mai `minValue`/`maxValue`
 * — quella traduzione appartiene al codice sotto (`versoNumbas`), il
 * docente non deve incontrarla qui (vedi il brief del Task 7). */
export function ParteNumerica({ parte, onChange, onRimuovi }: ParteNumericaProps) {
  const t = useTranslations("esercizi.redazione.parti");
  const idValore = "parte-numerica-valore";
  const idMargine = "parte-numerica-margine";
  const idCifre = "parte-numerica-cifre";

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
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={idValore} className="text-sm font-medium">
            {t("numerica.valore")}
          </label>
          <Input id={idValore} value={parte.valore} onChange={(e) => onChange({ ...parte, valore: e.target.value })} />
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
          <div className="flex max-w-40 flex-col gap-1">
            <label htmlFor={idMargine} className="text-sm font-medium">
              {t("numerica.margine")}
            </label>
            <Input
              id={idMargine}
              value={parte.tolleranza.margine}
              onChange={(e) => aggiornaTolleranza({ tipo: "margine", margine: e.target.value })}
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
