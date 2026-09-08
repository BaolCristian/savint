"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Il campo per iscriversi a una classe con un codice (task 4, design doc:
 * «la sua area» — qui, in cima alla home dello studente). Chiama la rotta
 * dedicata (`api/esercizi/classi/iscrizione/route.ts`, task 3), che gira
 * dietro `requireStudent`, non `redirectUnlessTeacher` come le rotte
 * sorelle.
 *
 * Il punto della spec (brief task 4): un codice sbagliato dice SOLO "non
 * valido" — mai distinguere un codice mai esistito da uno che questo
 * studente non può usare (di un'altra scuola). La rotta appiattisce già i
 * due casi sullo stesso `codice_sconosciuto`; qui ci si limita a un solo
 * ramo per quel motivo, per non reintrodurre la distinzione nel testo.
 * `gia_iscritto` invece è un motivo diverso e ha un messaggio diverso: non
 * riguarda la validità del codice, riguarda lo stato dello studente che lo
 * usa (che lo sa già, non è un'informazione che un estraneo potrebbe
 * sfruttare per scoprire quali codici esistono). */
export function IscrizioneClasseForm() {
  const t = useTranslations("esercizi.classi.iscrizione");
  const router = useRouter();

  const [codice, setCodice] = useState("");
  const [busy, setBusy] = useState(false);
  const [successo, setSuccesso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  async function iscriviti(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrore(null);
    setSuccesso(null);
    const res = await fetch("/api/esercizi/classi/iscrizione", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ codice }),
    });
    setBusy(false);
    if (!res.ok) {
      const corpo = await res.json().catch(() => ({}));
      if (corpo.error === "gia_iscritto") setErrore(t("erroreGiaIscritto"));
      else if (corpo.error === "codice_sconosciuto") setErrore(t("erroreNonValido"));
      else setErrore(t("erroreGenerico"));
      return;
    }
    const corpo = await res.json();
    setCodice("");
    setSuccesso(t("successo", { classe: corpo.classe.nome }));
    router.refresh();
  }

  return (
    <form
      onSubmit={iscriviti}
      className="flex flex-wrap items-end gap-3 rounded-3xl border border-white/80 bg-white/70 p-4 shadow-xl shadow-slate-200/50 backdrop-blur-xl"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="iscrizione-codice" className="text-sm font-medium text-slate-700">
          {t("campo")}
        </label>
        <Input
          id="iscrizione-codice"
          value={codice}
          onChange={(e) => setCodice(e.target.value)}
          placeholder={t("segnaposto")}
          required
          className="w-40 uppercase tracking-widest"
        />
      </div>
      <Button type="submit" disabled={busy || !codice.trim()}>
        {t("submit")}
      </Button>
      {successo && <span className="text-sm text-brand-green">{successo}</span>}
      {errore && <span className="text-sm text-destructive">{errore}</span>}
    </form>
  );
}
