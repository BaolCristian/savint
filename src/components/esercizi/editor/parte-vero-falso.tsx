"use client";

import { CampoConsegna } from "./campo-consegna";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ParteEditor } from "@/lib/esercizi/editor/modello";

type ParteVeroFalsoEditor = Extract<ParteEditor, { tipo: "veroFalso" }>;

const MIN_AFFERMAZIONI = 1;
const MAX_AFFERMAZIONI = 8;

export interface ParteVeroFalsoProps {
  parte: ParteVeroFalsoEditor;
  onChange: (parte: ParteVeroFalsoEditor) => void;
  onRimuovi: () => void;
}

/** La tabella Vero/Falso delle prove INVALSI: da 1 a 8 affermazioni, per
 * ciascuna il docente dice se è vera o falsa. Lo studente sceglie V o F riga
 * per riga e prende i punti in proporzione alle righe giuste (vedi
 * verso-numbas.ts). Non esiste uno stato «non deciso»: ogni affermazione è
 * vera o falsa, quindi niente da bloccare al salvataggio. */
export function ParteVeroFalso({ parte, onChange, onRimuovi }: ParteVeroFalsoProps) {
  const t = useTranslations("esercizi.redazione.parti");

  // Stesso invariante delle scelte: `spiegazioni` allineata alle
  // affermazioni mentre si scrive, e `undefined` quando nessuna ne ha una.
  function spiegazioniAllineate(): string[] {
    return parte.affermazioni.map((_, i) => parte.spiegazioni?.[i] ?? "");
  }

  function aggiornaAffermazione(indice: number, testo: string) {
    onChange({ ...parte, affermazioni: parte.affermazioni.map((a, i) => (i === indice ? testo : a)) });
  }

  function aggiornaSpiegazione(indice: number, testo: string) {
    const spiegazioni = spiegazioniAllineate().map((s, i) => (i === indice ? testo : s));
    onChange({ ...parte, spiegazioni: spiegazioni.some((s) => s !== "") ? spiegazioni : undefined });
  }

  function impostaVera(indice: number, vera: boolean) {
    onChange({ ...parte, vere: parte.vere.map((v, i) => (i === indice ? vera : v)) });
  }

  function aggiungiAffermazione() {
    if (parte.affermazioni.length >= MAX_AFFERMAZIONI) return;
    onChange({
      ...parte,
      affermazioni: [...parte.affermazioni, ""],
      vere: [...parte.vere, true],
      spiegazioni: parte.spiegazioni ? [...parte.spiegazioni, ""] : undefined,
    });
  }

  function rimuoviAffermazione(indice: number) {
    if (parte.affermazioni.length <= MIN_AFFERMAZIONI) return;
    const senza = <T,>(v: T[]) => v.filter((_, i) => i !== indice);
    const spiegazioni = parte.spiegazioni ? senza(parte.spiegazioni) : undefined;
    onChange({
      ...parte,
      affermazioni: senza(parte.affermazioni),
      vere: senza(parte.vere),
      spiegazioni: spiegazioni?.some((s) => s !== "") ? spiegazioni : undefined,
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <CampoConsegna valore={parte.consegna} onChange={(consegna) => onChange({ ...parte, consegna })} />

      <div className="flex w-24 flex-col gap-1">
        <label className="text-sm font-medium">{t("punti")}</label>
        <Input
          type="number"
          min={1}
          value={parte.punti}
          onChange={(e) => onChange({ ...parte, punti: Number(e.target.value) })}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("veroFalso.affermazioni")}</legend>
        <p className="text-xs text-muted-foreground">{t("veroFalso.punteggio")}</p>
        <ul className="space-y-2">
          {parte.affermazioni.map((affermazione, i) => (
            <li key={i} className="space-y-1 rounded-md border border-transparent p-1 has-[:focus]:border-input">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label={t("veroFalso.affermazioneN", { numero: i + 1 })}
                  value={affermazione}
                  onChange={(e) => aggiornaAffermazione(i, e.target.value)}
                  className="min-w-48 flex-1"
                />
                <div
                  role="radiogroup"
                  aria-label={t("veroFalso.valoreDi", { numero: i + 1 })}
                  className="flex overflow-hidden rounded-md border text-sm"
                >
                  {([true, false] as const).map((valore) => {
                    const scelto = parte.vere[i] === valore;
                    return (
                      <button
                        key={String(valore)}
                        type="button"
                        role="radio"
                        aria-checked={scelto}
                        onClick={() => impostaVera(i, valore)}
                        className={
                          "px-3 py-1.5 font-semibold transition-colors " +
                          (scelto
                            ? valore
                              ? "bg-brand-green text-white"
                              : "bg-destructive text-white"
                            : "bg-background text-muted-foreground hover:bg-muted")
                        }
                      >
                        {valore ? t("veroFalso.vero") : t("veroFalso.falso")}
                      </button>
                    );
                  })}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => rimuoviAffermazione(i)}
                  disabled={parte.affermazioni.length <= MIN_AFFERMAZIONI}
                >
                  {t("veroFalso.rimuovi")}
                </Button>
              </div>
              <Input
                aria-label={t("veroFalso.spiegazione")}
                placeholder={t("veroFalso.spiegazione")}
                value={parte.spiegazioni?.[i] ?? ""}
                onChange={(e) => aggiornaSpiegazione(i, e.target.value)}
                className="max-w-md text-xs"
              />
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={aggiungiAffermazione}
          disabled={parte.affermazioni.length >= MAX_AFFERMAZIONI}
        >
          {t("veroFalso.aggiungi")}
        </Button>
      </fieldset>

      <Button type="button" variant="outline" size="sm" onClick={onRimuovi}>
        {t("rimuovi")}
      </Button>
    </div>
  );
}
