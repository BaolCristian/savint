"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

interface Contenitore {
  id: string;
  name: string;
  description: string | null;
  // Già formattata dal server ("N esercizi"): un client component non può
  // ricevere una funzione di formattazione come prop.
  eserciziLabel: string;
}

/** Elenco dei contenitori con eliminazione per riga, e il modulo per crearne
 * uno nuovo. Un unico client component: la lista deve aggiornarsi dopo ogni
 * azione (`router.refresh()`), quindi crea/elimina condividono lo stesso
 * ciclo di vita invece di due componenti scollegati. */
export function ContenitoriClient({
  contenitori,
  testi,
}: {
  contenitori: Contenitore[];
  testi: {
    nome: string;
    descrizioneCampo: string;
    crea: string;
    elimina: string;
    erroreInUso: string;
    erroreGenerico: string;
  };
}) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [creando, setCreando] = useState(false);
  const [erroreCrea, setErroreCrea] = useState<string | null>(null);
  const [erroreElimina, setErroreElimina] = useState<Record<string, string>>({});
  const [eliminando, setEliminando] = useState<string | null>(null);

  async function crea(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    setErroreCrea(null);
    const res = await fetch("/api/esercizi/contenitori", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nome, description: descrizione || undefined }),
    });
    setCreando(false);
    if (!res.ok) {
      setErroreCrea(testi.erroreGenerico);
      return;
    }
    setNome("");
    setDescrizione("");
    router.refresh();
  }

  async function elimina(id: string) {
    setEliminando(id);
    setErroreElimina((prev) => ({ ...prev, [id]: "" }));
    const res = await fetch(`/api/esercizi/contenitori/${id}`, { method: "DELETE" });
    setEliminando(null);
    if (!res.ok) {
      const corpo = await res.json().catch(() => ({}));
      setErroreElimina((prev) => ({
        ...prev,
        [id]: corpo.error === "in_uso" ? testi.erroreInUso : testi.erroreGenerico,
      }));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={crea} className="flex flex-wrap items-end gap-3 rounded-xl border border-input p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="contenitore-nome" className="text-sm font-medium">
            {testi.nome}
          </label>
          <Input
            id="contenitore-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            className="w-56"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="contenitore-descrizione" className="text-sm font-medium">
            {testi.descrizioneCampo}
          </label>
          <Input
            id="contenitore-descrizione"
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            className="w-72"
          />
        </div>
        <Button type="submit" disabled={creando}>
          {testi.crea}
        </Button>
        {erroreCrea && <span className="text-sm text-destructive">{erroreCrea}</span>}
      </form>

      <ul className="grid gap-3">
        {contenitori.map((c) => (
          <li key={c.id}>
            <Card className="flex-row items-center justify-between gap-4 p-4">
              <div>
                <Link href={`/dashboard/esercizi/contenitori/${c.id}`} className="font-medium hover:underline">
                  {c.name}
                </Link>
                {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
                <p className="text-sm text-muted-foreground">{c.eserciziLabel}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => elimina(c.id)}
                  disabled={eliminando === c.id}
                >
                  {testi.elimina}
                </Button>
                {erroreElimina[c.id] && (
                  <span className="text-xs text-destructive">{erroreElimina[c.id]}</span>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
