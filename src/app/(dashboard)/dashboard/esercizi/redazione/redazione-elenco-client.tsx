"use client";

import Link from "next/link";
import { useState } from "react";
import { MessageSquareIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CondividiDialog, type TestiCondivisione } from "@/components/esercizi/condivisione/condividi-dialog";
import { DuplicaButton, type DuplicaButtonTesti } from "./duplica-button";

export interface VoceElenco {
  id: string;
  titolo: string;
  sottotitolo: string;
  /** "Classe 2": il sottotitolo dentro il gruppo, dove l'argomento è già il titolo. */
  classe: string;
  anno: number;
  argomento: string;
  modificabile: boolean;
  /** Il ruolo di chi guarda, già tradotto in permessi dalla pagina (`puo`):
   * "Apri" solo con `modificare`, "Condividi" solo con `condividere`. */
  puoModificare: boolean;
  puoCondividere: boolean;
  /** Per il filtro "Di chi": "miei" (proprietario e autore), "condivisi"
   * (con un ruolo ricevuto), "altri" (solo per l'ADMIN: visibile perché è
   * amministratore, non perché è suo). */
  diChi: "miei" | "condivisi" | "altri";
  /** "Tuo · Privato", "Editor · di Rossi"...: già composta dalla pagina. */
  etichetta: string;
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
  /** I commenti aperti, solo per chi può condividere (altrimenti 0), e la
   * loro descrizione già tradotta dalla pagina ("2 commenti aperti"). */
  commentiAperti: number;
  commentiApertiTesto: string;
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
  diChi: string;
  miei: string;
  condivisiConMe: string;
  diAltri: string;
  condivisione: TestiCondivisione;
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
type Gruppo = { argomento: string; voci: VoceElenco[] };

/** Gli esercizi per argomento, in ordine alfabetico. "Percentuali" e
 * "percentuali " finiscono nello stesso gruppo: l'argomento lo scrive a mano
 * chi redige, e il catalogo non deve spezzarlo per una maiuscola. */
function perArgomento(voci: VoceElenco[]): Gruppo[] {
  const gruppi = new Map<string, Gruppo>();
  for (const v of voci) {
    const chiave = v.argomento.trim().toLocaleLowerCase();
    const gruppo = gruppi.get(chiave) ?? { argomento: v.argomento.trim(), voci: [] };
    gruppo.voci.push(v);
    gruppi.set(chiave, gruppo);
  }
  return [...gruppi.values()].sort((a, b) => a.argomento.localeCompare(b.argomento, "it"));
}

/** Una riga si apre nell'editor solo se l'editor sa ricostruirla E chi
 * guarda può modificarla: per tutti gli altri è "sola lettura". */
const apribile = (v: VoceElenco) => v.modificabile && v.puoModificare;

/** "analisi logica" → "Analisi logica", come lo mostra l'intestazione del gruppo. */
const maiuscola = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);

const SELECT = "h-9 max-w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm";

