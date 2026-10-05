"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FIGURE, leggiSpecificaFigura, type TipoFigura } from "@/lib/esercizi/figure";
import { tokenFigura } from "@/lib/esercizi/editor/immagini-testo";

export interface PulsanteFiguraProps {
  /** Riceve il segnaposto `[figura: … | misure: …]` da mettere nel campo. */
  onInserisci: (segnaposto: string) => void;
  disabilitato?: boolean;
  motivoDisabilitato?: string;
}

const AIUTO: Record<TipoFigura, string> = {
  rettangolo: "aiutoRettangolo",
  quadrato: "aiutoQuadrato",
  "triangolo rettangolo": "aiutoTriangoloRettangolo",
  triangolo: "aiutoTriangolo",
  cerchio: "aiutoCerchio",
};

const NOME: Record<TipoFigura, string> = {
  rettangolo: "rettangolo",
  quadrato: "quadrato",
  "triangolo rettangolo": "triangoloRettangolo",
  triangolo: "triangolo",
  cerchio: "cerchio",
};

/** Il pulsante «Inserisci figura» e la sua finestra: la figura, le misure
 * (espressioni con le variabili, separate da virgole), l'unità e quali
 * etichette mostrano «?» invece del valore. */
export function PulsanteFigura({ onInserisci, disabilitato, motivoDisabilitato }: PulsanteFiguraProps) {
  const t = useTranslations("esercizi.redazione.figura");
  const tNomi = useTranslations("esercizi.figura");
  const [aperta, setAperta] = useState(false);
  const [tipo, setTipo] = useState<TipoFigura>("rettangolo");
  const [misure, setMisure] = useState("");
  const [unita, setUnita] = useState("");
  const [incognite, setIncognite] = useState<number[]>([]);
  const [nonValido, setNonValido] = useState(false);

  function chiudi() {
    setAperta(false);
    setTipo("rettangolo");
    setMisure("");
    setUnita("");
    setIncognite([]);
    setNonValido(false);
  }

  function conferma() {
    const specifica = leggiSpecificaFigura(tipo, misure, unita, incognite.join(", "));
    if (!specifica) {
      setNonValido(true);
      return;
    }
    onInserisci(tokenFigura(specifica));
    chiudi();
  }

  const campo = "flex flex-col gap-1.5";
  const numeroEtichette = FIGURE[tipo].etichette;
  return (
    <>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setAperta(true)}
        disabled={disabilitato}
        title={disabilitato ? motivoDisabilitato : undefined}
        className="flex min-h-11 items-center justify-center rounded-md border border-input px-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
      >
        {t("inserisci")}
      </button>

      {aperta && (
        <Dialog open onOpenChange={(ora) => { if (!ora) chiudi(); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogTitle>{t("titolo")}</DialogTitle>
            <DialogDescription>{t("spiegazione")}</DialogDescription>
            <div className="flex flex-col gap-4">
              <div className={campo}>
                <label htmlFor="figura-tipo" className="text-sm font-medium">{t("tipo")}</label>
                <select
                  id="figura-tipo"
                  value={tipo}
                  onChange={(e) => { setTipo(e.target.value as TipoFigura); setIncognite([]); setNonValido(false); }}
                  className="min-h-11 rounded-md border border-input bg-transparent px-2.5 text-sm"
                >
                  {(Object.keys(FIGURE) as TipoFigura[]).map((f) => (
                    <option key={f} value={f}>{tNomi(NOME[f])}</option>
                  ))}
                </select>
              </div>
              <div className={campo}>
                <label htmlFor="figura-misure" className="text-sm font-medium">{t("misure")}</label>
                <Input
                  id="figura-misure"
                  value={misure}
                  onChange={(e) => { setMisure(e.target.value); setNonValido(false); }}
                  aria-describedby="figura-misure-aiuto"
                  className="font-mono"
                />
                <p id="figura-misure-aiuto" className="text-xs text-muted-foreground">{t(AIUTO[tipo])}</p>
              </div>
              <div className={campo}>
                <label htmlFor="figura-unita" className="text-sm font-medium">{t("unita")}</label>
                <Input id="figura-unita" value={unita} onChange={(e) => setUnita(e.target.value)} className="w-32" />
              </div>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-sm font-medium">{t("incognite")}</legend>
                <div className="flex gap-4">
                  {Array.from({ length: numeroEtichette }, (_, i) => i + 1).map((n) => (
                    <label key={n} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={incognite.includes(n)}
                        onChange={(e) =>
                          setIncognite((attuali) => (e.target.checked ? [...attuali, n].sort() : attuali.filter((x) => x !== n)))
                        }
                      />
                      {n}
                    </label>
                  ))}
                </div>
              </fieldset>
              {nonValido && <p role="alert" className="text-sm text-destructive">{t("nonValido")}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={chiudi}>{t("annulla")}</Button>
                <Button type="button" onClick={conferma} disabled={misure.trim() === ""}>{t("conferma")}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
