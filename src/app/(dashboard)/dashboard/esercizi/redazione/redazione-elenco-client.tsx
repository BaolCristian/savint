"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DuplicaButton } from "./duplica-button";

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
  duplica: string;
  duplicaInCorso: string;
  duplicaErrore: string;
}

/** L'elenco della redazione: per ogni esercizio, se è modificabile un link
 * diretto all'editor; se non lo è, il motivo per cui `daNumbas` lo rifiuta
 * e "duplica" come via d'uscita — mai una riga "non modificabile" senza
 * spiegazione (vedi il brief del Task 8). */
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
                <DuplicaButton
                  esercizioId={v.id}
                  testi={{ duplica: testi.duplica, duplicaInCorso: testi.duplicaInCorso, duplicaErrore: testi.duplicaErrore }}
                />
              </div>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
