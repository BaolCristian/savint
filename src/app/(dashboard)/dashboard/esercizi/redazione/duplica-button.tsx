"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export interface DuplicaButtonTesti {
  duplica: string;
  duplicaInCorso: string;
  duplicaErrore: string;
}

/** Il pulsante "duplica", condiviso fra l'elenco (per ogni riga a sola
 * lettura) e la pagina di modifica (quando si arriva lì con l'URL diretto
 * su un esercizio non rappresentabile): stessa rotta, stesso esito. È
 * l'unica via d'uscita che i messaggi di `daNumbas` promettono per un
 * esercizio che questo editor non sa aprire — vedi redazione.ts. */
export function DuplicaButton({ esercizioId, testi }: { esercizioId: string; testi: DuplicaButtonTesti }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState(false);

  async function duplica() {
    setInCorso(true);
    setErrore(false);
    try {
      const res = await fetch(`/api/esercizi/redazione/${esercizioId}/duplica`, { method: "POST" });
      if (!res.ok) {
        setErrore(true);
        return;
      }
      const corpo = (await res.json()) as { esercizioId: string };
      router.push(`/dashboard/esercizi/redazione/${corpo.esercizioId}`);
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" size="sm" onClick={duplica} disabled={inCorso}>
        {inCorso ? testi.duplicaInCorso : testi.duplica}
      </Button>
      {errore && (
        <p role="alert" className="text-xs text-destructive">
          {testi.duplicaErrore}
        </p>
      )}
    </div>
  );
}
