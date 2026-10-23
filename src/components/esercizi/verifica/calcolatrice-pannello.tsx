"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Delete, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { valuta } from "./calcolatrice";

export interface CalcolatricePannelloProps {
  aperto: boolean;
  onChiudi: () => void;
}

type Esito = { ok: true; valore: number } | { ok: false } | null;

/** La calcolatrice della prova: un pannello sovrapposto `fixed`, così resta
 * visibile anche con la prova a schermo intero. Si può scrivere nel campo o
 * premere i tasti; «=» (o Invio) calcola con il parser di `calcolatrice.ts`. */
export function CalcolatricePannello({ aperto, onChiudi }: CalcolatricePannelloProps) {
  const t = useTranslations("esercizi.provaStudente");
  const locale = useLocale();
  const [espressione, setEspressione] = useState("");
  const [esito, setEsito] = useState<Esito>(null);

  if (!aperto) return null;

  const virgola = locale === "it" ? "," : ".";
  const formato = new Intl.NumberFormat(locale === "it" ? "it-IT" : "en-GB", {
    maximumFractionDigits: 10,
    useGrouping: false,
  });

  function aggiungi(s: string) {
    setEspressione((e) => e + s);
    setEsito(null);
  }

  function calcola() {
    setEsito(valuta(espressione));
  }

  const tasti: string[][] = [
    ["(", ")", "%", "÷"],
    ["7", "8", "9", "×"],
    ["4", "5", "6", "−"],
    ["1", "2", "3", "+"],
    ["0", virgola, "^", "√"],
  ];

  return (
    <div
      role="dialog"
      aria-label={t("calcolatrice")}
      className="fixed bottom-4 right-4 z-50 w-72 max-w-[calc(100vw-2rem)] space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">{t("calcolatrice")}</h2>
        <Button type="button" variant="ghost" size="icon" aria-label={t("chiudiCalcolatrice")} onClick={onChiudi}>
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <label className="sr-only" htmlFor="calcolatrice-espressione">
        {t("espressione")}
      </label>
      <input
        id="calcolatrice-espressione"
        className="h-11 w-full rounded-md border border-slate-300 px-3 text-right font-mono text-lg"
        inputMode="decimal"
        autoComplete="off"
        value={espressione}
        onChange={(e) => {
          setEspressione(e.target.value);
          setEsito(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            calcola();
          }
        }}
      />
      <output
        aria-label={t("risultato")}
        aria-live="polite"
        className="block min-h-7 text-right font-mono text-xl font-semibold tabular-nums text-slate-900"
      >
        {esito?.ok === true && formato.format(esito.valore)}
        {esito?.ok === false && <span className="text-sm font-normal text-destructive">{t("erroreCalcolo")}</span>}
      </output>
      <div className="grid grid-cols-4 gap-2">
        {tasti.flat().map((tasto) => (
          <Button key={tasto} type="button" variant="outline" className="min-h-11 text-base" onClick={() => aggiungi(tasto)}>
            {tasto}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          aria-label={t("cancellaTutto")}
          onClick={() => {
            setEspressione("");
            setEsito(null);
          }}
        >
          C
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          aria-label={t("cancellaUltimo")}
          onClick={() => {
            setEspressione((e) => e.slice(0, -1));
            setEsito(null);
          }}
        >
          <Delete aria-hidden="true" className="size-4" />
        </Button>
        <Button type="button" className="col-span-2 min-h-11 text-base" onClick={calcola}>
          =
        </Button>
      </div>
    </div>
  );
}
