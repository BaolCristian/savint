"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface VoceElenco {
  id: string;
  titolo: string;
  sottotitolo: string;
  modificabile: boolean;
  /** Il motivo del dominio per cui non è ricostruibile fedelmente — assente
   * per un esercizio modificabile. */
  motivo: string | null;
  /** Già formattata dal server ("Ultima versione di X, il Y"): un client
   * component non riceve una funzione di formattazione come prop (stesso
   * motivo di `eserciziLabel` in ContenitoriClient). */
  ultimaVersione: string;
}

interface Testi {
  modificabile: string;
  soloLettura: string;
  apri: string;
  /** Item I4 dell'onda di correzioni: "duplica" è sparito da qui. Prima
   * offriva una via d'uscita che non esisteva davvero — `duplicaEsercizio`
   * copia il contenuto GREZZO dell'ultima versione, quindi il duplicato di
   * un esercizio non rappresentabile eredita esattamente lo stesso verdetto
   * (`daNumbas` lo rifiuta identico, perché il contenuto è identico): ogni
   * clic lasciava un'altra riga di sola lettura, mai una diventata
   * modificabile. Il messaggio diceva anche di continuare a modificarlo "in
   * Numbas", un editor che in questo prodotto non esiste. Restava quindi
   * solo l'altra strada che la specifica offriva fin dall'inizio: dirlo
   * chiaramente, invece di far inseguire un pulsante che non porta da
   * nessuna parte. */
  soloRepository: string;
}

/** L'elenco della redazione: per ogni esercizio, se è modificabile un link
 * diretto all'editor; se non lo è, il motivo per cui `daNumbas` lo rifiuta e
 * che può essere cambiato solo intervenendo nel repository dei contenuti —
 * mai una riga "non modificabile" senza spiegazione (vedi il brief del Task
 * 8), e mai più un "duplica" che promette un editor che non esiste (I4). */
export function RedazioneElencoClient({ voci, testi }: { voci: VoceElenco[]; testi: Testi }) {
  return (
    <ul className="grid gap-3">
      {voci.map((v) => (
        <li key={v.id}>
          <Card className="gap-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{v.titolo}</p>
                <p className="text-sm text-muted-foreground">{v.sottotitolo}</p>
              </div>
              <Badge variant={v.modificabile ? "default" : "outline"}>
                {v.modificabile ? testi.modificabile : testi.soloLettura}
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground">{v.ultimaVersione}</p>

            {v.modificabile ? (
              <Link href={`/dashboard/esercizi/redazione/${v.id}`} className="text-sm text-brand-blue hover:underline">
                {testi.apri}
              </Link>
            ) : (
              <div className="space-y-2 rounded-md border border-dashed border-muted-foreground/30 p-2">
                <p className="text-sm text-muted-foreground">{v.motivo}</p>
                <p className="text-sm text-muted-foreground">{testi.soloRepository}</p>
              </div>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
