"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DuplicaButton, type DuplicaButtonTesti } from "./duplica-button";

export interface VoceElenco {
  id: string;
  titolo: string;
  sottotitolo: string;
  modificabile: boolean;
  /** Il motivo del dominio per cui non è ricostruibile fedelmente — assente
   * per un esercizio modificabile. Il testo di `daNumbas` (da-numbas.ts,
   * `SUGGERIMENTO_REPOSITORIO`) chiude già da sé con "può essere modificato
   * solo intervenendo direttamente nel repository dei contenuti": questa
   * pagina non ripete più quella frase in un secondo paragrafo (era la
   * stessa cosa detta due volte, sulle righe "Derivata di una potenza" e
   * "Disequazione di secondo grado"). */
  motivo: string | null;
  /** Già formattata dal server ("Ultima versione di X, il Y"): un client
   * component non riceve una funzione di formattazione come prop (stesso
   * motivo di `eserciziLabel` in ContenitoriClient). */
  ultimaVersione: string;
}

interface Testi extends DuplicaButtonTesti {
  modificabile: string;
  soloLettura: string;
  apri: string;
}

/** L'elenco della redazione: per ogni esercizio, se è modificabile un link
 * diretto all'editor e "duplica" (il percorso più battuto per partire da un
 * esercizio che già funziona, invece che da un modulo vuoto — vedi la
 * specifica); se non lo è, il motivo per cui `daNumbas` lo rifiuta, che
 * porta già con sé come uscirne (vedi il commento su `VoceElenco.motivo`) —
 * mai una riga "non modificabile" senza spiegazione (vedi il brief del Task
 * 8).
 *
 * "Duplica" NON compare sulle righe di sola lettura: `duplicaEsercizio`
 * copia il contenuto grezzo dell'ultima versione senza guardare `daNumbas`,
 * quindi il duplicato di una riga non rappresentabile eredita lo stesso
 * identico verdetto — un'altra riga di sola lettura, mai una diventata
 * modificabile (la ragione dietro l'item I4 dell'onda di correzioni, che
 * però lo aveva tolto anche dalle righe modificabili: quella parte era una
 * correzione eccessiva, corretta qui). */
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
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/dashboard/esercizi/redazione/${v.id}`} className="text-sm text-brand-blue hover:underline">
                  {testi.apri}
                </Link>
                <DuplicaButton esercizioId={v.id} testi={testi} />
              </div>
            ) : (
              <div className="space-y-2 rounded-md border border-dashed border-muted-foreground/30 p-2">
                <p className="text-sm text-muted-foreground">{v.motivo}</p>
              </div>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
