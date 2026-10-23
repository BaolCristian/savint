"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { QuestionState } from "@savint/engine";
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
import { Input } from "@/components/ui/input";
import { formattaOra, formattaPunti } from "@/components/esercizi/verifica/data-verifica";
import { formattaResiduo } from "@/components/esercizi/verifica/orologio-server";
import { RevisioneEsercizio } from "@/components/esercizi/verifica/revisione-esercizio";
import { withBasePath } from "@/lib/base-path";
// Solo i tipi: risultati-verifica.ts legge il database e non entra nel bundle.
import type { CellaRisultato, RigaRisultato, Risultati } from "@/lib/esercizi/risultati-verifica";

type EventoJson = Omit<RigaRisultato["eventi"][number], "at"> & { at: string };
type RigaJson = Omit<RigaRisultato, "eventi"> & { eventi: EventoJson[] };
/** I risultati come li restituisce `GET .../risultati`: le date in ISO. */
export type RisultatiJson = Omit<Risultati, "righe"> & { righe: RigaJson[] };

type Dettaglio = { seed: string; content: unknown; state: QuestionState | null; punti: number; puntiMax: number; manuale: boolean };
type CellaAperta = { riga: RigaJson; cella: CellaRisultato; numero: number };

const COLORE_STATO: Record<RigaJson["stato"], string> = {
  assente: "text-muted-foreground",
  in_corso: "bg-brand-blue-50 text-brand-blue",
  consegnato: "",
  consegnato_auto: "bg-muted text-foreground",
};

/** Un valore di punti scritto dal docente (con la virgola o il punto), o
 * null se non è un numero da 0 a `massimo` a passi di 0,25. */
function leggiPunti(testo: string, massimo: number): number | null {
  const pulito = testo.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(pulito)) return null;
  const n = Number(pulito);
  if (!(n >= 0 && n <= massimo) || Math.abs(n * 4 - Math.round(n * 4)) > 1e-9) return null;
  return n;
}

/**
 * I risultati di una verifica chiusa o pubblicata, per il docente: la
 * tabella studenti × esercizi (una colonna per posizione, le celle date a
 * mano evidenziate), totale, percentuale e uscite. Un clic su una cella apre
 * la risposta dello studente in sola lettura e il campo dei punti; un clic
 * sulle uscite il loro dettaglio orario. «Pubblica i risultati» (in
 * PUBBLICATA «Pubblica i nuovi», se ci sono prove consegnate dopo) passa dal
 * genitore, che rilegge anche il monitoraggio.
 *
 * Si rilegge al montaggio, quando `aggiornamento` cambia (il monitoraggio è
 * cambiato: un recupero consegnato) e dopo ogni modifica.
 */