export function RedazioneElencoClient({ voci, testi, admin = false }: { voci: VoceElenco[]; testi: Testi; admin?: boolean }) {
  const [query, setQuery] = useState("");
  const [anno, setAnno] = useState("all");
  const [argomento, setArgomento] = useState("all");
  const [modificabilita, setModificabilita] = useState("all");
  const [diChi, setDiChi] = useState("all");
  const anni = [...new Set(voci.map((v) => v.anno))].sort((a, b) => a - b);
  const argomenti = [...new Set(voci.map((v) => v.argomento))].sort((a, b) => a.localeCompare(b));
  const filtrate = voci.filter((v) =>
    (anno === "all" || v.anno === Number(anno)) &&
    (argomento === "all" || v.argomento === argomento) &&
    (modificabilita === "all" || (modificabilita === "editable" ? apribile(v) : !apribile(v))) &&
    (diChi === "all" || v.diChi === diChi) &&
    `${v.titolo} ${v.sottotitolo}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" aria-label={testi.cerca}>
        <Input type="search" aria-label={testi.cerca} placeholder={testi.cerca} value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 max-w-xs" />
        <select aria-label={testi.anno} value={anno} onChange={(e) => setAnno(e.target.value)} className={SELECT}>
          <option value="all">{testi.anno}: {testi.tutti}</option>
          {anni.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label={testi.argomento} value={argomento} onChange={(e) => setArgomento(e.target.value)} className={SELECT}>
          <option value="all">{testi.argomento}: {testi.tutti}</option>
          {argomenti.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label={testi.modificabilita} value={modificabilita} onChange={(e) => setModificabilita(e.target.value)} className={SELECT}>
          <option value="all">{testi.tutti}</option>
          <option value="editable">{testi.modificabili}</option>
          <option value="readonly">{testi.solaLettura}</option>
        </select>
        <select aria-label={testi.diChi} value={diChi} onChange={(e) => setDiChi(e.target.value)} className={SELECT}>
          <option value="all">{testi.diChi}: {testi.tutti}</option>
          <option value="miei">{testi.miei}</option>
          <option value="condivisi">{testi.condivisiConMe}</option>
          {admin && <option value="altri">{testi.diAltri}</option>}
        </select>
      </div>
      {filtrate.length === 0 ? <p className="text-sm text-muted-foreground">{testi.nessunRisultato}</p> : (
        <div className="space-y-6">
          {perArgomento(filtrate).map((g) => (
            <section key={g.argomento} aria-label={g.argomento} className="rounded-xl border border-border bg-card shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl border-b border-border border-l-4 border-l-brand-blue bg-muted/50 px-4 py-2.5">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <span className="first-letter:uppercase">{g.argomento}</span>
                  <span className="rounded-full bg-brand-blue/10 px-2.5 py-0.5 text-sm font-medium text-brand-blue">{g.voci.length}</span>
                </h2>
                {/* L'argomento si condivide solo per gli esercizi propri: il
                    pulsante c'è se nel gruppo ce n'è almeno uno (anche per
                    l'ADMIN, che qui condivide i suoi). */}
                {g.voci.some((v) => v.diChi === "miei") && (
                  <CondividiDialog risorsa={{ tipo: "argomento", argomento: g.argomento }} titolo={maiuscola(g.argomento)} testi={testi.condivisione} compatto />
                )}
              </div>
              <ul className="divide-y divide-border px-4">
                {g.voci.map((v) => (
                  <li key={v.id}>
                    <article className="space-y-2 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{v.titolo}</p>
                          <p className="text-sm text-muted-foreground">{v.classe}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {v.commentiAperti > 0 && (
                            <Link
                              href={`/dashboard/esercizi/anteprima/${v.id}`}
                              title={v.commentiApertiTesto}
                              aria-label={v.commentiApertiTesto}
                              className="inline-flex items-center gap-1 rounded-full border border-brand-orange/40 bg-brand-orange-50 px-2 py-0.5 text-xs font-medium text-brand-ink hover:bg-brand-orange/20"
                            >
                              <MessageSquareIcon className="size-3.5 text-brand-orange" aria-hidden />
                              {v.commentiAperti}
                            </Link>
                          )}
                          <Badge variant={v.diChi === "miei" ? "secondary" : "outline"}>{v.etichetta}</Badge>
                          <Badge variant={apribile(v) ? "default" : "outline"}>
                            {apribile(v) ? testi.modificabile : testi.soloLettura}
                          </Badge>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground">{v.ultimaVersione}</p>

                      <div className="flex flex-wrap items-center gap-3">
                        <Link href={`/dashboard/esercizi/anteprima/${v.id}`} className="text-sm text-brand-blue hover:underline">
                          {testi.anteprima}
                        </Link>
                        {apribile(v) && (
                          <Link href={`/dashboard/esercizi/redazione/${v.id}`} className="text-sm text-brand-blue hover:underline">
                            {testi.apri}
                          </Link>
                        )}
                        {/* Duplicare basta vederlo: la copia è di chi duplica. */}
                        {v.modificabile && <DuplicaButton esercizioId={v.id} testi={testi} />}
                        {v.puoCondividere && (
                          <CondividiDialog risorsa={{ tipo: "esercizio", id: v.id }} titolo={v.titolo} testi={testi.condivisione} admin={admin} compatto />
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
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
