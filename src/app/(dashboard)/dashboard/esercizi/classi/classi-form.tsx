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
  confermeRimozione,
  testi,
}: {
  classi: Classe[];
  selezionateIniziali: string[];
  // Solo le classi che hanno già dei compiti: togliere la spunta a una di
  // queste (Fix round finale, item 2) deve avvisare PRIMA, nominando quei
  // compiti, invece di farla sparire in silenzio con un salvataggio da una
  // scheda rimasta indietro. Titolo e descrizione arrivano già tradotti dal
  // server (vedi il commento nella pagina): questo componente non li
  // ricalcola, li mostra soltanto.
  confermeRimozione: Record<string, { titolo: string; descrizione: string }>;
  testi: { salva: string; salvato: string; errore: string; confermaRimozioneAzione: string; annulla: string };
}) {
  const router = useRouter();
  const [selezionate, setSelezionate] = useState<Set<string>>(new Set(selezionateIniziali));
  const [busy, setBusy] = useState(false);
  const [esito, setEsito] = useState<"ok" | "errore" | null>(null);
  // Id della classe per cui è aperta la conferma di rimozione, o `null` se
  // nessuna. Un solo dialogo alla volta: la casella resta spuntata finché la
  // conferma non arriva.
  const [classeDaConfermare, setClasseDaConfermare] = useState<string | null>(null);

  function applicaToggle(id: string) {
    setSelezionate((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggle(id: string) {
    setEsito(null);
    const staDeselezionando = selezionate.has(id);
    // Solo togliere la spunta a una classe con compiti già assegnati chiede
    // conferma: rispuntarla, o cambiare una classe senza compiti, resta
    // immediato come prima.
    if (staDeselezionando && confermeRimozione[id]) {
      setClasseDaConfermare(id);
      return;
    }
    applicaToggle(id);
  }

  function confermaTogliSpunta() {
    if (classeDaConfermare) applicaToggle(classeDaConfermare);
    setClasseDaConfermare(null);
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
      {classeDaConfermare && confermeRimozione[classeDaConfermare] && (
        // Stesso pattern di conferma inline di "ricomincia" nel player
        // (role="alertdialog": interrompe per un sì/no immediato, non un
        // annuncio passivo). Nominare i compiti (già nel testo tradotto
        // server-side, vedi la pagina) è il punto: la spunta non deve
        // sparire senza che il docente sappia cosa c'è già assegnato lì.
        <div
          role="alertdialog"
          aria-label={confermeRimozione[classeDaConfermare]!.titolo}
          className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="font-medium">{confermeRimozione[classeDaConfermare]!.titolo}</p>
          <p className="text-sm text-muted-foreground">{confermeRimozione[classeDaConfermare]!.descrizione}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setClasseDaConfermare(null)}>
              {testi.annulla}
            </Button>
            <Button type="button" variant="destructive" onClick={confermaTogliSpunta}>
              {testi.confermaRimozioneAzione}
            </Button>
          </div>
        </div>
      )}
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
