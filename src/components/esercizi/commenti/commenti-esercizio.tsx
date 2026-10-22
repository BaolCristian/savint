"use client";

import { useId, useState, type FormEvent } from "react";
import { CheckIcon, ChevronDownIcon, MessageSquareIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { withBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";

/** Un commento come arriva dal server (`Commento`, commenti.ts), con la data
 * già in forma di stringa ISO: è così che passa da una pagina server a un
 * client component, e così che torna dalla GET. Ripetuto qui perché quel
 * modulo legge il database e un client component non deve importarlo. */
type RispostaVista = { id: string; autoreNome: string; testo: string; createdAt: string; mio: boolean };
export type CommentoVista = RispostaVista & { risolto: boolean; risposte: RispostaVista[] };

/** Cosa può fare chi guarda, già calcolato dalla pagina col suo ruolo
 * (`puo`): scrivere e rispondere, risolvere, eliminare anche i commenti
 * altrui (proprietario, ADMIN). I propri si eliminano sempre. */
export type PermessiCommenti = { commentare: boolean; risolvere: boolean; eliminaTutti: boolean };

/** I testi già tradotti dalla pagina (vedi `testiCommenti`). `risolti` e
 * `contatore` arrivano col segnaposto `{n}` intatto: lo riempie la sezione. */
export interface TestiCommenti {
  titolo: string;
  nessuno: string;
  scrivi: string;
  invia: string;
  invioInCorso: string;
  rispondi: string;
  scriviRisposta: string;
  inviaRisposta: string;
  annulla: string;
  segnaRisolto: string;
  riapri: string;
  risolti: string;
  elimina: string;
  confermaElimina: string;
  eliminaConRisposte: string;
  tu: string;
  erroreTesto: string;
  erroreNonPermesso: string;
  erroreNonTrovato: string;
  erroreTroppi: string;
  erroreGenerico: string;
}

const MAX = 2000;

function messaggioErrore(status: number, testi: TestiCommenti): string {
  if (status === 422) return testi.erroreTesto;
  if (status === 403) return testi.erroreNonPermesso;
  if (status === 404) return testi.erroreNonTrovato;
  if (status === 429) return testi.erroreTroppi;
  return testi.erroreGenerico;
}

/** La sezione "Commenti" accanto all'esercizio (spec "Commenti"): gli aperti
 * in alto, ciascuno con le sue risposte; i risolti in un gruppo "Risolti (n)"
 * chiuso di partenza. Testo semplice, mai HTML: React lo mostra così com'è.
 * Dopo ogni azione riuscita l'elenco si rilegge dal server. */
export function CommentiEsercizio({
  esercizioId,
  iniziali,
  permessi,
  testi,
  locale,
  richiudibile = false,
}: {
  esercizioId: string;
  iniziali: CommentoVista[];
  permessi: PermessiCommenti;
  testi: TestiCommenti;
  locale: "it" | "en";
  /** Per l'editor, dove lo spazio è dell'esercizio: sotto il breakpoint
   * `2xl` la sezione parte chiusa (solo il titolo col numero degli aperti) e
   * si apre col titolo; da `2xl` in su sta in una colonna sua, sempre aperta. */
  richiudibile?: boolean;
}) {
  const [commenti, setCommenti] = useState(iniziali);
  const [nuovo, setNuovo] = useState("");
  const [rispondendoA, setRispondendoA] = useState<string | null>(null);
  const [risposta, setRisposta] = useState("");
  const [daEliminare, setDaEliminare] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [aperta, setAperta] = useState(!richiudibile);
  const idTitolo = useId();
  const idCorpo = useId();

  const formattaData = (iso: string) =>
    new Date(iso).toLocaleString(locale === "en" ? "en-GB" : "it-IT", { dateStyle: "medium", timeStyle: "short" });

  async function ricarica() {
    const res = await fetch(withBasePath(`/api/esercizi/redazione/${esercizioId}/commenti`));
    if (res.ok) setCommenti(((await res.json()) as { commenti: CommentoVista[] }).commenti);
  }

  /** Una scrittura: in caso di rifiuto mostra il motivo, altrimenti rilegge. */
  async function esegui(url: string, metodo: string, corpo?: unknown): Promise<boolean> {
    setOccupato(true);
    setErrore(null);
    try {
      const res = await fetch(withBasePath(url), {
        method: metodo,
        ...(corpo !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) } : {}),
      });
      if (!res.ok) {
        setErrore(messaggioErrore(res.status, testi));
        return false;
      }
      await ricarica();
      return true;
    } catch {
      setErrore(testi.erroreGenerico);
      return false;
    } finally {
      setOccupato(false);
    }
  }

  async function scrivi(e: FormEvent) {
    e.preventDefault();
    const testo = nuovo.trim();
    if (!testo) return;
    if (await esegui(`/api/esercizi/redazione/${esercizioId}/commenti`, "POST", { testo })) setNuovo("");
  }

  async function rispondi(e: FormEvent, parentId: string) {
    e.preventDefault();
    const testo = risposta.trim();
    if (!testo) return;
    if (await esegui(`/api/esercizi/redazione/${esercizioId}/commenti`, "POST", { testo, parentId })) {
      setRisposta("");
      setRispondendoA(null);
    }
  }

  const risolvi = (id: string, risolto: boolean) => esegui(`/api/esercizi/commenti/${id}`, "PATCH", { risolto });

  async function elimina(id: string) {
    if (await esegui(`/api/esercizi/commenti/${id}`, "DELETE")) setDaEliminare(null);
  }

  const aperti = commenti.filter((c) => !c.risolto);
  const risolti = commenti.filter((c) => c.risolto);

  /** Intestazione e testo: uguali per un commento e per una risposta. */
  function corpo(c: RispostaVista) {
    return (
      <>
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {c.autoreNome}
            {c.mio && <span className="font-normal text-muted-foreground"> ({testi.tu})</span>}
          </span>
          <time dateTime={c.createdAt} suppressHydrationWarning>{formattaData(c.createdAt)}</time>
        </p>
        <p className="whitespace-pre-wrap break-words text-sm">{c.testo}</p>
      </>
    );
  }

  /** "Elimina", da mettere in fondo alla riga delle azioni: c'è sui propri
   * commenti e, per chi può condividere l'esercizio, su tutti. */
  function pulsanteElimina(c: RispostaVista) {
    if (!(c.mio || permessi.eliminaTutti) || daEliminare === c.id) return null;
    return (
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setDaEliminare(c.id)}
      >
        {testi.elimina}
      </Button>
    );
  }

  /** La conferma prima di eliminare: con delle risposte dice che se ne
   * vanno anche quelle. */
  function conferma(c: RispostaVista, risposte: number) {
    if (daEliminare !== c.id) return null;
    return (
      <div role="group" aria-label={testi.confermaElimina} className="flex flex-wrap items-center gap-2 rounded-md bg-destructive/5 p-2 text-sm">
        <span>{testi.confermaElimina}</span>
        <Button type="button" size="xs" variant="destructive" disabled={occupato} onClick={() => elimina(c.id)}>
          {risposte > 0 ? testi.eliminaConRisposte : testi.elimina}
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={() => setDaEliminare(null)}>{testi.annulla}</Button>
      </div>
    );
  }

  function voce(c: CommentoVista) {
    return (
      <li key={c.id}>
        <article className={cn("space-y-1.5 rounded-lg border bg-card p-3", c.risolto && "bg-muted/40")}>
          {corpo(c)}
          <div className="-ml-2 flex flex-wrap gap-1">
            {permessi.commentare && rispondendoA !== c.id && (
              <Button type="button" size="xs" variant="ghost" onClick={() => { setRispondendoA(c.id); setRisposta(""); }}>
                {testi.rispondi}
              </Button>
            )}
            {permessi.risolvere && (
              <Button type="button" size="xs" variant="ghost" disabled={occupato} onClick={() => risolvi(c.id, !c.risolto)}>
                {c.risolto ? <RotateCcwIcon aria-hidden /> : <CheckIcon aria-hidden />}
                {c.risolto ? testi.riapri : testi.segnaRisolto}
              </Button>
            )}
            {pulsanteElimina(c)}
          </div>
          {conferma(c, c.risposte.length)}
          {c.risposte.length > 0 && (
            <ul className="space-y-2 border-l-2 border-brand-blue/20 pl-3">
              {c.risposte.map((r) => (
                <li key={r.id} className="space-y-1">
                  {corpo(r)}
                  <div className="-ml-2 flex">{pulsanteElimina(r)}</div>
                  {conferma(r, 0)}
                </li>
              ))}
            </ul>
          )}
          {rispondendoA === c.id && (
            <form onSubmit={(e) => rispondi(e, c.id)} className="space-y-2 pl-3">
              <Textarea
                aria-label={testi.scriviRisposta}
                placeholder={testi.scriviRisposta}
                value={risposta}
                maxLength={MAX}
                onChange={(e) => setRisposta(e.target.value)}
                className="min-h-12"
                autoFocus
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={occupato || !risposta.trim()}>{testi.inviaRisposta}</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRispondendoA(null)}>{testi.annulla}</Button>
              </div>
            </form>
          )}
        </article>
      </li>
    );
  }

  const intestazione = (
    <>
      <MessageSquareIcon className="size-5 text-brand-blue" aria-hidden />
      {testi.titolo}
      {aperti.length > 0 && (
        <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-sm font-medium text-brand-blue">{aperti.length}</span>
      )}
    </>
  );

  return (
    <section aria-labelledby={idTitolo} className="space-y-3">
      <h2 id={idTitolo} className="text-lg font-semibold">
        {richiudibile ? (
          <button
            type="button"
            aria-expanded={aperta}
            aria-controls={idCorpo}
            onClick={() => setAperta((a) => !a)}
            className="flex items-center gap-2 2xl:pointer-events-none"
          >
            {intestazione}
            <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform 2xl:hidden", aperta && "rotate-180")} aria-hidden />
          </button>
        ) : (
          <span className="flex items-center gap-2">{intestazione}</span>
        )}
      </h2>

      <div id={idCorpo} className={cn("space-y-3", !aperta && "hidden 2xl:block")}>
        {permessi.commentare && (
          <form onSubmit={scrivi} className="space-y-2">
            <Textarea
              aria-label={testi.scrivi}
              placeholder={testi.scrivi}
              value={nuovo}
              maxLength={MAX}
              onChange={(e) => setNuovo(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={occupato || !nuovo.trim()}>
              {occupato ? testi.invioInCorso : testi.invia}
            </Button>
          </form>
        )}

        {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}

        {commenti.length === 0 ? (
          <p className="text-sm text-muted-foreground">{testi.nessuno}</p>
        ) : (
          <>
            {aperti.length > 0 && <ul className="space-y-2">{aperti.map(voce)}</ul>}
            {risolti.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                  {testi.risolti.replace("{n}", String(risolti.length))}
                </summary>
                <ul className="mt-2 space-y-2">{risolti.map(voce)}</ul>
              </details>
            )}
          </>
        )}
      </div>
    </section>
  );
}
