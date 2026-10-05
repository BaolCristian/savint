"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { leggiSpecificaGrafico } from "@/lib/esercizi/grafici";
import { tokenGrafico } from "@/lib/esercizi/editor/immagini-testo";

export interface PulsanteGraficoProps {
  /** Riceve il segnaposto `[grafico: … | x: …]` da mettere nel campo. */
  onInserisci: (segnaposto: string) => void;
  disabilitato?: boolean;
  motivoDisabilitato?: string;
}

/** Un estremo scritto dal docente: la virgola decimale vale come il punto. */
function estremo(s: string): string {
  return s.trim().replace(",", ".");
}

/** Il pulsante «Inserisci grafico» e la sua finestra: la funzione con le
 * variabili dell'esercizio, l'intervallo delle x e, se il docente lo vuole,
 * quello delle y (altrimenti automatico). Al campo arriva solo il segnaposto;
 * il disegno lo fa il player con i numeri di ogni studente. */
export function PulsanteGrafico({ onInserisci, disabilitato, motivoDisabilitato }: PulsanteGraficoProps) {
  const t = useTranslations("esercizi.redazione.grafico");
  const [aperta, setAperta] = useState(false);
  const [funzione, setFunzione] = useState("");
  const [xDa, setXDa] = useState("-5");
  const [xA, setXA] = useState("5");
  const [yAutomatico, setYAutomatico] = useState(true);
  const [yDa, setYDa] = useState("");
  const [yA, setYA] = useState("");
  const [nonValido, setNonValido] = useState(false);

  function chiudi() {
    setAperta(false);
    setFunzione("");
    setXDa("-5");
    setXA("5");
    setYAutomatico(true);
    setYDa("");
    setYA("");
    setNonValido(false);
  }

  function conferma() {
    const specifica = leggiSpecificaGrafico(
      funzione,
      `${estremo(xDa)}..${estremo(xA)}`,
      yAutomatico ? undefined : `${estremo(yDa)}..${estremo(yA)}`,
    );
    if (!specifica) {
      setNonValido(true);
      return;
    }
    onInserisci(tokenGrafico(specifica));
    chiudi();
  }

  const campo = "flex flex-col gap-1.5";
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
                <label htmlFor="grafico-funzione" className="text-sm font-medium">{t("funzione")}</label>
                <Input
                  id="grafico-funzione"
                  value={funzione}
                  onChange={(e) => { setFunzione(e.target.value); setNonValido(false); }}
                  aria-describedby="grafico-funzione-aiuto"
                  className="font-mono"
                />
                <p id="grafico-funzione-aiuto" className="text-xs text-muted-foreground">{t("funzioneAiuto")}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={campo}>
                  <label htmlFor="grafico-x-da" className="text-sm font-medium">{t("xDa")}</label>
                  <Input id="grafico-x-da" inputMode="decimal" value={xDa} onChange={(e) => setXDa(e.target.value)} />
                </div>
                <div className={campo}>
                  <label htmlFor="grafico-x-a" className="text-sm font-medium">{t("xA")}</label>
                  <Input id="grafico-x-a" inputMode="decimal" value={xA} onChange={(e) => setXA(e.target.value)} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={yAutomatico} onChange={(e) => setYAutomatico(e.target.checked)} />
                {t("yAutomatico")}
              </label>
              {!yAutomatico && (
                <div className="grid grid-cols-2 gap-3">
                  <div className={campo}>
                    <label htmlFor="grafico-y-da" className="text-sm font-medium">{t("yDa")}</label>
                    <Input id="grafico-y-da" inputMode="decimal" value={yDa} onChange={(e) => setYDa(e.target.value)} />
                  </div>
                  <div className={campo}>
                    <label htmlFor="grafico-y-a" className="text-sm font-medium">{t("yA")}</label>
                    <Input id="grafico-y-a" inputMode="decimal" value={yA} onChange={(e) => setYA(e.target.value)} />
                  </div>
                </div>
              )}
              {nonValido && <p role="alert" className="text-sm text-destructive">{t("nonValido")}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={chiudi}>{t("annulla")}</Button>
                <Button type="button" onClick={conferma} disabled={funzione.trim() === ""}>{t("conferma")}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
