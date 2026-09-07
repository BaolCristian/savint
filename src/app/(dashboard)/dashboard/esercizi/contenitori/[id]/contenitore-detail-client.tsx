"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface EsercizioRiga {
  id: string;
  title: string;
  subtitle: string;
}

/** Gestisce sia la rimozione degli esercizi già dentro il contenitore sia
 * l'aggiunta di quelli ancora fuori: le due liste condividono lo stesso
 * `router.refresh()` dopo ogni azione, quindi vivono nello stesso
 * componente invece che in due isolati fra loro. */
export function ContenitoreDetailClient({
  contenitoreId,
  dentro,
  fuori,
  testi,
}: {
  contenitoreId: string;
  dentro: EsercizioRiga[];
  fuori: EsercizioRiga[];
  testi: {
    nessunoDentro: string;
    rimuovi: string;
    titoloAggiungi: string;
    nessunoFuori: string;
    aggiungi: string;
    erroreGenerico: string;
  };
}) {
  const router = useRouter();
  const [rimuovendo, setRimuovendo] = useState<string | null>(null);
  const [erroreRimozione, setErroreRimozione] = useState<string | null>(null);
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [aggiungendo, setAggiungendo] = useState(false);
  const [erroreAggiunta, setErroreAggiunta] = useState<string | null>(null);

  async function rimuovi(esercizioId: string) {
    setRimuovendo(esercizioId);
    setErroreRimozione(null);
    const res = await fetch(`/api/esercizi/contenitori/${contenitoreId}/esercizi`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ esercizioId }),
    });
    setRimuovendo(null);
    if (!res.ok) {
      setErroreRimozione(testi.erroreGenerico);
      return;
    }
    router.refresh();
  }

  function toggle(id: string) {
    setSelezionati((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function aggiungi() {
    setAggiungendo(true);
    setErroreAggiunta(null);
    const res = await fetch(`/api/esercizi/contenitori/${contenitoreId}/esercizi`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ esercizioIds: [...selezionati] }),
    });
    setAggiungendo(false);
    if (!res.ok) {
      setErroreAggiunta(testi.erroreGenerico);
      return;
    }
    setSelezionati(new Set());
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        {dentro.length === 0 ? (
          <p className="text-sm text-muted-foreground">{testi.nessunoDentro}</p>
        ) : (
          <ul className="grid gap-2">
            {dentro.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-input p-3"
              >
                <div>
                  <p className="font-medium">{e.title}</p>
                  <p className="text-sm text-muted-foreground">{e.subtitle}</p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => rimuovi(e.id)}
                  disabled={rimuovendo === e.id}
                >
                  {testi.rimuovi}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {erroreRimozione && <p className="text-sm text-destructive">{erroreRimozione}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{testi.titoloAggiungi}</h2>
        {fuori.length === 0 ? (
          <p className="text-sm text-muted-foreground">{testi.nessunoFuori}</p>
        ) : (
          <>
            <ul className="grid gap-2">
              {fuori.map((e) => (
                <li key={e.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-input p-3 text-sm hover:bg-muted/50">
                    <input
                      type="checkbox"
                      checked={selezionati.has(e.id)}
                      onChange={() => toggle(e.id)}
                      className="h-4 w-4"
                    />
                    <span>
                      <span className="font-medium">{e.title}</span>
                      <span className="ml-2 text-muted-foreground">{e.subtitle}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-3">
              <Button onClick={aggiungi} disabled={aggiungendo || selezionati.size === 0}>
                {testi.aggiungi}
              </Button>
              {erroreAggiunta && <span className="text-sm text-destructive">{erroreAggiunta}</span>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
