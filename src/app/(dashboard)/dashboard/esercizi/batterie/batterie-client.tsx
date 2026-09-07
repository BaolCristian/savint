"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

interface Contenitore {
  id: string;
  name: string;
}

interface Batteria {
  id: string;
  name: string;
  regoleLabel: string;
  compitiLabel: string;
}

interface Regola {
  contenitoreId: string;
  count: number;
}

/** Compone una batteria (nome + regole "N esercizi da questo contenitore")
 * ed elenca quelle esistenti, con eliminazione. Un unico client component
 * per lo stesso motivo dei contenitori: creare ed eliminare condividono il
 * ciclo `router.refresh()`. */
export function BatterieClient({
  batterie,
  contenitori,
  testi,
}: {
  batterie: Batteria[];
  contenitori: Contenitore[];
  testi: {
    nome: string;
    contenitore: string;
    quantita: string;
    aggiungiRegola: string;
    rimuoviRegola: string;
    crea: string;
    elimina: string;
    erroreInUso: string;
    erroreGenerico: string;
    necessitaContenitori: string;
  };
}) {
  const router = useRouter();
  const primoContenitore = contenitori[0]?.id ?? "";
  const [nome, setNome] = useState("");
  const [regole, setRegole] = useState<Regola[]>([{ contenitoreId: primoContenitore, count: 1 }]);
  const [creando, setCreando] = useState(false);
  const [erroreCrea, setErroreCrea] = useState<string | null>(null);
  const [erroreElimina, setErroreElimina] = useState<Record<string, string>>({});
  const [eliminando, setEliminando] = useState<string | null>(null);

  function aggiornaRegola(i: number, cambio: Partial<Regola>) {
    setRegole((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...cambio } : r)));
  }

  function aggiungiRegola() {
    setRegole((prev) => [...prev, { contenitoreId: primoContenitore, count: 1 }]);
  }

  function rimuoviRegola(i: number) {
    setRegole((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function crea(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    setErroreCrea(null);
    const res = await fetch("/api/esercizi/batterie", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nome, regole }),
    });
    setCreando(false);
    if (!res.ok) {
      setErroreCrea(testi.erroreGenerico);
      return;
    }
    setNome("");
    setRegole([{ contenitoreId: primoContenitore, count: 1 }]);
    router.refresh();
  }

  async function elimina(id: string) {
    setEliminando(id);
    setErroreElimina((prev) => ({ ...prev, [id]: "" }));
    const res = await fetch(`/api/esercizi/batterie/${id}`, { method: "DELETE" });
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
      {contenitori.length === 0 ? (
        <p className="text-sm text-muted-foreground">{testi.necessitaContenitori}</p>
      ) : (
        <form onSubmit={crea} className="space-y-3 rounded-xl border border-input p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="batteria-nome" className="text-sm font-medium">
              {testi.nome}
            </label>
            <Input id="batteria-nome" value={nome} onChange={(e) => setNome(e.target.value)} required className="w-72" />
          </div>

          <div className="space-y-2">
            {regole.map((r, i) => (
              <div key={i} className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor={`batteria-contenitore-${i}`} className="text-sm font-medium">
                    {testi.contenitore}
                  </label>
                  <select
                    id={`batteria-contenitore-${i}`}
                    value={r.contenitoreId}
                    onChange={(e) => aggiornaRegola(i, { contenitoreId: e.target.value })}
                    className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  >
                    {contenitori.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`batteria-quantita-${i}`} className="text-sm font-medium">
                    {testi.quantita}
                  </label>
                  <Input
                    id={`batteria-quantita-${i}`}
                    type="number"
                    min={1}
                    value={r.count}
                    onChange={(e) => aggiornaRegola(i, { count: Number(e.target.value) || 1 })}
                    className="w-24"
                  />
                </div>
                {regole.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => rimuoviRegola(i)}>
                    {testi.rimuoviRegola}
                  </Button>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={aggiungiRegola}>
              {testi.aggiungiRegola}
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={creando}>
              {testi.crea}
            </Button>
            {erroreCrea && <span className="text-sm text-destructive">{erroreCrea}</span>}
          </div>
        </form>
      )}

      <ul className="grid gap-3">
        {batterie.map((b) => (
          <li key={b.id}>
            <Card className="flex-row items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">{b.name}</p>
                <p className="text-sm text-muted-foreground">{b.regoleLabel}</p>
                <p className="text-sm text-muted-foreground">{b.compitiLabel}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => elimina(b.id)}
                  disabled={eliminando === b.id}
                >
                  {testi.elimina}
                </Button>
                {erroreElimina[b.id] && <span className="text-xs text-destructive">{erroreElimina[b.id]}</span>}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
