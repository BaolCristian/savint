"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formattaQuando } from "@/components/esercizi/verifica/data-verifica";
import { withBasePath } from "@/lib/base-path";
// Solo i tipi: verifiche.ts e misure-pdp.ts leggono il database, e un
// client component non deve tirarseli dietro nel bundle.
import type { Monitoraggio } from "@/lib/esercizi/verifiche";
import type { MisurePdpValori } from "@/lib/esercizi/misure-pdp";
import { MisurePdpDialog } from "../../classi/misure-pdp-dialog";
import { ImpostazioniVerifica } from "./impostazioni-verifica";
import { MinutiDialog, MonitoraggioVerifica } from "./monitoraggio-verifica";
import { RisultatiVerifica } from "./risultati-verifica";

/** Un valore come arriva da JSON: le date diventano stringhe ISO. */
type Serializzato<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serializzato<U>[]
    : T extends object
      ? { [K in keyof T]: Serializzato<T[K]> }
      : T;

/** Il monitoraggio come lo restituisce `GET /api/esercizi/verifiche/[id]`
 * (e come la pagina lo passa all'inizio). */
export type MonitoraggioJson = Serializzato<Monitoraggio>;
export type VerificaJson = MonitoraggioJson["verifica"];
/** Una riga di `GET .../misure`. */
export type MisuraVerificaJson = { studentId: string; nome: string; misure: MisurePdpValori; personalizzate: boolean };
/** Il corpo di `POST .../azioni`. */
export type CorpoAzione =
  | { azione: "avvia" }
  | { azione: "chiudi" }
  | { azione: "minuti"; minuti: number; studentId?: string }
  | { azione: "recupero"; studentIds: string[] }
  | { azione: "chiudiRecupero"; studentIds: string[] }
  | { azione: "pubblica"; studentIds?: string[] };

const OGNI_MS = 5_000;
// Un secondo dopo l'avvio programmato: il server lo applica alla prima
// lettura successiva, e l'orologio del PC può essere un po' indietro.
const MARGINE_AVVIO_MS = 1_000;
// Il ritardo più lungo che setTimeout accetta (circa 24 giorni).
const RITARDO_MAX_MS = 2_147_483_647;

const COLORE_STATO: Record<VerificaJson["stato"], string> = {
  PREPARATA: "bg-brand-blue-50 text-brand-blue",
  IN_CORSO: "bg-brand-orange-50 text-brand-orange",
  CHIUSA: "bg-muted text-foreground",
  PUBBLICATA: "bg-brand-green-50 text-brand-green",
};

/**
 * La pagina della verifica dal lato del docente. PREPARATA: impostazioni,
 * misure PDP per questa verifica, Avvia e Ritira. Da IN_CORSO in poi: il
 * monitoraggio (mai un punteggio), con minuti in più, chiusura e recuperi;
 * in CHIUSA/PUBBLICATA sotto ci sono i risultati: correzione e
 * pubblicazione.
 *
 * Si rilegge `GET` ogni 5 s mentre qualcuno può lavorare (in corso, o un
 * recupero aperto) e la scheda è visibile, subito dopo ogni azione e al
 * ritorno sulla scheda; in PREPARATA con l'avvio programmato, una volta
 * sola all'orario previsto.
 */
