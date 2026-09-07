"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ParteEditor } from "@/lib/esercizi/editor/modello";

type ParteSceltaEditor = Extract<ParteEditor, { tipo: "scelta" }>;

const MIN_RISPOSTE = 2;
const MAX_RISPOSTE = 6;

/** Sentinella per "nessuna risposta corretta ancora scelta": mai un indice
 * reale (0..risposte.length-1), quindi nessun `<input type="radio">` la
 * mostra segnata per costruzione — non serve uno stato locale parallelo che
 * ricordi "manca una scelta" e che il salvataggio non potrebbe comunque
 * vedere (correzione riportata dal Giro di correzioni 1: la versione
 * precedente teneva quello stato dentro `ParteScelta`, il salvataggio non
 * lo vedeva, e `indiceGiusta` tornava comunque a 0 — un valore VALIDO — nel
 * modello nell'istante stesso della rimozione). Qui il modello stesso porta
 * il fatto che manca una scelta, ed `EditorEsercizio` lo legge per
 * disabilitare "salva" (vedi editor-esercizio.tsx). `ParteEditor` (variante
 * "scelta", in modello.ts — dominio, non toccato da questo task) tipizza
 * `indiceGiusta` come `number` senza vincolo di segno a livello di tipo: lo
 * schema zod che lo vincola non negativo entra in gioco solo al momento del
 * salvataggio vero, che qui non può mai partire mentre vale questa
 * sentinella. */
export const NESSUNA_RISPOSTA_CORRETTA = -1;

export interface ParteSceltaProps {
  parte: ParteSceltaEditor;
  onChange: (parte: ParteSceltaEditor) => void;
  onRimuovi: () => void;
}

/** La parte a scelta multipla: da 2 a 6 risposte, un solo segno di
 * corretta (radio, non checkbox: l'editor non rappresenta più di una
 * risposta giusta — vedi il brief del Task 7 e `ParteEditor` in modello.ts). */
export function ParteScelta({ parte, onChange, onRimuovi }: ParteSceltaProps) {
  const t = useTranslations("esercizi.redazione.parti");
  const nomeGruppo = "parte-scelta-corretta";
  const mancaScelta = parte.indiceGiusta === NESSUNA_RISPOSTA_CORRETTA;

  // `spiegazioni` è opzionale nel modello (assente = nessuna spiegazione per
  // nessuna risposta, vedi modello.ts): qui, per scrivere, si allinea sempre
  // alla lunghezza di `risposte` ("" dove manca), e si ricollassa a
  // `undefined` quando nessuna riga ne ha scritta una — lo stesso invariante
  // che `da-numbas.ts` mantiene in lettura, per non far comparire dal nulla
  // un `spiegazioni: ["", ...]` in un esercizio che non l'aveva mai avuto.
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

  function segnaCorretta(indice: number) {
    onChange({ ...parte, indiceGiusta: indice });
  }

  function aggiungiRisposta() {
    if (parte.risposte.length >= MAX_RISPOSTE) return;
    onChange({
      ...parte,
      risposte: [...parte.risposte, ""],
      spiegazioni: parte.spiegazioni ? [...parte.spiegazioni, ""] : undefined,
    });
  }

  function rimuoviRisposta(indice: number) {
    if (parte.risposte.length <= MIN_RISPOSTE) return;
    const risposte = parte.risposte.filter((_, i) => i !== indice);
    let indiceGiusta = parte.indiceGiusta;
    if (indice === parte.indiceGiusta) {
      // Nessun indice valido può sostituirlo in silenzio: il docente deve
      // sceglierne uno vero prima che si possa salvare (vedi la sentinella
      // sopra ed EditorEsercizio, che legge questo stesso valore).
      indiceGiusta = NESSUNA_RISPOSTA_CORRETTA;
    } else if (indice < parte.indiceGiusta) {
      indiceGiusta -= 1;
    }
    const spiegazioni = parte.spiegazioni?.filter((_, i) => i !== indice);
    onChange({ ...parte, risposte, indiceGiusta, spiegazioni });
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">{t("consegna")}</label>
        <Textarea value={parte.consegna} onChange={(e) => onChange({ ...parte, consegna: e.target.value })} />
      </div>

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
        {mancaScelta && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
            {t("scelta.correttaRimossa")}
          </p>
        )}
        <ul className="space-y-2">
          {parte.risposte.map((risposta, i) => (
            <li key={i} className="space-y-1 rounded-md border border-transparent p-1 has-[:focus]:border-input">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name={nomeGruppo}
                    checked={parte.indiceGiusta === i}
                    onChange={() => segnaCorretta(i)}
                    aria-label={t("scelta.corretta")}
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
                aria-label={t("scelta.spiegazione")}
                placeholder={t("scelta.spiegazione")}
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
