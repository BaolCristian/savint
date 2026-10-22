"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { loadQuestion, type NumbasQuestionJSON, type Question } from "@savint/engine";
import { Printer } from "lucide-react";
import { ContenutoHtml } from "@/components/esercizi/player/contenuto-html";
import { ScopeGrafici } from "@/components/esercizi/player/grafico-funzione";
import { costruisciParte, RispostaAttesa } from "@/components/esercizi/player/risposta-attesa";
import type { PartePubblica } from "@/components/esercizi/player/parti";
import { opzioniMotore } from "@/lib/esercizi/opzioni-motore";
import type { FoglioStampa } from "@/lib/esercizi/stampa";

export interface VerificaStampabileProps {
  titolo: string;
  classe: string;
  esercizi: { titolo: string; content: unknown }[];
  fogli: FoglioStampa[];
  conSoluzioni: boolean;
  locale: "it" | "en";
}

type EsercizioCaricato =
  | { titolo: string; ok: true; domanda: Question; parti: PartePubblica[] }
  | { titolo: string; ok: false };

const LETTERE = "abcdefghijklmnopqrstuvwxyz";
/** Le scelte in maiuscolo, per non confonderle con le lettere delle domande. */
const LETTERE_SCELTE = LETTERE.toUpperCase();
const RIGA = "______________________";

/** Vero se la consegna comincia già con la sua lettera ("a) Quanti euro..."):
 * allora la stampa non ne aggiunge un'altra. */
function haGiaLettera(html: string): boolean {
  return /^\s*[a-z]\)/i.test(html.replace(/<[^>]*>/g, ""));
}

/** Ogni esercizio di un foglio ha il suo seme: lo stesso esercizio in due
 * versioni dà numeri diversi, e lo stesso foglio ristampato dà gli stessi. */
function caricaFoglio(foglio: FoglioStampa, esercizi: VerificaStampabileProps["esercizi"], locale: "it" | "en"): EsercizioCaricato[] {
  return esercizi.map((e, i) => {
    try {
      const domanda = loadQuestion(e.content as NumbasQuestionJSON, { seed: `${foglio.seme}:${i}`, ...opzioniMotore(locale) });
      return { titolo: e.titolo, ok: true, domanda, parti: domanda.parts.map(costruisciParte) };
    } catch {
      return { titolo: e.titolo, ok: false };
    }
  });
}

/** L'ordine in cui lo studente vede le scelte: quello mescolato del motore, come nel player. */
function ordineScelte(parte: PartePubblica): number[] {
  return parte.ordine ?? (parte.scelte ?? []).map((_, i) => i);
}

