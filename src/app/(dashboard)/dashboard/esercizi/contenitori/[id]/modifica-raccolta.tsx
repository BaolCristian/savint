"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withBasePath } from "@/lib/base-path";
import { AREE } from "../../aree";

export type TestiModificaRaccolta = {
  modifica: string;
  nome: string;
  descrizioneCampo: string;
  salva: string;
  annulla: string;
  erroreGenerico: string;
};

/** Il titolo della raccolta, con nome e descrizione modificabili sul posto
 * da chi puo' modificarla («Modifica» apre i due campi, «Salva» li manda e
 * ricarica la pagina). Per chi la vede soltanto e' un titolo e basta. */
export function ModificaRaccolta({
  contenitoreId,
  nome,
  descrizione,
  modificabile,
  testi,
}: {
  contenitoreId: string;
  nome: string;
  descrizione: string | null;
  modificabile: boolean;
  testi: TestiModificaRaccolta;
}) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [nuovoNome, setNuovoNome] = useState(nome);
  const [nuovaDescrizione, setNuovaDescrizione] = useState(descrizione ?? "");
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const Icona = AREE.raccolte.icona;

  function apri() {
    setNuovoNome(nome);
    setNuovaDescrizione(descrizione ?? "");
    setErrore(null);
    setAperto(true);
  }

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErrore(null);
    const res = await fetch(withBasePath(`/api/esercizi/contenitori/${contenitoreId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nuovoNome, description: nuovaDescrizione }),
    }).catch(() => null);
    setSalvando(false);
    if (!res?.ok) {
      setErrore(testi.erroreGenerico);
      return;
    }
    setAperto(false);
    router.refresh();
  }

  if (aperto) {
    return (
      <form onSubmit={salva} className="w-full max-w-xl space-y-3 rounded-xl border-2 border-brand-green/40 bg-brand-green/5 p-4">
        <div className="space-y-1">
          <label htmlFor="raccolta-nome" className="text-sm font-medium">{testi.nome}</label>
          <input
            id="raccolta-nome"
            value={nuovoNome}
            onChange={(e) => setNuovoNome(e.target.value)}
            maxLength={200}
            required
            autoFocus
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="raccolta-descrizione" className="text-sm font-medium">{testi.descrizioneCampo}</label>
          <textarea
            id="raccolta-descrizione"
            value={nuovaDescrizione}
            onChange={(e) => setNuovaDescrizione(e.target.value)}
            maxLength={2000}
            rows={2}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={salvando || nuovoNome.trim() === ""}>{testi.salva}</Button>
          <Button type="button" variant="outline" onClick={() => setAperto(false)}>{testi.annulla}</Button>
          {errore && <span role="alert" className="text-sm text-destructive">{errore}</span>}
        </div>
      </form>
    );
  }

  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ${AREE.raccolte.pieno}`} aria-hidden>
        <Icona className="h-5 w-5" />
      </span>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold leading-tight">{nome}</h1>
          {modificabile && (
            <Button type="button" variant="ghost" size="sm" onClick={apri} className="text-muted-foreground">
              <Pencil className="h-4 w-4" aria-hidden />
              {testi.modifica}
            </Button>
          )}
        </div>
        {descrizione && <p className="text-sm text-muted-foreground">{descrizione}</p>}
      </div>
    </div>
  );
}
