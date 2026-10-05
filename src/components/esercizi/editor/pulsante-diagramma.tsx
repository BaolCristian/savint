"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { leggiSpecificaDiagramma, type TipoDiagramma } from "@/lib/esercizi/diagrammi";
import { tokenDiagramma } from "@/lib/esercizi/editor/immagini-testo";

export interface PulsanteDiagrammaProps {
  /** Riceve il segnaposto `[diagramma: … | valori: …]` da mettere nel campo. */
  onInserisci: (segnaposto: string) => void;
  disabilitato?: boolean;
  motivoDisabilitato?: string;
}

/** Il pulsante «Inserisci diagramma» e la sua finestra: il tipo (barre,
 * istogramma, torta) e i nomi delle variabili con i valori e, se ci sono,
 * con le etichette. Le liste vivono nelle Variabili: la finestra lo spiega,
 * e rifiuta una lista scritta direttamente qui. */
export function PulsanteDiagramma({ onInserisci, disabilitato, motivoDisabilitato }: PulsanteDiagrammaProps) {
  const t = useTranslations("esercizi.redazione.diagramma");
  const [aperta, setAperta] = useState(false);
  const [tipo, setTipo] = useState<TipoDiagramma>("barre");
  const [valori, setValori] = useState("");
  const [etichette, setEtichette] = useState("");
  const [nonValido, setNonValido] = useState(false);

  function chiudi() {
    setAperta(false);
    setTipo("barre");
    setValori("");
    setEtichette("");
    setNonValido(false);
  }

  function conferma() {
    const specifica = leggiSpecificaDiagramma(tipo, valori, etichette);
    if (!specifica) {
      setNonValido(true);
      return;
    }
    onInserisci(tokenDiagramma(specifica));
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
                <label htmlFor="diagramma-tipo" className="text-sm font-medium">{t("tipo")}</label>
                <select
                  id="diagramma-tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoDiagramma)}
                  className="min-h-11 rounded-md border border-input bg-transparent px-2.5 text-sm"
                >
                  <option value="barre">{t("tipoBarre")}</option>
                  <option value="istogramma">{t("tipoIstogramma")}</option>
                  <option value="torta">{t("tipoTorta")}</option>
                </select>
              </div>
              <div className={campo}>
                <label htmlFor="diagramma-valori" className="text-sm font-medium">{t("valori")}</label>
                <Input
                  id="diagramma-valori"
                  value={valori}
                  onChange={(e) => { setValori(e.target.value); setNonValido(false); }}
                  className="font-mono"
                />
              </div>
              <div className={campo}>
                <label htmlFor="diagramma-etichette" className="text-sm font-medium">{t("etichette")}</label>
                <Input
                  id="diagramma-etichette"
                  value={etichette}
                  onChange={(e) => { setEtichette(e.target.value); setNonValido(false); }}
                  aria-describedby="diagramma-etichette-aiuto"
                  className="font-mono"
                />
                <p id="diagramma-etichette-aiuto" className="text-xs text-muted-foreground">{t("etichetteAiuto")}</p>
              </div>
              {nonValido && <p role="alert" className="text-sm text-destructive">{t("nonValido")}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={chiudi}>{t("annulla")}</Button>
                <Button type="button" onClick={conferma} disabled={valori.trim() === ""}>{t("conferma")}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
