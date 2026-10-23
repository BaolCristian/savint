"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  loadQuestion,
  restoreQuestion,
  type Answer,
  type NumbasQuestionJSON,
  type QuestionState,
  type jme,
  Question,
} from "@savint/engine";
// Solo il tipo: prova-verifica.ts legge il database e non entra nel bundle.
import type { EsercizioProva } from "@/lib/esercizi/prova-verifica";
import { haRisposta } from "@/lib/esercizi/verifica-regole";
import { opzioniMotore } from "@/lib/esercizi/opzioni-motore";
import { ContenutoHtml } from "../player/contenuto-html";
import { ScopeGrafici } from "../player/grafico-funzione";
import { InputParte, type PartePubblica } from "../player/parti";
import { costruisciParte } from "../player/risposta-attesa";
import { preparaRispostaPerMotore, rispostaDaStato } from "../player/risposte";

/** Il tempo di quiete dopo l'ultima battuta prima di passare lo stato. */
const ATTESA_MS = 700;

export interface EsercizioVerificaProps {
  esercizio: EsercizioProva;
  locale: "it" | "en";
  disabilitato: boolean;
  /** Lo stato del motore dopo un cambio di risposta, con `risposto` vero se
   * almeno un campo ha una risposta valida. Chi lo riceve lo mette nella
   * coda dei salvataggi: questo componente non parla mai con il server. */
  onStato: (tentativoId: string, state: QuestionState, risposto: boolean) => void;
  /** Lo studente è uscito da un campo: il momento buono per salvare subito. */
  onUscitaCampo: () => void;
}

/** Un esercizio della prova di verifica. Lo stesso caricamento del player
 * della pratica (motore, parti, campi), senza nulla che dica allo studente
 * se ha fatto bene: niente «Invia», niente feedback, niente soluzione,
 * niente punteggio. La risposta di ogni campo entra nello stato del motore
 * con `submit` — il risultato si scarta — perché è quello stato che il
 * server salva e poi corregge. */
