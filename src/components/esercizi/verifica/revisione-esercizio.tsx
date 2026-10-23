"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  loadQuestion,
  restoreQuestion,
  type Answer,
  type FeedbackItem,
  type NumbasQuestionJSON,
  type QuestionState,
  type jme,
  type parts,
} from "@savint/engine";
import { opzioniMotore } from "@/lib/esercizi/opzioni-motore";
import { ContenutoHtml } from "../player/contenuto-html";
import { ScopeGrafici } from "../player/grafico-funzione";
import { InputParte, type PartePubblica } from "../player/parti";
import { VoceFeedback } from "../player/player-esercizio";
import { costruisciParte, RispostaAttesa } from "../player/risposta-attesa";
import { rispostaDaStato } from "../player/risposte";

type PartBase = InstanceType<typeof parts.PartBase>;

type Parte = {
  pubblica: PartePubblica;
  engine: PartBase;
  risposta: Answer;
  feedback: FeedbackItem[];
};

type Revisione = {
  statementHtml: string;
  adviceHtml: string;
  scope: jme.Scope;
  parti: Parte[];
};

export interface RevisioneEsercizioProps {
  seed: string;
  /** Il contenuto ORIGINALE, con lo svolgimento. */
  content: unknown;
  state: QuestionState | null;
  locale: "it" | "en";
}

const nessunCambio = () => {};

/**
 * Un esercizio della verifica rivisto dopo la consegna, in sola lettura: la
 * domanda ricostruita dallo stato salvato, le risposte dello studente nei
 * campi disabilitati, sotto ogni parte la correzione del motore e la
 * risposta attesa, in fondo lo svolgimento. Tutto visibile senza clic: è la
 * pagina dei risultati (del docente, o dello studente dopo la
 * pubblicazione), non un ripasso guidato.
 */
export function RevisioneEsercizio({ seed, content, state, locale }: RevisioneEsercizioProps) {
  const t = useTranslations("esercizi.verifica.risultati.revisione");
  const [revisione, setRevisione] = useState<Revisione | null>(null);
  const [errore, setErrore] = useState(false);

  useEffect(() => {
    try {
      const json = content as NumbasQuestionJSON;
      // `restoreQuestion` rinvia da sé le parti risposte: ognuna ha già il
      // suo `result`, con lo stesso feedback del momento della risposta.
      const q = state
        ? restoreQuestion(json, { ...state, seed }, opzioniMotore(locale))
        : loadQuestion(json, { seed, ...opzioniMotore(locale) });
      const parti = q.parts.map((engine): Parte => {
        const pubblica = costruisciParte(engine);
        return {
          pubblica,
          engine,
          risposta: rispostaDaStato(pubblica, state?.parts),
          feedback: engine.result?.feedback ?? [],
        };
      });
      setRevisione({ statementHtml: q.statementHtml, adviceHtml: q.adviceHtml, scope: q.scope, parti });
    } catch (e) {
      console.error("[esercizi/verifica] impossibile ricostruire l'esercizio", e);
      setErrore(true);
    }
    // Come nella prova: contenuto, seme e stato sono fissi per la vita del
    // componente (chi lo monta cambia `key` per un altro tentativo), la
    // domanda si ricostruisce una volta sola al montaggio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (errore) return <p role="alert">{t("errore")}</p>;
  if (!revisione) return null;

  return (
    <ScopeGrafici.Provider value={revisione.scope}>
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 leading-relaxed text-slate-800 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden">
          <ContenutoHtml html={revisione.statementHtml} />
        </div>
        {revisione.parti.map(({ pubblica, engine, risposta, feedback }) => (
          <div key={pubblica.path} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
            <InputParte parte={pubblica} valore={risposta} onChange={nessunCambio} disabilitato />
            {feedback.map((voce, i) => (
              <VoceFeedback key={i} voce={voce} />
            ))}
            {pubblica.type !== "information" && (
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <strong>{t("rispostaAttesa")}: </strong>
                <RispostaAttesa parteEngine={engine} partePubblica={pubblica} />
              </div>
            )}
          </div>
        ))}
        {revisione.adviceHtml.trim().length > 0 && (
          <section className="space-y-2 rounded-2xl border border-brand-blue/20 bg-brand-blue/5 p-5 text-sm">
            <h4 className="font-semibold text-slate-900">{t("svolgimento")}</h4>
            <ContenutoHtml html={revisione.adviceHtml} />
          </section>
        )}
      </div>
    </ScopeGrafici.Provider>
  );
}
