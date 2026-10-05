"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DuplicaButton, type DuplicaButtonTesti } from "./duplica-button";

export interface VoceElenco {
  id: string;
  titolo: string;
  sottotitolo: string;
  anno: number;
  argomento: string;
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
  /** Il link all'anteprima del docente (`/dashboard/esercizi/anteprima/[id]`):
   * compare su OGNI riga, modificabile o no — è precisamente sulle righe di
   * sola lettura che conta di più, perché prima di questo link non c'era
   * nessun altro modo per un docente di vedere quell'esercizio (vedi il
   * brief del task). */
  anteprima: string;
  cerca: string;
  anno: string;
  argomento: string;
  modificabilita: string;
  tutti: string;
  modificabili: string;
  solaLettura: string;
  diagnostica: string;
  nessunRisultato: string;
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
  const [query, setQuery] = useState("");
  const [anno, setAnno] = useState("all");
  const [argomento, setArgomento] = useState("all");
  const [modificabilita, setModificabilita] = useState("all");
  const anni = [...new Set(voci.map((v) => v.anno))].sort((a, b) => a - b);
  const argomenti = [...new Set(voci.map((v) => v.argomento))].sort((a, b) => a.localeCompare(b));
  const filtrate = voci.filter((v) =>
    (anno === "all" || v.anno === Number(anno)) &&
    (argomento === "all" || v.argomento === argomento) &&
    (modificabilita === "all" || (modificabilita === "editable" ? v.modificabile : !v.modificabile)) &&
    `${v.titolo} ${v.sottotitolo}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" aria-label={testi.cerca}>
        <Input type="search" aria-label={testi.cerca} placeholder={testi.cerca} value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 max-w-sm" />
        <select aria-label={testi.anno} value={anno} onChange={(e) => setAnno(e.target.value)} className="h-9 max-w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="all">{testi.anno}: {testi.tutti}</option>
          {anni.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label={testi.argomento} value={argomento} onChange={(e) => setArgomento(e.target.value)} className="h-9 max-w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="all">{testi.argomento}: {testi.tutti}</option>
          {argomenti.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label={testi.modificabilita} value={modificabilita} onChange={(e) => setModificabilita(e.target.value)} className="h-9 max-w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm">
          <option value="all">{testi.tutti}</option>
          <option value="editable">{testi.modificabili}</option>
          <option value="readonly">{testi.solaLettura}</option>
        </select>
      </div>
      {filtrate.length === 0 ? <p className="text-sm text-muted-foreground">{testi.nessunRisultato}</p> : <ul className="divide-y divide-border border-y border-border">
      {filtrate.map((v) => (
        <li key={v.id}>
          <article className="space-y-2 py-3">
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

            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/dashboard/esercizi/anteprima/${v.id}`} className="text-sm text-brand-blue hover:underline">
                {testi.anteprima}
              </Link>
              {v.modificabile && (
                <>
                  <Link href={`/dashboard/esercizi/redazione/${v.id}`} className="text-sm text-brand-blue hover:underline">
                    {testi.apri}
                  </Link>
                  <DuplicaButton esercizioId={v.id} testi={testi} />
                </>
              )}
            </div>

            {!v.modificabile && (
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer">{testi.diagnostica}</summary>
                <p className="text-sm text-muted-foreground">{v.motivo}</p>
              </details>
            )}
          </article>
        </li>
      ))}
      </ul>}
    </div>
  );
}