export function EsercizioVerifica({ esercizio, locale, disabilitato, onStato, onUscitaCampo }: EsercizioVerificaProps) {
  const t = useTranslations("esercizi");
  const { tentativoId } = esercizio;
  const domandaRef = useRef<Question | null>(null);
  const [errore, setErrore] = useState(false);
  const [statementHtml, setStatementHtml] = useState("");
  const [scopeDomanda, setScopeDomanda] = useState<jme.Scope | null>(null);
  const [parti, setParti] = useState<PartePubblica[]>([]);
  const [risposte, setRisposte] = useState<Record<string, Answer>>({});
  // Le risposte ancora da passare al motore, per parte, e i loro timer.
  const inSospesoRef = useRef(new Map<string, Answer>());
  const timerRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Le parti la cui ultima risposta il motore non ha saputo interpretare:
  // contano come non risposte finché non tornano valide.
  const nonValideRef = useRef(new Set<string>());
  const partiRef = useRef<PartePubblica[]>([]);
  const onStatoRef = useRef(onStato);
  onStatoRef.current = onStato;

  useEffect(() => {
    try {
      const json = esercizio.content as NumbasQuestionJSON;
      const q = esercizio.state
        ? restoreQuestion(json, { ...esercizio.state, seed: esercizio.seed }, opzioniMotore(locale))
        : loadQuestion(json, { seed: esercizio.seed, ...opzioniMotore(locale) });
      domandaRef.current = q;
      const costruite = q.parts.map(costruisciParte);
      const iniziali: Record<string, Answer> = {};
      for (const parte of costruite) iniziali[parte.path] = rispostaDaStato(parte, esercizio.state?.parts);
      partiRef.current = costruite;
      setParti(costruite);
      setRisposte(iniziali);
      setStatementHtml(q.statementHtml);
      setScopeDomanda(q.scope);
    } catch (e) {
      console.error("[esercizi/verifica] impossibile caricare la domanda", e);
      setErrore(true);
    }
    // Contenuto, seme e stato iniziale sono fissi per la vita del
    // componente: la domanda si carica una volta sola al montaggio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smontando (cambio di esercizio) le risposte in sospeso non si perdono.
  useEffect(() => {
    const timer = timerRef.current;
    return () => {
      for (const id of timer.values()) clearTimeout(id);
      timer.clear();
      passaAlMotore();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Passa al motore le risposte in sospeso (tutte, o solo quella di una
   * parte) e lo stato risultante a `onStato`. */
  function passaAlMotore(soloPath?: string) {
    const q = domandaRef.current;
    if (!q) return;
    const daPassare = soloPath ? [soloPath] : [...inSospesoRef.current.keys()];
    let cambiato = false;
    for (const path of daPassare) {
      if (!inSospesoRef.current.has(path)) continue;
      const valore = inSospesoRef.current.get(path) ?? null;
      inSospesoRef.current.delete(path);
      const timer = timerRef.current.get(path);
      if (timer) clearTimeout(timer);
      timerRef.current.delete(path);
      const parte = partiRef.current.find((p) => p.path === path);
      const parteEngine = q.getPart(path);
      if (!parte || !parteEngine) continue;
      const prima = q.toState();
      try {
        parteEngine.submit(preparaRispostaPerMotore(parte, valore));
        nonValideRef.current.delete(path);
      } catch (e) {
        // Risposta che il motore non sa leggere: la parte torna allo stato
        // di prima e il campo conta come non risposto.
        console.warn("[esercizi/verifica] risposta non interpretabile", e);
        nonValideRef.current.add(path);
        ripristina(q, prima);
      }
      cambiato = true;
    }
    if (!cambiato) return;
    const state = domandaRef.current!.toState();
    const valide = { ...state, parts: state.parts.filter((p) => !nonValideRef.current.has(p.path)) };
    onStatoRef.current(tentativoId, state, haRisposta(valide));
  }

  /** Dopo un `submit` fallito a metà la domanda si ricostruisce dall'ultimo
   * stato buono: è l'unico modo per essere certi che la parte non resti con
   * una risposta registrata solo in parte. */
  function ripristina(q: Question, stato: QuestionState) {
    try {
      domandaRef.current = restoreQuestion(
        esercizio.content as NumbasQuestionJSON,
        { ...stato, seed: esercizio.seed },
        opzioniMotore(locale),
      );
    } catch {
      domandaRef.current = q;
    }
  }

  function cambiaRisposta(path: string, valore: Answer) {
    if (disabilitato) return;
    setRisposte((r) => ({ ...r, [path]: valore }));
    inSospesoRef.current.set(path, valore);
    const vecchio = timerRef.current.get(path);
    if (vecchio) clearTimeout(vecchio);
    timerRef.current.set(path, setTimeout(() => passaAlMotore(path), ATTESA_MS));
  }

  function esciDalCampo(path: string) {
    passaAlMotore(path);
    onUscitaCampo();
  }

  if (errore) return <p role="alert">{t("erroreCaricamento")}</p>;

  // Il testo si legge ma non si copia (né menu contestuale): niente
  // domande incollate altrove. I campi di risposta restano liberi.
  const bloccaCopia = (e: React.SyntheticEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest("input, textarea")) return;
    e.preventDefault();
  };

  return (
    <ScopeGrafici.Provider value={scopeDomanda}>
      <div className="space-y-6">
        <div
          onCopy={bloccaCopia}
          onCut={bloccaCopia}
          onContextMenu={bloccaCopia}
          className="select-none rounded-2xl border border-slate-200 bg-white px-5 py-6 text-base leading-relaxed text-slate-800 sm:px-7 sm:py-8 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden"
        >
          <ContenutoHtml html={statementHtml} />
        </div>
        {parti.map((parte) => (
          <div
            key={parte.path}
            onCopy={bloccaCopia}
            onCut={bloccaCopia}
            onContextMenu={bloccaCopia}
            onBlur={() => esciDalCampo(parte.path)}
            className="select-none space-y-4 rounded-2xl border border-slate-200 bg-white p-5 focus-within:border-brand-blue/40 sm:p-7 [&_input]:min-h-11 [&_input]:select-text [&_textarea]:min-h-24 [&_textarea]:select-text"
          >
            <InputParte
              parte={parte}
              valore={risposte[parte.path] ?? null}
              onChange={(v) => cambiaRisposta(parte.path, v)}
              disabilitato={disabilitato}
            />
          </div>
        ))}
      </div>
    </ScopeGrafici.Provider>
  );
}