export function VerificaDocenteClient({ compitoId, iniziale, misureIniziali }: {
  compitoId: string;
  iniziale: MonitoraggioJson;
  misureIniziali: MisuraVerificaJson[] | null;
}) {
  const t = useTranslations("esercizi.verifica.docente");
  const locale = useLocale() === "en" ? "en" : "it";
  const router = useRouter();
  const api = `/api/esercizi/verifiche/${compitoId}`;

  const [dati, setDati] = useState(iniziale);
  // Quando è arrivato l'ultimo monitoraggio e che ora è adesso (sul PC):
  // la differenza fa scorrere il tempo residuo fra una lettura e l'altra.
  const [ricevutoAt, setRicevutoAt] = useState(() => Date.now());
  const [adesso, setAdesso] = useState(() => Date.now());
  const [misure, setMisure] = useState(misureIniziali ?? []);
  const [erroreMisure, setErroreMisure] = useState(false);
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [sparita, setSparita] = useState(false);
  const [dialogo, setDialogo] = useState<"avvia" | "chiudi" | null>(null);
  const [confermaRitiro, setConfermaRitiro] = useState(false);
  // Le risposte arrivano in un ordine qualsiasi: vale solo l'ultima chiesta.
  const ultimaRichiesta = useRef(0);

  const aggiorna = useCallback(async () => {
    const numero = ++ultimaRichiesta.current;
    try {
      const res = await fetch(withBasePath(api));
      if (numero !== ultimaRichiesta.current) return;
      if (res.status === 404) {
        setSparita(true);
        return;
      }
      if (!res.ok) return;
      const corpo = (await res.json()) as MonitoraggioJson;
      if (numero !== ultimaRichiesta.current) return;
      const ora = Date.now();
      setDati(corpo);
      setRicevutoAt(ora);
      setAdesso(ora);
    } catch {
      // Rete assente: ci riprova il prossimo giro.
    }
  }, [api]);

  const stato = dati.verifica.stato;
  const attivo = !sparita && (stato === "IN_CORSO" || dati.recuperiAperti > 0);

  useEffect(() => {
    if (!attivo) return;
    const visibile = () => document.visibilityState !== "hidden";
    const giro = setInterval(() => {
      if (visibile()) void aggiorna();
    }, OGNI_MS);
    const alRitorno = () => {
      if (visibile()) void aggiorna();
    };
    document.addEventListener("visibilitychange", alRitorno);
    return () => {
      clearInterval(giro);
      document.removeEventListener("visibilitychange", alRitorno);
    };
  }, [attivo, aggiorna]);

  // Il tempo residuo scorre ogni secondo fra una lettura e l'altra.
  useEffect(() => {
    if (!attivo) return;
    const giro = setInterval(() => setAdesso(Date.now()), 1_000);
    return () => clearInterval(giro);
  }, [attivo]);

  // L'avvio programmato: una lettura sola, all'orario previsto (contato
  // sull'ora del server di quest'ultima lettura).
  const avvioProgrammato = stato === "PREPARATA" ? dati.verifica.avvioProgrammatoAt : null;
  const oraServer = dati.oraServer;
  useEffect(() => {
    if (!avvioProgrammato) return;
    const mancano = Date.parse(avvioProgrammato) - Date.parse(oraServer);
    if (!(mancano > 0) || mancano + MARGINE_AVVIO_MS > RITARDO_MAX_MS) return;
    const attesa = setTimeout(() => void aggiorna(), mancano + MARGINE_AVVIO_MS);
    return () => clearTimeout(attesa);
  }, [avvioProgrammato, oraServer, aggiorna]);

  function messaggioErrore(status: number, codice: unknown): string {
    if (status === 404) return t("errori.nonTrovata");
    if (status === 409) return t("errori.stato");
    if (status === 429) return t("errori.troppe");
    if (codice === "studenti_non_validi") return t("errori.studenti");
    if (codice === "valore_non_valido") return t("errori.valore");
    return t("errori.generico");
  }

  async function esegui(corpo: CorpoAzione): Promise<boolean> {
    setOccupato(true);
    setErrore(null);
    let ok = false;
    try {
      const res = await fetch(withBasePath(`${api}/azioni`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      ok = res.ok;
      if (!ok) setErrore(messaggioErrore(res.status, (await res.json().catch(() => ({}))).error));
    } catch {
      setErrore(t("errori.generico"));
    }
    // Dopo ogni azione, riuscita o no, lo stato vero è quello del server.
    await aggiorna();
    setOccupato(false);
    return ok;
  }

  async function ricaricaMisure() {
    try {
      const res = await fetch(withBasePath(`${api}/misure`));
      if (!res.ok) throw new Error(String(res.status));
      setMisure(((await res.json()) as { studenti: MisuraVerificaJson[] }).studenti);
      setErroreMisure(false);
    } catch {
      setErroreMisure(true);
    }
  }

  async function ritira() {
    setOccupato(true);
    setErrore(null);
    try {
      const res = await fetch(withBasePath(`/api/esercizi/compiti/${compitoId}`), { method: "DELETE" });
      if (res.ok) {
        // La verifica non esiste più per questa pagina: si torna all'elenco.
        router.push("/dashboard/esercizi/compiti");
        return;
      }
      setErrore(messaggioErrore(res.status, null));
    } catch {
      setErrore(t("errori.generico"));
    }
    setConfermaRitiro(false);
    setOccupato(false);
  }

  async function conferma() {
    const azione = dialogo;
    setDialogo(null);
    if (azione) await esegui({ azione });
  }

  const v = dati.verifica;
  const preparata = stato === "PREPARATA";
  const conRisultati = stato === "CHIUSA" || stato === "PUBBLICATA";
  // I risultati si rileggono quando il monitoraggio dice che qualcosa è
  // cambiato: lo stato della verifica o quello di una prova (un recupero
  // consegnato).
  const aggiornamentoRisultati = `${stato}|${dati.righe.map((r) => `${r.studentId}:${r.stato}:${r.recupero}`).join(",")}`;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link href="/dashboard/esercizi/compiti" className="text-sm text-brand-blue hover:underline">
          {t("torna")}
        </Link>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-brand-magenta/10 px-1.5 py-0.5 text-xs font-medium text-brand-magenta">{t("etichetta")}</span>
            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${COLORE_STATO[stato]}`}>{t(`stato.${stato}`)}</span>
          </div>
          <h1 className="text-2xl font-semibold break-words">{dati.titolo}</h1>
          <p className="text-sm text-muted-foreground">{t("classe", { classe: dati.classe })}</p>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          {preparata ? (
            <div>
              <dt className="text-muted-foreground">{t("avvioPrevisto")}</dt>
              <dd className="font-medium">
                {v.avvioProgrammatoAt ? formattaQuando(new Date(v.avvioProgrammatoAt), locale) : t("avvioManuale")}
              </dd>
            </div>
          ) : (
            v.avviataAt && (
              <div>
                <dt className="text-muted-foreground">{t("avviata")}</dt>
                <dd className="font-medium">{formattaQuando(new Date(v.avviataAt), locale)}</dd>
              </div>
            )
          )}
          {v.chiusaAt && (
            <div>
              <dt className="text-muted-foreground">{t("chiusa")}</dt>
              <dd className="font-medium">{formattaQuando(new Date(v.chiusaAt), locale)}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">{t("durata")}</dt>
            <dd className="font-medium">
              {t("durataValore", { n: v.durataMinuti })}
              {v.minutiExtra > 0 && <span className="ml-2 text-brand-blue">{t("durataATutti", { n: v.minutiExtra })}</span>}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("formulario")}</dt>
            <dd className="font-medium">
              {v.formularioFile ? (
                <a
                  href={withBasePath(`${api}/formulario`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-blue hover:underline"
                >
                  {t("apriFormulario")}
                </a>
              ) : (
                t("nessunFormulario")
              )}
            </dd>
          </div>
        </dl>

        {!sparita && (preparata || stato === "IN_CORSO") && (
          <div className="flex flex-wrap items-center gap-2">
            {preparata && (
              <>
                <Button type="button" disabled={occupato} onClick={() => setDialogo("avvia")}>{t("avvia")}</Button>
                <Button type="button" variant="outline" disabled={occupato || confermaRitiro} onClick={() => setConfermaRitiro(true)}>
                  {t("ritira")}
                </Button>
              </>
            )}
            {stato === "IN_CORSO" && (
              <>
                <MinutiDialog
                  titolo={t("minuti.titoloTutti")}
                  descrizione={t("minuti.descrizioneTutti")}
                  testo={t("minuti.aTutti")}
                  disabled={occupato}
                  onScegli={(minuti) => void esegui({ azione: "minuti", minuti })}
                />
                <Button type="button" variant="destructive" disabled={occupato} onClick={() => setDialogo("chiudi")}>
                  {t("chiudi")}
                </Button>
              </>
            )}
          </div>
        )}

        {sparita && <p role="alert" className="text-sm text-destructive">{t("errori.nonTrovata")}</p>}
        {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}

        {confermaRitiro && (
          // La stessa conferma in linea del ritiro di un compito.
          <div
            role="alertdialog"
            aria-label={t("ritiraTitolo")}
            className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          >
            <p className="font-medium">{t("ritiraTitolo")}</p>
            <p className="text-sm text-muted-foreground">{t("ritiraTesto")}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setConfermaRitiro(false)}>{t("annulla")}</Button>
              <Button type="button" variant="destructive" disabled={occupato} onClick={ritira}>{t("ritiraConferma")}</Button>
            </div>
          </div>
        )}
      </header>

      {preparata ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <ImpostazioniVerifica compitoId={compitoId} verifica={v} onSalvate={() => void aggiorna()} />
          <section aria-labelledby="misure-titolo" className="space-y-3 rounded-xl border-2 border-brand-magenta bg-card p-4">
            <h2 id="misure-titolo" className="text-sm font-semibold uppercase tracking-wide text-brand-magenta">{t("misure.titolo")}</h2>
            <p className="text-sm text-muted-foreground">{t("misure.descrizione")}</p>
            {erroreMisure && <p role="alert" className="text-sm text-destructive">{t("misure.errore")}</p>}
            {misure.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("misure.nessuno")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {misure.map((m) => (
                  <li key={m.studentId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                    <div className="min-w-0">
                      <p className="font-medium break-words">{m.nome}</p>
                      <p className="text-sm text-muted-foreground">{riassuntoMisure(m.misure, t)}</p>
                      {m.personalizzate && (
                        <span className="rounded bg-brand-magenta-50 px-1.5 py-0.5 text-xs font-medium text-brand-magenta">
                          {t("misure.personalizzate")}
                        </span>
                      )}
                    </div>
                    <MisurePdpDialog
                      studentId={m.studentId}
                      nome={m.nome}
                      iniziali={m.misure}
                      endpoint={`${api}/misure`}
                      etichetta={{ testo: t("misure.modifica"), accessibile: t("misure.modificaDi", { nome: m.nome }) }}
                      onSalvato={() => void ricaricaMisure()}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <MonitoraggioVerifica
          righe={dati.righe}
          oraServer={dati.oraServer}
          trascorsiMs={Math.max(0, adesso - ricevutoAt)}
          occupato={occupato}
          onAzione={esegui}
        />
      )}

      {conRisultati && !sparita && (
        <RisultatiVerifica
          compitoId={compitoId}
          aggiornamento={aggiornamentoRisultati}
          onPubblica={() => esegui({ azione: "pubblica" })}
        />
      )}

      <Dialog open={dialogo !== null} onOpenChange={(aperta) => !aperta && setDialogo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="pr-8">
            <DialogTitle className="text-lg leading-snug">
              {dialogo === "chiudi" ? t("chiudiTitolo") : t("avviaTitolo")}
            </DialogTitle>
            <DialogDescription>
              {dialogo === "chiudi"
                ? dati.conTempoResiduo > 0
                  ? t("chiudiConTempo", { n: dati.conTempoResiduo })
                  : t("chiudiSenzaTempo")
                : t("avviaTesto")}
            </DialogDescription>
          </DialogHeader>
          {dialogo === "chiudi" && <p className="text-sm text-muted-foreground">{t("chiudiTesto")}</p>}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t("annulla")}</DialogClose>
            <Button
              type="button"
              variant={dialogo === "chiudi" ? "destructive" : "default"}
              disabled={occupato}
              onClick={conferma}
            >
              {dialogo === "chiudi" ? t("chiudiConferma") : t("avviaConferma")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Le misure in una riga: «+25% di tempo · meno esercizi · …». */
function riassuntoMisure(
  m: MisurePdpValori,
  t: (chiave: string, valori?: Record<string, string | number>) => string,
): string {
  const parti = [
    m.tempoExtraPct > 0 ? t("misure.tempo", { pct: m.tempoExtraPct }) : null,
    m.menoEsercizi ? t("misure.menoEsercizi") : null,
    m.calcolatrice ? t("misure.calcolatrice") : null,
    m.formulario ? t("misure.formulario") : null,
  ].filter((p): p is string => p !== null);
  return parti.length > 0 ? parti.join(" · ") : t("misure.vuote");
}
