"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Il form per creare una classe a mano (task 4, design doc «Il problema»:
 * il primo giorno di scuola il docente non vede niente finché nessuno dei
 * suoi studenti ha fatto accesso con Google). Chiama `creaClasse` via la
 * rotta POST esistente (task 3) — non lo si chiama qui direttamente: è una
 * scrittura, non una lettura, e questa pagina segue già quella disciplina
 * per `dichiaraInsegnamento` (vedi `classi-form.tsx`).
 *
 * Nessuna prop: come `compito-form.tsx`, l'esito arriva solo a runtime nel
 * corpo della risposta HTTP (quale errore, se c'è) — non lo si può tradurre
 * lato server nella pagina, che gira prima che la richiesta parta.
 *
 * Dopo il successo non serve tenere il codice in stato locale per
 * mostrarlo: `creaClasse` (dominio) dichiara da sé che il creatore insegna
 * la nuova classe, quindi `router.refresh()` la fa comparire già fra le
 * classi insegnate, con il suo codice, nella sezione sotto (vedi page.tsx) —
 * lo stesso ciclo refresh-e-rileggi di `classi-form.tsx` e
 * `contenitori-client.tsx`. */
export function CreaClasseForm() {
  const t = useTranslations("esercizi.classi");
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [anno, setAnno] = useState("");
  const [creando, setCreando] = useState(false);
  const [creata, setCreata] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function crea(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    setErrore(null);
    setCreata(false);
    const res = await fetch("/api/esercizi/classi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nome, anno: anno ? Number(anno) : undefined }),
    });
    setCreando(false);
    if (!res.ok) {
      const corpo = await res.json().catch(() => ({}));
      setErrore(corpo.error === "nome_gia_usato" ? t("creaErroreNomeUsato") : t("creaErroreGenerico"));
      return;
    }
    setNome("");
    setAnno("");
    setCreata(true);
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-xl border border-input p-4">
      <h2 className="text-base font-semibold">{t("creaTitolo")}</h2>
      <form onSubmit={crea} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="classe-nome" className="text-sm font-medium">
            {t("creaNome")}
          </label>
          <Input
            id="classe-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder={t("creaNomeSegnaposto")}
            required
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="classe-anno" className="text-sm font-medium">
            {t("creaAnno")}
          </label>
          <Input
            id="classe-anno"
            type="number"
            min={1}
            max={5}
            value={anno}
            onChange={(e) => setAnno(e.target.value)}
            className="w-20"
          />
        </div>
        <Button type="submit" disabled={creando || !nome.trim()}>
          {t("creaSubmit")}
        </Button>
      </form>
      {creata && <p className="text-sm text-brand-green">{t("creaSuccesso")}</p>}
      {errore && <p className="text-sm text-destructive">{errore}</p>}
    </div>
  );
}
