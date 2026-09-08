"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** Il codice di una classe, grande e leggibile — verrà dettato ad alta voce
 * o scritto alla lavagna (design doc, «Il codice») — con la sua
 * rigenerazione. Uno spazio a metà (come il PIN delle sessioni live, vedi
 * `host-view.tsx`) spezza i sei caratteri in due gruppi da tre: più facile
 * da dettare e da ricopiare senza perdere il segno.
 *
 * La conferma di rigenerazione (`role="alertdialog"`, stesso pattern di
 * `classi-form.tsx` per la rimozione di una classe con compiti) deve
 * rispondere ESPLICITAMENTE alla paura che frena chi rigenera (brief task
 * 4): il vecchio codice smette di funzionare, ma gli iscritti restano. Non
 * basta dirlo nel dominio (`rigeneraCodice`, classi.ts) — va detto qui, nel
 * testo che il docente legge PRIMA di premere conferma.
 *
 * Nessuna prop coi testi già tradotti: come `compito-form.tsx`, qui serve
 * interpolare il nome della classe nella traduzione ad ogni apertura del
 * dialogo, cosa che un componente server può fare ma che non cambia il
 * fatto che tutto il resto del widget è comunque interattivo — tenerlo
 * tutto in un solo client component con `useTranslations` evita di dover
 * passare un oggetto di stringhe pre-tradotte solo per un valore dinamico
 * già noto qui (`classeNome`). */
export function ClasseCodice({
  classeId,
  classeNome,
  codiceIniziale,
}: {
  classeId: string;
  classeNome: string;
  codiceIniziale: string;
}) {
  const t = useTranslations("esercizi.classi");

  const [codice, setCodice] = useState(codiceIniziale);
  const [confermaAperta, setConfermaAperta] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function rigenera() {
    setBusy(true);
    setErrore(null);
    const res = await fetch(`/api/esercizi/classi/${classeId}/codice`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setErrore(t("rigeneraErrore"));
      return;
    }
    const corpo = await res.json();
    setCodice(corpo.codice);
    setConfermaAperta(false);
  }

  const formattato = codice.length === 6 ? `${codice.slice(0, 3)} ${codice.slice(3)}` : codice;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("codiceEtichetta")}
      </p>
      <p className="select-all font-mono text-4xl font-black uppercase tracking-[0.3em] text-slate-900 sm:text-5xl">
        {formattato}
      </p>
      <p className="text-sm text-muted-foreground">{t("codiceIstruzioni")}</p>
      <Button type="button" variant="outline" size="sm" onClick={() => setConfermaAperta(true)}>
        {t("rigenera")}
      </Button>
      {confermaAperta && (
        <div
          role="alertdialog"
          aria-label={t("rigeneraTitolo", { classe: classeNome })}
          className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="font-medium">{t("rigeneraTitolo", { classe: classeNome })}</p>
          <p className="text-sm text-muted-foreground">{t("rigeneraDescrizione")}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setConfermaAperta(false)}>
              {t("annulla")}
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={rigenera}>
              {t("rigeneraAzione")}
            </Button>
          </div>
        </div>
      )}
      {errore && <p className="text-sm text-destructive">{errore}</p>}
    </div>
  );
}
