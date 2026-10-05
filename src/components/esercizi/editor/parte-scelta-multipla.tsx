"use client";

import { CampoConsegna } from "./campo-consegna";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ParteEditor } from "@/lib/esercizi/editor/modello";

type ParteSceltaMultiplaEditor = Extract<ParteEditor, { tipo: "sceltaMultipla" }>;

const MIN_RISPOSTE = 2;
const MAX_RISPOSTE = 8;

/** Vero quando nessuna risposta è segnata come corretta: lo stato in cui una
 * parte nuova nasce (nessuna spunta indovinata al posto del docente) e in
 * cui finisce quando si rimuove l'unica corretta. Esportata perché è
 * `EditorEsercizio`, che salva, a leggerla per bloccare "salva" e
 * "controlla": come per la scelta singola (`NESSUNA_RISPOSTA_CORRETTA` in
 * parte-scelta.tsx), la fonte di verità è il modello stesso, non uno stato
 * locale che il salvataggio non vedrebbe. */
export function senzaRisposteCorrette(parte: ParteSceltaMultiplaEditor): boolean {
  return !parte.corrette.some((c) => c);
}

export interface ParteSceltaMultiplaProps {
  parte: ParteSceltaMultiplaEditor;
  onChange: (parte: ParteSceltaMultiplaEditor) => void;
  onRimuovi: () => void;
}

/** La scelta multipla con più risposte giuste: da 2 a 8 risposte, una
 * casella «corretta» per ciascuna (checkbox, non radio: se ne possono
 * spuntare quante si vuole), corretta tutto o niente (vedi verso-numbas.ts). */
export function ParteSceltaMultipla({ parte, onChange, onRimuovi }: ParteSceltaMultiplaProps) {
  const t = useTranslations("esercizi.redazione.parti");
  const nessunaCorretta = senzaRisposteCorrette(parte);

  // Stesso invariante di parte-scelta.tsx e da-numbas.ts: `spiegazioni`
  // allineata a `risposte` mentre si scrive, e di nuovo `undefined` quando
  // nessuna riga ne ha una — altrimenti un esercizio senza spiegazioni
  // acquisirebbe un `spiegazioni: ["", ...]` che riaperto non avrebbe più.
  function spiegazioniAllineate(): string[] {
    return parte.risposte.map((_, i) => parte.spiegazioni?.[i] ?? "");
  }

  function aggiornaRisposta(indice: number, testo: string) {
    onChange({ ...parte, risposte: parte.risposte.map((r, i) => (i === indice ? testo : r)) });
  }

  function aggiornaSpiegazione(indice: number, testo: string) {
    const spiegazioni = spiegazioniAllineate().map((s, i) => (i === indice ? testo : s));
    onChange({ ...parte, spiegazioni: spiegazioni.some((s) => s !== "") ? spiegazioni : undefined });
  }

  function commutaCorretta(indice: number) {
    onChange({ ...parte, corrette: parte.corrette.map((c, i) => (i === indice ? !c : c)) });
  }

  function aggiungiRisposta() {
    if (parte.risposte.length >= MAX_RISPOSTE) return;
    onChange({
      ...parte,
      risposte: [...parte.risposte, ""],
      corrette: [...parte.corrette, false],
      spiegazioni: parte.spiegazioni ? [...parte.spiegazioni, ""] : undefined,
    });
  }

  // Rimuovere l'unica corretta non ne segna un'altra al suo posto: la parte
  // resta senza, l'avviso lo dice e il salvataggio è bloccato finché il
  // docente non sceglie (vedi `senzaRisposteCorrette`).
  function rimuoviRisposta(indice: number) {
    if (parte.risposte.length <= MIN_RISPOSTE) return;
    const senza = <T,>(v: T[]) => v.filter((_, i) => i !== indice);
    const spiegazioni = parte.spiegazioni ? senza(parte.spiegazioni) : undefined;
    onChange({
      ...parte,
      risposte: senza(parte.risposte),
      corrette: senza(parte.corrette),
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
        <legend className="text-sm font-medium">{t("scelta.risposte")}</legend>
        <p className="text-xs text-muted-foreground">{t("sceltaMultipla.tuttoONiente")}</p>
        {nessunaCorretta && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
            {t("sceltaMultipla.nessunaCorretta")}
          </p>
        )}
        <ul className="space-y-2">
          {parte.risposte.map((risposta, i) => (
            <li key={i} className="space-y-1 rounded-md border border-transparent p-1 has-[:focus]:border-input">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={parte.corrette[i] ?? false}
                    onChange={() => commutaCorretta(i)}
                    aria-label={t("sceltaMultipla.corretta")}
                  />
                </label>
                <Input
                  aria-label={t("scelta.rispostaN", { numero: i + 1 })}
                  value={risposta}
                  onChange={(e) => aggiornaRisposta(i, e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => rimuoviRisposta(i)}
                  disabled={parte.risposte.length <= MIN_RISPOSTE}
                >
                  {t("scelta.rimuoviRisposta")}
                </Button>
              </div>
              <Input
                aria-label={t("sceltaMultipla.spiegazione")}
                placeholder={t("sceltaMultipla.spiegazione")}
                value={parte.spiegazioni?.[i] ?? ""}
                onChange={(e) => aggiornaSpiegazione(i, e.target.value)}
                className="ml-7 max-w-md text-xs"
              />
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={aggiungiRisposta}
          disabled={parte.risposte.length >= MAX_RISPOSTE}
        >
          {t("scelta.aggiungiRisposta")}
        </Button>
      </fieldset>

      <Button type="button" variant="outline" size="sm" onClick={onRimuovi}>
        {t("rimuovi")}
      </Button>
    </div>
  );
}
