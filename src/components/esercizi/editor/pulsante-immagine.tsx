"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { withBasePath } from "@/lib/base-path";
import { tokenImmagine } from "@/lib/esercizi/editor/immagini-testo";

const TIPI_ACCETTATI = "image/png,image/jpeg,image/gif,image/webp";

export interface PulsanteImmagineProps {
  /** Riceve il segnaposto `![descrizione](file)` da mettere nel campo. */
  onInserisci: (segnaposto: string) => void;
  disabilitato?: boolean;
  /** Perché il pulsante è spento, mostrato come suggerimento. */
  motivoDisabilitato?: string;
  className?: string;
}

/** Il pulsante «Inserisci immagine» e la sua finestra: si sceglie il file,
 * si scrive una descrizione (obbligatoria: è il testo alternativo che legge
 * un programma di lettura dello schermo), si carica. Al campo arriva solo il
 * segnaposto; il file vive in public/uploads/esercizi. Un rifiuto del server
 * resta nella finestra, con il file e la descrizione ancora lì. */
export function PulsanteImmagine({ onInserisci, disabilitato, motivoDisabilitato, className }: PulsanteImmagineProps) {
  const t = useTranslations("esercizi.redazione.immagine");
  const [aperta, setAperta] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [descrizione, setDescrizione] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  function chiudi() {
    setAperta(false);
    setFile(null);
    setDescrizione("");
    setErrore(null);
  }

  async function carica() {
    if (!file || descrizione.trim() === "") return;
    setInCorso(true);
    setErrore(null);
    try {
      const dati = new FormData();
      dati.append("file", file);
      const res = await fetch(withBasePath("/api/esercizi/immagini"), { method: "POST", body: dati });
      const corpo = (await res.json().catch(() => ({}))) as { file?: string; error?: string };
      if (!res.ok || !corpo.file) {
        setErrore(
          corpo.error === "troppo_grande" ? t("erroreGrande")
          : corpo.error === "tipo_non_ammesso" ? t("erroreTipo")
          : t("erroreGenerico"),
        );
        return;
      }
      onInserisci(tokenImmagine(descrizione, corpo.file));
      chiudi();
    } catch {
      setErrore(t("erroreGenerico"));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setAperta(true)}
        disabled={disabilitato}
        title={disabilitato ? motivoDisabilitato : undefined}
        className={
          className ??
          "flex min-h-11 items-center justify-center rounded-md border border-input px-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
        }
      >
        {t("inserisci")}
      </button>

      {aperta && (
        <Dialog open onOpenChange={(ora) => { if (!ora) chiudi(); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogTitle>{t("titolo")}</DialogTitle>
            <DialogDescription>{t("spiegazione")}</DialogDescription>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="immagine-file" className="text-sm font-medium">{t("file")}</label>
                <input
                  id="immagine-file"
                  type="file"
                  accept={TIPI_ACCETTATI}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="immagine-descrizione" className="text-sm font-medium">{t("descrizione")}</label>
                <Input
                  id="immagine-descrizione"
                  value={descrizione}
                  onChange={(e) => setDescrizione(e.target.value)}
                  aria-describedby="immagine-descrizione-aiuto"
                />
                <p id="immagine-descrizione-aiuto" className="text-xs text-muted-foreground">{t("descrizioneAiuto")}</p>
              </div>
              {errore && (
                <p role="alert" className="text-sm text-destructive">{errore}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={chiudi}>{t("annulla")}</Button>
                <Button type="button" onClick={carica} disabled={!file || descrizione.trim() === "" || inCorso}>
                  {inCorso ? t("caricamento") : t("conferma")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
