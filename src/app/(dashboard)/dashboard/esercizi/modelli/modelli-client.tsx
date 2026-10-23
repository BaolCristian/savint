"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Modello {
  id: string;
  nome: string;
  mio: boolean;
  // Già formattate dal server: un client component non può ricevere una
  // funzione di formattazione come prop.
  autoreLabel: string | null;
  blocchiLabel: string[];
  usatoLabel: string;
  /** Chi l'ha creato, o un ADMIN: per gli altri il pulsante non c'è. */
  eliminabile: boolean;
}

/** L'elenco dei modelli, col filtro Miei/Tutti e l'eliminazione per riga.
 * Il filtro vive qui (nessun giro dal server: l'elenco è già tutto sulla
 * pagina); eliminare ricarica con `router.refresh()`, come le raccolte.
 * "Elimina" chiede prima conferma (Nuovo compito, Task 7), con la stessa
 * conferma inline del ritiro di un compito (gestione-compito.tsx). */
export function ModelliClient({
  modelli,
  testi,
}: {
  modelli: Modello[];
  testi: {
    filtro: string;
    filtroTutti: string;
    filtroMiei: string;
    usa: string;
    elimina: string;
    eliminaConfermaTitolo: string;
    eliminaConfermaTesto: string;
    eliminaConferma: string;
    annulla: string;
    nessunoMio: string;
    erroreGenerico: string;
  };
}) {
  const router = useRouter();
  const [soloMiei, setSoloMiei] = useState(false);
  const [errore, setErrore] = useState<Record<string, string>>({});
  const [eliminando, setEliminando] = useState<string | null>(null);
  // Il modello di cui si sta chiedendo conferma (uno alla volta).
  const [daConfermare, setDaConfermare] = useState<string | null>(null);

  const visibili = soloMiei ? modelli.filter((m) => m.mio) : modelli;

  async function elimina(id: string) {
    setDaConfermare(null);
    setEliminando(id);
    setErrore((prev) => ({ ...prev, [id]: "" }));
    const res = await fetch(`/api/esercizi/modelli/${id}`, { method: "DELETE" });
    setEliminando(null);
    if (!res.ok) {
      setErrore((prev) => ({ ...prev, [id]: testi.erroreGenerico }));
      return;
    }
    router.refresh();
  }

  const voceFiltro = (attivo: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      attivo ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
    }`;

  return (
    <div className="space-y-4">
      <div role="group" aria-label={testi.filtro} className="flex flex-wrap items-center gap-1">
        <span className="mr-2 text-sm text-muted-foreground">{testi.filtro}</span>
        <button type="button" aria-pressed={!soloMiei} onClick={() => setSoloMiei(false)} className={voceFiltro(!soloMiei)}>
          {testi.filtroTutti}
        </button>
        <button type="button" aria-pressed={soloMiei} onClick={() => setSoloMiei(true)} className={voceFiltro(soloMiei)}>
          {testi.filtroMiei}
        </button>
      </div>

      {visibili.length === 0 ? (
        <p className="text-sm text-muted-foreground">{testi.nessunoMio}</p>
      ) : (
        <ul className="grid gap-3">
          {visibili.map((m) => (
            <li key={m.id}>
              <Card className="flex-row flex-wrap items-center justify-between gap-4 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    {m.nome}
                    {m.autoreLabel && <span className="ml-2 text-sm font-normal text-muted-foreground">{m.autoreLabel}</span>}
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {m.blocchiLabel.map((b, i) => (
                      <li key={i} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {b}
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm text-muted-foreground">{m.usatoLabel}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/dashboard/esercizi/compiti/nuovo?modello=${encodeURIComponent(m.id)}`}
                      className="text-sm font-medium text-brand-blue hover:underline"
                    >
                      {testi.usa}
                    </Link>
                    {m.eliminabile && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDaConfermare(m.id)}
                        disabled={eliminando === m.id || daConfermare === m.id}
                      >
                        {testi.elimina}
                      </Button>
                    )}
                  </div>
                  {errore[m.id] && <span className="text-xs text-destructive">{errore[m.id]}</span>}
                </div>
                {daConfermare === m.id && (
                  // Stessa conferma inline del ritiro di un compito
                  // (role="alertdialog": un sì/no immediato). Il testo dice
                  // che i compiti già dati non cambiano.
                  <div
                    role="alertdialog"
                    aria-label={testi.eliminaConfermaTitolo}
                    className="basis-full space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
                  >
                    <p className="font-medium">{testi.eliminaConfermaTitolo}</p>
                    <p className="text-sm text-muted-foreground">{testi.eliminaConfermaTesto}</p>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => setDaConfermare(null)}>
                        {testi.annulla}
                      </Button>
                      <Button type="button" variant="destructive" onClick={() => elimina(m.id)}>
                        {testi.eliminaConferma}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
