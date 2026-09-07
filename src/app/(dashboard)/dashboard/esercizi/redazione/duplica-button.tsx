"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export interface DuplicaButtonTesti {
  duplica: string;
  duplicaInCorso: string;
  duplicaErrore: string;
}

/** Il pulsante "duplica": ricreato dopo che l'onda finale di correzioni lo
 * aveva tolto ovunque (item I4) invece di restringerlo alle sole righe già
 * modificabili, che era la correzione richiesta — la duplicazione resta il
 * percorso più battuto per un docente che parte da un esercizio che
 * funziona già, invece che da un modulo vuoto (vedi la specifica).
 *
 * Compare SOLO sulle righe già modificabili dell'elenco
 * (`redazione-elenco-client.tsx`): `duplicaEsercizio` (redazione.ts) copia
 * il contenuto GREZZO dell'ultima versione senza guardare `daNumbas`, quindi
 * duplicare una riga di sola lettura produrrebbe un'altra riga di sola
 * lettura, identica nel verdetto — un vicolo cieco travestito da via
 * d'uscita, e la ragione per cui I4 lo aveva tolto da lì resta valida. Non
 * compare più nella pagina di modifica raggiunta per URL diretto su un
 * esercizio non rappresentabile (`[id]/page.tsx`): stessa ragione. */
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
