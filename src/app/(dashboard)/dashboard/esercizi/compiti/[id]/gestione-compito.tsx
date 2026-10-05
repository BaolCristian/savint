"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Cambiare le date di un compito già assegnato, o ritirarlo. Le date
 * arrivano già nel formato del campo `type="date"` (AAAA-MM-GG, "" se
 * assente): la pagina le ricava dalla stessa conversione UTC che il modulo
 * di assegnazione usa all'andata (`new Date("AAAA-MM-GG")` è mezzanotte
 * UTC), così una data salvata ritorna nel campo identica.
 *
 * `useTranslations` direttamente, come `compito-form.tsx`: il motivo di un
 * rifiuto è noto solo a runtime, dentro la risposta HTTP. */
export function GestioneCompito({ compitoId, opensAt: aperturaIniziale, dueAt: scadenzaIniziale }: {
  compitoId: string;
  opensAt: string;
  dueAt: string;
}) {
  const t = useTranslations("esercizi.compiti");
  const router = useRouter();

  const [opensAt, setOpensAt] = useState(aperturaIniziale);
  const [dueAt, setDueAt] = useState(scadenzaIniziale);
  const [busy, setBusy] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [confermaRitiro, setConfermaRitiro] = useState(false);

  function messaggioErrore(corpo: { error?: string }) {
    if (corpo.error === "scadenza_prima_apertura") return t("erroreScadenzaPrimaApertura");
    if (corpo.error === "scadenza_nel_passato") return t("erroreScadenzaPassata");
    if (corpo.error === "compito_non_trovato") return t("erroreCompitoNonTrovato");
    return t("erroreGenerico");
  }

  async function salvaDate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrore(null);
    setSalvato(false);
    // Un campo svuotato diventa `null`, cioè "togli la data": la rotta vuole
    // sempre entrambe le chiavi, proprio per non dover indovinare.
    const res = await fetch(`/api/esercizi/compiti/${compitoId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        opensAt: opensAt ? new Date(opensAt).toISOString() : null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setErrore(messaggioErrore(await res.json().catch(() => ({}))));
      return;
    }
    setSalvato(true);
    router.refresh();
  }

  async function ritira() {
    setBusy(true);
    setErrore(null);
    const res = await fetch(`/api/esercizi/compiti/${compitoId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setConfermaRitiro(false);
      setErrore(messaggioErrore(await res.json().catch(() => ({}))));
      return;
    }
    // Il compito non esiste più per questa pagina (risponderebbe 404):
    // si torna all'elenco, dove non compare più.
    router.push("/dashboard/esercizi/compiti");
  }

  return (
    <div className="space-y-3 rounded-xl border border-input p-4">
      <form onSubmit={salvaDate} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="gestione-apertura" className="text-sm font-medium">
            {t("apertura")}
          </label>
          <Input id="gestione-apertura" type="date" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="gestione-scadenza" className="text-sm font-medium">
            {t("scadenza")}
          </label>
          <Input id="gestione-scadenza" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="w-40" />
        </div>
        <Button type="submit" disabled={busy}>
          {t("salvaDate")}
        </Button>
        <Button type="button" variant="outline" disabled={busy || confermaRitiro} onClick={() => setConfermaRitiro(true)}>
          {t("ritira")}
        </Button>
        {salvato && <span className="text-sm text-brand-green">{t("dateSalvate")}</span>}
        {errore && <span className="text-sm text-destructive">{errore}</span>}
      </form>

      {confermaRitiro && (
        // Stessa conferma inline di classi-form.tsx (role="alertdialog": un
        // sì/no immediato, non un annuncio passivo). Il testo dice le due
        // cose che il docente deve sapere prima di premere: gli studenti non
        // lo vedranno più, e quello che hanno già svolto non va perso.
        <div
          role="alertdialog"
          aria-label={t("ritiraConfermaTitolo")}
          className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="font-medium">{t("ritiraConfermaTitolo")}</p>
          <p className="text-sm text-muted-foreground">{t("ritiraConfermaTesto")}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setConfermaRitiro(false)}>
              {t("annulla")}
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={ritira}>
              {t("ritiraConferma")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