export function RisultatiVerifica({ compitoId, aggiornamento, onPubblica }: {
  compitoId: string;
  aggiornamento: string;
  onPubblica: () => Promise<boolean>;
}) {
  const t = useTranslations("esercizi.verifica.risultati.docente");
  const locale = useLocale() === "en" ? "en" : "it";
  const api = `/api/esercizi/verifiche/${compitoId}`;
  const [dati, setDati] = useState<RisultatiJson | null>(null);
  const [errore, setErrore] = useState(false);
  const [pubblicando, setPubblicando] = useState(false);
  const [aperta, setAperta] = useState<CellaAperta | null>(null);
  const [uscite, setUscite] = useState<RigaJson | null>(null);
  // Le risposte arrivano in un ordine qualsiasi: vale solo l'ultima chiesta.
  const ultimaRichiesta = useRef(0);

  const carica = useCallback(async () => {
    const numero = ++ultimaRichiesta.current;
    try {
      const res = await fetch(withBasePath(`${api}/risultati`));
      if (!res.ok) throw new Error(String(res.status));
      const corpo = (await res.json()) as RisultatiJson;
      if (numero !== ultimaRichiesta.current) return;
      setDati(corpo);
      setErrore(false);
    } catch {
      if (numero === ultimaRichiesta.current) setErrore(true);
    }
  }, [api]);

  useEffect(() => {
    void carica();
  }, [carica, aggiornamento]);

  async function pubblica() {
    setPubblicando(true);
    try {
      await onPubblica();
      await carica();
    } catch {
      // L'errore dell'azione lo mostra il genitore; qui basta non restare
      // col pulsante spento.
    } finally {
      setPubblicando(false);
    }
  }

  const f = (n: number) => formattaPunti(n, locale);
  const daPubblicare = dati?.righe.some((r) => (r.stato === "consegnato" || r.stato === "consegnato_auto") && !r.pubblicata) ?? false;

  return (
    <section aria-labelledby="risultati-titolo" className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="risultati-titolo" className="text-lg font-semibold">{t("titolo")}</h2>
        {dati?.stato === "CHIUSA" && (
          <Button type="button" disabled={pubblicando} onClick={() => void pubblica()}>{t("pubblica")}</Button>
        )}
        {dati?.stato === "PUBBLICATA" && daPubblicare && (
          <Button type="button" disabled={pubblicando} onClick={() => void pubblica()}>{t("pubblicaNuovi")}</Button>
        )}
      </div>
      {dati?.stato === "CHIUSA" && <p className="text-sm text-muted-foreground">{t("pubblicaAiuto")}</p>}
      {dati?.stato === "PUBBLICATA" && !daPubblicare && <p className="text-sm text-brand-green">{t("pubblicati")}</p>}
      {errore && <p role="alert" className="text-sm text-destructive">{t("errore")}</p>}
      {!dati && !errore && <p className="text-sm text-muted-foreground">{t("caricamento")}</p>}

      {dati && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="py-2 pr-4 font-medium">{t("studente")}</th>
                {dati.colonne.map((c, i) => (
                  <th key={c.posizione} scope="col" className="px-2 py-2 text-center font-medium">
                    <span className="block">{t("esercizio", { n: i + 1 })}</span>
                    <span className="block text-xs font-normal">{t("puntiColonna", { punti: f(c.punti) })}</span>
                  </th>
                ))}
                <th scope="col" className="px-2 py-2 text-right font-medium">{t("totale")}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{t("percentuale")}</th>
                <th scope="col" className="py-2 pl-2 font-medium">{t("uscite")}</th>
              </tr>
            </thead>
            <tbody>
              {dati.righe.map((r) => {
                const consegnata = r.stato === "consegnato" || r.stato === "consegnato_auto";
                return (
                  <tr key={r.studentId} className="border-b last:border-0 align-top">
                    <th scope="row" className="py-2 pr-4 text-left font-medium">
                      <span className="block break-words">{r.nome}</span>
                      <span className="flex flex-wrap gap-1">
                        {r.stato !== "consegnato" && (
                          <span className={`rounded px-1.5 py-0.5 text-xs font-normal ${COLORE_STATO[r.stato]}`}>{t(r.stato)}</span>
                        )}
                        {dati.stato === "PUBBLICATA" && consegnata && !r.pubblicata && (
                          <span className="rounded bg-brand-orange-50 px-1.5 py-0.5 text-xs font-normal text-brand-orange">{t("nonPubblicato")}</span>
                        )}
                      </span>
                    </th>
                    {r.celle.map((c, i) => (
                      <td key={i} className="px-2 py-2 text-center">
                        {c ? (
                          <button
                            type="button"
                            aria-label={t("cella", { n: i + 1, nome: r.nome, punti: f(c.punti), max: f(c.puntiMax) })}
                            onClick={() => setAperta({ riga: r, cella: c, numero: i + 1 })}
                            className={`inline-flex min-h-9 min-w-12 flex-col items-center justify-center rounded-md px-2 py-1 tabular-nums hover:bg-muted ${
                              c.manuale ? "border-2 border-brand-orange" : "border border-border"
                            }`}
                          >
                            <span>{f(c.punti)}</span>
                            {c.manuale && <span className="text-[10px] leading-none text-brand-orange">{t("modificato")}</span>}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right tabular-nums">
                      <span className="font-semibold">{f(r.finale)}</span>
                      {r.menoEsercizi && consegnata && (
                        <span className="block text-xs text-muted-foreground">
                          {t("menoEsercizi", { ottenuto: f(r.ottenuto), totale: f(r.totaleStudente), pieno: f(dati.totalePieno) })}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{`${f(r.percentuale)}%`}</td>
                    <td className="py-2 pl-2">
                      {r.uscite > 0 ? (
                        <>
                          <button type="button" className="text-brand-blue hover:underline" onClick={() => setUscite(r)}>
                            {t("usciteValore", { n: r.uscite })}
                          </button>
                          <span className="block text-xs text-muted-foreground tabular-nums">
                            {t("fuori", { tempo: formattaResiduo(r.secondiFuori * 1000) })}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">{t("nessunaUscita")}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={aperta !== null} onOpenChange={(si) => !si && setAperta(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {aperta && (
            <PannelloCella
              key={aperta.cella.tentativoId}
              api={api}
              aperta={aperta}
              locale={locale}
              onSalvato={() => {
                setAperta(null);
                void carica();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={uscite !== null} onOpenChange={(si) => !si && setUscite(null)}>
        <DialogContent className="sm:max-w-md">
          {uscite && (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle className="text-lg leading-snug break-words">{t("usciteDi", { nome: uscite.nome })}</DialogTitle>
                <DialogDescription>{t("usciteDescrizione")}</DialogDescription>
              </DialogHeader>
              <ul className="space-y-1 text-sm tabular-nums">
                {uscite.eventi.map((ev, i) => {
                  const ora = formattaOra(new Date(ev.at), locale);
                  return (
                    <li key={i}>
                      {ev.tipo === "USCITA"
                        ? t("uscita", { ora, motivo: t(`motivo.${ev.motivo ?? "altro"}`) })
                        : ev.durataMs !== null
                          ? t("rientro", { ora, durata: formattaResiduo(ev.durataMs) })
                          : t("rientroSenzaDurata", { ora })}
                    </li>
                  );
                })}
              </ul>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>{t("chiudi")}</DialogClose>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Il pannello di una cella: la risposta in sola lettura e i punti. */
function PannelloCella({ api, aperta, locale, onSalvato }: {
  api: string;
  aperta: CellaAperta;
  locale: "it" | "en";
  onSalvato: () => void;
}) {
  const t = useTranslations("esercizi.verifica.risultati.docente");
  const id = useId();
  const { riga, cella, numero } = aperta;
  const [dettaglio, setDettaglio] = useState<Dettaglio | null>(null);
  const [erroreDettaglio, setErroreDettaglio] = useState(false);
  const [valore, setValore] = useState(() => formattaPunti(cella.punti, locale));
  const [errore, setErrore] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let attivo = true;
    fetch(withBasePath(`${api}/risultati?tentativo=${encodeURIComponent(cella.tentativoId)}`))
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const corpo = (await res.json()) as Dettaglio;
        if (attivo) setDettaglio(corpo);
      })
      .catch(() => {
        if (attivo) setErroreDettaglio(true);
      });
    return () => {
      attivo = false;
    };
  }, [api, cella.tentativoId]);

  async function salva(punti: number | null) {
    setSalvando(true);
    setErrore(null);
    try {
      const res = await fetch(withBasePath(`${api}/punti`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tentativoId: cella.tentativoId, punti }),
      });
      if (res.ok) {
        onSalvato();
        return;
      }
      setErrore(res.status === 400 ? t("erroreValore", { max: formattaPunti(cella.puntiMax, locale) }) : t("erroreSalvataggio"));
    } catch {
      setErrore(t("erroreSalvataggio"));
    }
    setSalvando(false);
  }

  function invia(e: React.FormEvent) {
    e.preventDefault();
    const punti = leggiPunti(valore, cella.puntiMax);
    if (punti === null) {
      setErrore(t("erroreValore", { max: formattaPunti(cella.puntiMax, locale) }));
      return;
    }
    void salva(punti);
  }

  const manuale = dettaglio?.manuale ?? cella.manuale;

  return (
    <>
      <DialogHeader className="pr-8">
        <DialogTitle className="text-lg leading-snug break-words">{t("pannelloTitolo", { nome: riga.nome, n: numero })}</DialogTitle>
        <DialogDescription>{t("pannelloDescrizione")}</DialogDescription>
      </DialogHeader>
      {erroreDettaglio && <p role="alert" className="text-sm text-destructive">{t("erroreDettaglio")}</p>}
      {dettaglio && <RevisioneEsercizio seed={dettaglio.seed} content={dettaglio.content} state={dettaglio.state} locale={locale} />}
      <form onSubmit={invia} noValidate className="flex flex-wrap items-end gap-2 border-t pt-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-punti`} className="text-sm">{t("punti", { max: formattaPunti(cella.puntiMax, locale) })}</label>
          <Input
            id={`${id}-punti`}
            inputMode="decimal"
            value={valore}
            onChange={(e) => {
              setValore(e.target.value);
              setErrore(null);
            }}
            aria-invalid={errore ? true : undefined}
            className="w-28"
          />
        </div>
        <Button type="submit" disabled={salvando}>{t("salva")}</Button>
        {manuale && (
          <Button type="button" variant="outline" disabled={salvando} onClick={() => void salva(null)}>
            {t("automatico")}
          </Button>
        )}
      </form>
      {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
    </>
  );
}
