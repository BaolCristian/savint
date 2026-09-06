"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Classe {
  id: string;
  name: string;
  yearLevel: number | null;
}

/** Casella per classe + salvataggio con `dichiaraInsegnamento` (via API).
 * Le etichette arrivano già tradotte dal componente server (che sa
 * `getTranslations`): un client component non può ricevere funzioni come
 * prop, quindi qui non si chiama `useTranslations`. */
export function ClassiForm({
  classi,
  selezionateIniziali,
  testi,
}: {
  classi: Classe[];
  selezionateIniziali: string[];
  testi: { salva: string; salvato: string; errore: string };
}) {
  const router = useRouter();
  const [selezionate, setSelezionate] = useState<Set<string>>(new Set(selezionateIniziali));
  const [busy, setBusy] = useState(false);
  const [esito, setEsito] = useState<"ok" | "errore" | null>(null);

  function toggle(id: string) {
    setEsito(null);
    setSelezionate((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function salva() {
    setBusy(true);
    setEsito(null);
    const res = await fetch("/api/esercizi/classi/insegnate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ classeIds: [...selezionate] }),
    });
    setBusy(false);
    if (!res.ok) {
      setEsito("errore");
      return;
    }
    setEsito("ok");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ul className="grid gap-2 sm:grid-cols-2">
        {classi.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-input p-3 text-sm hover:bg-muted/50">
              <input
                type="checkbox"
                checked={selezionate.has(c.id)}
                onChange={() => toggle(c.id)}
                className="h-4 w-4"
              />
              <span>
                {c.name}
                {c.yearLevel != null && <span className="text-muted-foreground"> · {c.yearLevel}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <Button onClick={salva} disabled={busy}>
          {testi.salva}
        </Button>
        {esito === "ok" && <span className="text-sm text-brand-green">{testi.salvato}</span>}
        {esito === "errore" && <span className="text-sm text-destructive">{testi.errore}</span>}
      </div>
    </div>
  );
}
