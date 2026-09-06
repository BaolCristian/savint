"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Opzione {
  id: string;
  label: string;
}

/** Il dettaglio di `esercizi_insufficienti` (dominio: `assegna` in
 * compiti.ts) arriva solo a runtime, dentro il corpo della risposta HTTP —
 * non lo si può tradurre lato server nella pagina, che gira prima che la
 * richiesta parta. Per questo, a differenza degli altri moduli di questa
 * sezione, qui si chiama `useTranslations` direttamente invece di ricevere
 * le stringhe già pronte come prop: è l'unico punto che ne ha davvero
 * bisogno. */
export function CompitoForm({ batterie, classi }: { batterie: Opzione[]; classi: Opzione[] }) {
  const t = useTranslations("esercizi.compiti");
  const router = useRouter();

  const [batteriaId, setBatteriaId] = useState(batterie[0]?.id ?? "");
  const [classeId, setClasseId] = useState(classi[0]?.id ?? "");
  const [opensAt, setOpensAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [esito, setEsito] = useState<"ok" | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  function messaggioErrore(corpo: { error?: string; dettaglio?: { contenitore: string; richiesti: number; disponibili: number } }) {
    if (corpo.error === "esercizi_insufficienti" && corpo.dettaglio) {
      return t("erroreCapienza", {
        contenitore: corpo.dettaglio.contenitore,
        richiesti: corpo.dettaglio.richiesti,
        disponibili: corpo.dettaglio.disponibili,
      });
    }
    if (corpo.error === "non_insegni_questa_classe") return t("erroreNonInsegni");
    if (corpo.error === "batteria_non_trovata") return t("erroreBatteriaNonTrovata");
    if (corpo.error === "classe_non_trovata") return t("erroreClasseNonTrovata");
    return t("erroreGenerico");
  }

  async function assegna(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrore(null);
    setEsito(null);
    const res = await fetch("/api/esercizi/compiti", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        batteriaId,
        classeId,
        ...(opensAt ? { opensAt: new Date(opensAt).toISOString() } : {}),
        ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const corpo = await res.json().catch(() => ({}));
      setErrore(messaggioErrore(corpo));
      return;
    }
    setEsito("ok");
    router.refresh();
  }

  return (
    <form onSubmit={assegna} className="flex flex-wrap items-end gap-3 rounded-xl border border-input p-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="compito-batteria" className="text-sm font-medium">
          {t("batteria")}
        </label>
        <select
          id="compito-batteria"
          value={batteriaId}
          onChange={(e) => setBatteriaId(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          {batterie.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="compito-classe" className="text-sm font-medium">
          {t("classe")}
        </label>
        <select
          id="compito-classe"
          value={classeId}
          onChange={(e) => setClasseId(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          {classi.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="compito-apertura" className="text-sm font-medium">
          {t("apertura")}
        </label>
        <Input id="compito-apertura" type="date" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className="w-40" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="compito-scadenza" className="text-sm font-medium">
          {t("scadenza")}
        </label>
        <Input id="compito-scadenza" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="w-40" />
      </div>
      <Button type="submit" disabled={busy}>
        {t("assegna")}
      </Button>
      {esito === "ok" && <span className="text-sm text-brand-green">{t("assegnato")}</span>}
      {errore && <span className="text-sm text-destructive">{errore}</span>}
    </form>
  );
}