/** Lo spazio per rispondere, secondo il tipo di domanda. */
function SpazioRisposta({ parte }: { parte: PartePubblica }) {
  const t = useTranslations("esercizi.stampa");
  if (parte.type === "information" || parte.type === "gapfill") return null;
  if (parte.type === "1_n_2" || parte.type === "m_n_2") {
    const casella = parte.type === "1_n_2" ? "○" : "☐";
    return (
      <ul className="mt-2 space-y-1.5">
        {ordineScelte(parte).map((originale, posizione) => (
          <li key={originale} className="flex items-start gap-2">
            <span aria-hidden="true" className="font-mono">{casella}</span>
            <span className="font-medium">{LETTERE_SCELTE[posizione]})</span>
            <ContenutoHtml html={parte.scelte?.[originale] ?? ""} />
          </li>
        ))}
      </ul>
    );
  }
  if (parte.type === "m_n_x") {
    return (
      <table className="mt-2 border-collapse text-sm">
        <thead>
          <tr>
            <th />
            {(parte.colonne ?? []).map((c, i) => (
              <th key={i} className="border px-3 py-1 font-medium"><ContenutoHtml html={c} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(parte.righe ?? []).map((r, i) => (
            <tr key={i}>
              <td className="border px-3 py-1"><ContenutoHtml html={r} /></td>
              {(parte.colonne ?? []).map((_, j) => (
                <td key={j} className="border px-3 py-1 text-center font-mono">☐</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return <p className="mt-3">{t("risposta")} {RIGA}</p>;
}

function Parte({ parte, indice, totale }: { parte: PartePubblica; indice: number; totale: number }) {
  const t = useTranslations("esercizi.stampa");
  const spazi = parte.type === "gapfill" ? (parte.gaps ?? []).map((_, i) => <span key={i}> {RIGA} </span>) : undefined;
  return (
    <li className="break-inside-avoid">
      <div className="flex items-start gap-2">
        {totale > 1 && !haGiaLettera(parte.promptHtml) && <span className="font-semibold">{LETTERE[indice]})</span>}
        <div className="min-w-0 flex-1">
          <ContenutoHtml html={parte.promptHtml} segnaposti={spazi} />
        </div>
        {parte.marks > 0 && <span className="shrink-0 text-xs text-slate-500">{t("punti", { n: parte.marks })}</span>}
      </div>
      <SpazioRisposta parte={parte} />
    </li>
  );
}

function Foglio({ foglio, caricati, props }: { foglio: FoglioStampa; caricati: EsercizioCaricato[]; props: VerificaStampabileProps }) {
  const t = useTranslations("esercizi.stampa");
  return (
    <section className="foglio break-after-page space-y-6 pb-10">
      <header className="space-y-3 border-b-2 border-slate-800 pb-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-bold">{props.titolo}</h2>
          <span className="text-sm font-semibold">
            {foglio.nominativo ? t("classe", { classe: props.classe }) : t("versione", { lettera: foglio.etichetta })}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <span>{t("nome")}: {foglio.nominativo ? <strong>{foglio.etichetta}</strong> : RIGA + RIGA}</span>
          {!foglio.nominativo && <span>{t("classe", { classe: props.classe })}</span>}
          <span>{t("data")}: ____________</span>
        </div>
      </header>

      {caricati.map((e, i) => (
        <article key={i} className="space-y-3">
          <h3 className="font-semibold">{t("esercizio", { n: i + 1, titolo: e.titolo })}</h3>
          {e.ok ? (
            <ScopeGrafici.Provider value={e.domanda.scope}>
              <ContenutoHtml html={e.domanda.statementHtml} />
              <ol className="space-y-4">
                {e.parti.map((p, j) => <Parte key={p.path} parte={p} indice={j} totale={e.parti.length} />)}
              </ol>
            </ScopeGrafici.Provider>
          ) : (
            <p className="text-sm text-red-700">{t("nonStampabile")}</p>
          )}
        </article>
      ))}
    </section>
  );
}

/** La risposta giusta di una parte; per le scelte anche la lettera con cui compare sul foglio. */
function Soluzione({ domanda, parte }: { domanda: Question; parte: PartePubblica }) {
  const parteEngine = domanda.getPart(parte.path);
  if (!parteEngine || parte.type === "information") return null;
  if (parte.type === "1_n_2" || parte.type === "m_n_2") {
    const matrice = parteEngine.correctAnswer();
    const ordine = ordineScelte(parte);
    const giuste = ordine
      .map((originale, posizione) => ({ originale, posizione }))
      .filter(({ originale }) => {
        const riga = Array.isArray(matrice) ? matrice[originale] : undefined;
        return Array.isArray(riga) ? Boolean(riga[0]) : Boolean(riga);
      });
    return (
      <span className="inline-flex flex-wrap gap-x-3">
        {giuste.map(({ originale, posizione }) => (
          <span key={originale} className="inline-flex gap-1">
            <strong>{LETTERE_SCELTE[posizione]})</strong> <ContenutoHtml html={parte.scelte?.[originale] ?? ""} />
          </span>
        ))}
      </span>
    );
  }
  return <RispostaAttesa parteEngine={parteEngine} partePubblica={parte} />;
}

function Soluzioni({ fogli, caricati }: { fogli: FoglioStampa[]; caricati: EsercizioCaricato[][] }) {
  const t = useTranslations("esercizi.stampa");
  return (
    <section className="space-y-8">
      <h2 className="border-b-2 border-slate-800 pb-2 text-xl font-bold">{t("soluzioniTitolo")}</h2>
      {fogli.map((foglio, f) => (
        <div key={foglio.seme} className="break-inside-avoid space-y-3">
          <h3 className="font-semibold">
            {foglio.nominativo ? foglio.etichetta : t("versione", { lettera: foglio.etichetta })}
          </h3>
          <ol className="space-y-3 text-sm">
            {caricati[f].map((e, i) => (
              <li key={i} className="space-y-1">
                <p className="font-medium">{t("esercizio", { n: i + 1, titolo: e.titolo })}</p>
                {e.ok ? (
                  <ScopeGrafici.Provider value={e.domanda.scope}>
                    <ul className="space-y-1 pl-4">
                      {e.parti
                        .filter((p) => p.type !== "information")
                        .map((p, j) => (
                          <li key={p.path} className="flex items-start gap-2">
                            {e.parti.length > 1 && <span className="font-semibold">{LETTERE[j]})</span>}
                            <Soluzione domanda={e.domanda} parte={p} />
                          </li>
                        ))}
                    </ul>
                    {e.domanda.adviceHtml && (
                      <div className="pl-4 text-slate-600">
                        <span className="font-medium">{t("svolgimento")}: </span>
                        <ContenutoHtml html={e.domanda.adviceHtml} />
                      </div>
                    )}
                  </ScopeGrafici.Provider>
                ) : (
                  <p className="pl-4 text-red-700">{t("nonStampabile")}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

export function VerificaStampabile(props: VerificaStampabileProps) {
  const t = useTranslations("esercizi.stampa");
  const caricati = useMemo(
    () => props.fogli.map((f) => caricaFoglio(f, props.esercizi, props.locale)),
    [props.fogli, props.esercizi, props.locale],
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-blue px-4 font-semibold text-white hover:bg-brand-blue/90"
        >
          <Printer aria-hidden="true" className="size-4" />
          {t("stampa")}
        </button>
      </div>
      {props.fogli.map((foglio, i) => (
        <Foglio key={foglio.seme} foglio={foglio} caricati={caricati[i]} props={props} />
      ))}
      {props.conSoluzioni && <Soluzioni fogli={props.fogli} caricati={caricati} />}
    </div>
  );
}
