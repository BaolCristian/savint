"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import {
  loadQuestion,
  restoreQuestion,
  variables,
  parts,
  type Answer,
  type FeedbackItem,
  type NumbasQuestionJSON,
  type PartState,
  type QuestionState,
  Question,
} from "@savint/engine";
import { Button, buttonVariants } from "@/components/ui/button";
import { withBasePath } from "@/lib/base-path";
import { ContenutoHtml } from "./contenuto-html";
import { InputParte, type PartePubblica } from "./parti";
import { abbandonaTentativo, completaTentativo, inviaRisposta } from "./usa-tentativo";

type Fase = "caricamento" | "esercizio" | "riepilogo" | "errore";
type PartBase = InstanceType<typeof parts.PartBase>;
type Punteggio = { score: number; maxScore: number };

export interface PlayerEsercizioProps {
  tentativoId: string;
  /** L'esercizio a cui appartiene il tentativo: serve al riepilogo per
   * offrire un nuovo tentativo senza far indovinare l'indirizzo. */
  esercizioId: string;
  seed: string;
  content: unknown;
  statoIniziale: QuestionState | null;
  /** Quando il tentativo è stato toccato l'ultima volta (`Tentativo.lastActivityAt`):
   * serve solo al banner di ripresa, per dire QUANDO risale il lavoro che si
   * sta riprendendo, non se riprenderlo — quella decisione la prende
   * `statoGiaRisposto` da `statoIniziale`, mai da questa data. */
  lastActivityAt: Date;
  /** Vero quando lo studente aveva chiesto l'esercizio come parte di un
   * compito (link `?compitoId=...`) ma quella richiesta è stata respinta
   * (dominio: `richiestaCompitoRifiutata`, tentativo.ts) — questo tentativo
   * è aperto come pratica libera, non come consegna di un'assegnazione.
   * Opzionale: assente (o `false`) per un esercizio aperto dal link libero,
   * dove non c'è mai stata nessuna richiesta da respingere e quindi niente
   * da segnalare (Secondo giro, item 2). */
  richiestaCompitoRifiutata?: boolean;
  locale: "it" | "en";
}

/** Un tentativo conta come "ripreso" solo se lo stato salvato contiene
 * ALMENO una parte già risposta (`answered: true`), mai perché esiste
 * semplicemente una riga in database. Il difetto riportato dal committente:
 * uno studente vedeva due campi già compilati e un punteggio di 0/2 PRIMA di
 * aver toccato nulla, senza che nulla in pagina dicesse che si trattava di
 * un tentativo in corso da prima — un ripristino silenzioso, indistinguibile
 * da un bug. Un tentativo appena creato ha comunque una riga (`avviaORiprendi`
 * la crea al primo accesso) ma nessuna parte risposta: mostrare il banner
 * anche lì trasformerebbe un esercizio mai iniziato in un falso allarme. */
function statoGiaRisposto(stato: QuestionState | null): boolean {
  return (stato?.parts ?? []).some((p) => p.answered);
}

/** Costruisce la forma pubblica di una parte per il player (Task 7:
 * `PartePubblica`). Il motore sostituisce già da sé `p.promptHtml` (e quello
 * dei gap): `Question`'s constructor chiama `substitutePartPrompts` su ogni
 * parte al caricamento, quindi la `sostituisci(p.promptHtml)` qui sotto è
 * ridondante — innocua, ma non è lei a salvare la situazione. Il varco che il
 * motore lascia davvero aperto è nelle IMPOSTAZIONI di tipo (`p.settings`),
 * mai toccate da quel passaggio: le scelte di `1_n_2`/`m_n_2` e le righe/
 * colonne di una griglia `m_n_x` (`choices` sono le righe, `answers` le
 * colonne — vedi il commento di `InputGriglia`) arrivano qui ancora col
 * markup autorale (`\var{r1}`). È per questi tre campi che la sostituzione
 * qui sotto è necessaria: senza, tre degli otto esercizi mostrerebbero allo
 * studente markup grezzo nelle scelte o nella griglia. */
function costruisciParte(p: PartBase): PartePubblica {
  const scope = p.getScope();
  const sostituisci = (html: string) => variables.substituteHtml(html, scope);
  const impostazioni = p.settings as Record<string, unknown>;

  const parte: PartePubblica = {
    path: p.path,
    type: p.type,
    promptHtml: sostituisci(p.promptHtml),
    marks: p.marks,
  };

  if (p.type === "1_n_2" || p.type === "m_n_2") {
    parte.scelte = ((impostazioni.choices as string[] | undefined) ?? []).map(sostituisci);
  } else if (p.type === "m_n_x") {
    parte.righe = ((impostazioni.choices as string[] | undefined) ?? []).map(sostituisci);
    parte.colonne = ((impostazioni.answers as string[] | undefined) ?? []).map(sostituisci);
  } else if (p.type === "gapfill") {
    parte.gaps = p.gaps.map(costruisciParte);
  }

  return parte;
}

function trovaStato(path: string, stati: PartState[] | undefined): PartState | undefined {
  return stati?.find((s) => s.path === path);
}

/** La risposta da cui ripartire per una parte, ricostruita dallo stato
 * salvato. Per un `gapfill` lo stato tiene le risposte sui gap, mai sulla
 * parte madre (Task 8 dell'engine, `state.ts`): si ricompone l'array
 * ricorsivamente dagli stati dei gap. Un gap senza risposta nello stato
 * diventa `null` — il contratto di `InputGapfill` per "mai risposto", non
 * ancora la risposta che va al motore (vedi `preparaRispostaPerMotore`). */
function rispostaDaStato(parte: PartePubblica, stati: PartState[] | undefined): Answer {
  const stato = trovaStato(parte.path, stati);
  if (parte.type === "gapfill") {
    return (parte.gaps ?? []).map((gap) => rispostaDaStato(gap, stato?.gaps));
  }
  return (stato?.answer ?? null) as Answer;
}

/** Segnalazione del coordinatore: un gap mai toccato viaggia come `null`
 * nell'array della risposta di un `gapfill` — l'unica scelta type-legale
 * per `InputGapfill`, dato che `Answer` non ammette `undefined`. Ma
 * `GapFillPart#storeAnswer` (engine, `gapfill-part.ts`) inoltra ogni voce
 * dell'array al gap corrispondente INVARIATA: solo `undefined` significa
 * davvero "nessuna risposta"; `null` diventa una risposta letterale. Per un
 * gap di testo/numero il risultato è solo un'altra risposta sbagliata
 * (innocuo ma comunque falso: quel gap non è stato risposto). Per un gap a
 * scelta multipla (`1_n_2`/`m_n_2`/`m_n_x`) è peggio: la sua
 * `setStudentAnswer` chiama `.map()` sulla risposta, e un `null` la fa
 * incappare in un `TypeError` che risale fino a rompere l'invio
 * dell'INTERA parte gapfill (verificato al banco). Un gap davvero mai
 * risposto deve quindi arrivare al motore — e finire nello stato che si
 * manda al server — come OMESSO, non come `null`: la conversione va fatta
 * qui, al confine con `parts.PartBase#submit`, prima che l'array lasci il
 * player. */
function preparaRispostaPerMotore(parte: PartePubblica, valore: Answer): Answer {
  if (parte.type !== "gapfill" || !Array.isArray(valore)) return valore;
  const senzaNull = valore.map((v) => (v === null ? undefined : v));
  return senzaNull as unknown as Answer;
}

/** Una voce di feedback del motore.
 *
 * Il messaggio NON è testo semplice: una quindicina di voci di
 * `packages/engine/src/i18n/it.ts` portano marcatori (`<strong>{name}</strong>`
 * per l'intestazione di uno spazio di un gapfill, `<code>`, `<span
 * class="monospace">`), e resi come testo lo studente leggeva davvero
 * "<strong>Spazio 0</strong>". `dangerouslySetInnerHTML` non è la via
 * d'uscita: alcune di queste voci contengono anche formule, e il markup
 * arriva comunque da contenuti autorali. Si passa da `ContenutoHtml`, che ha
 * già l'allowlist dei tag e la divisione delle formule.
 *
 * Corretto e sbagliato avevano lo stesso identico aspetto — stesso colore,
 * nessuna icona — e l'unica distinzione era un `aria-label` su un `<p>`, un
 * elemento a cui l'ARIA vieta un nome accessibile: le tecnologie assistive lo
 * ignoravano, quindi la distinzione non esisteva né per gli occhi né per lo
 * screen reader. Qui il colore e l'icona la danno a vista, e un testo
 * `sr-only` — un nome vero, non un attributo su un elemento che non lo
 * ammette — la dà a chi ascolta. */
function VoceFeedback({ voce }: { voce: FeedbackItem }) {
  const t = useTranslations("esercizi");
  const corretta = voce.type === "correct";
  const sbagliata = voce.type === "incorrect";

  const stile = corretta
    ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
    : sbagliata
      ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100"
      : "border-transparent text-muted-foreground";

  return (
    <div className={`flex items-start gap-2 rounded-md border px-2 py-1 text-sm ${stile}`}>
      {corretta && <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
      {sbagliata && <XCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />}
      <div className="min-w-0">
        {(corretta || sbagliata) && (
          <span className="sr-only">{corretta ? t("rispostaCorretta") : t("rispostaSbagliata")}: </span>
        )}
        <span>
          <ContenutoHtml html={voce.message} />
        </span>
      </div>
    </div>
  );
}

/** Gli indici (0-based) delle celle vere in una colonna di matrice booleana,
 * `matrice[i][0]`: la forma che `correctAnswer()` restituisce SEMPRE per
 * `1_n_2` e `m_n_2` (`MultipleResponsePart#getCorrectAnswer`, `maxMatrix`
 * dopo il "flip" — una colonna sola, una riga per scelta), mai un indice
 * nudo. Per `1_n_2` un solo indice è vero; per `m_n_2` possono esserlo più
 * d'uno. */
function indiciSceltaCorretta(matrice: unknown): number[] {
  if (!Array.isArray(matrice)) return [];
  const indici: number[] = [];
  matrice.forEach((riga, i) => {
    const valore = Array.isArray(riga) ? riga[0] : riga;
    if (valore) indici.push(i);
  });
  return indici;
}

/** Le coppie riga→colonna vere di una griglia `m_n_x`: `correctAnswer()`
 * restituisce la matrice indicizzata `[colonna][riga]` (la stessa
 * convenzione di `ticks`, vedi il commento di `InputGriglia`), quindi va
 * letta `matrice[colonna][riga]`, mai `matrice[riga][colonna]`. */
function coppieCorretteGriglia(
  matrice: unknown,
  numRighe: number,
  numColonne: number,
): Array<{ riga: number; colonna: number }> {
  if (!Array.isArray(matrice)) return [];
  const coppie: Array<{ riga: number; colonna: number }> = [];
  for (let riga = 0; riga < numRighe; riga++) {
    for (let colonna = 0; colonna < numColonne; colonna++) {
      if ((matrice[colonna] as boolean[] | undefined)?.[riga]) {
        coppie.push({ riga, colonna });
        break;
      }
    }
  }
  return coppie;
}

/** La risposta attesa di UNA parte semplice (mai un `gapfill`, che si
 * scompone gap per gap in `RispostaAttesa` sotto), letta da
 * `PartBase#correctAnswer()` e mai dal meccanismo di rivelazione del motore
 * (`getAdvice`/`revealAnswer`, vietati: mutano lo stato e rischiano di
 * perdere le risposte alla riserializzazione — vedi il dispaccio).
 *
 * La forma dipende dal tipo (part-base.ts, gapfill-part.ts,
 * multiple-response-part.ts): una stringa già pronta per `numberentry`,
 * `jme` e `patternmatch`; sempre una matrice booleana per le scelte
 * (`1_n_2`, `m_n_2`, `m_n_x`) — mostrarla così com'è sarebbe peggio che non
 * mostrare niente, quindi qui si traduce nella scelta o nelle coppie che
 * rappresenta. */
function RispostaAttesaValore({
  parteEngine,
  partePubblica,
}: {
  parteEngine: PartBase;
  partePubblica: PartePubblica;
}) {
  const risposta = parteEngine.correctAnswer();

  if (partePubblica.type === "1_n_2" || partePubblica.type === "m_n_2") {
    const scelte = partePubblica.scelte ?? [];
    const indici = indiciSceltaCorretta(risposta);
    if (indici.length === 0) return null;
    return (
      <ul className="list-disc space-y-1 pl-5">
        {indici.map((i) => (
          <li key={i}>
            <ContenutoHtml html={scelte[i] ?? ""} />
          </li>
        ))}
      </ul>
    );
  }

  if (partePubblica.type === "m_n_x") {
    const righe = partePubblica.righe ?? [];
    const colonne = partePubblica.colonne ?? [];
    const coppie = coppieCorretteGriglia(risposta, righe.length, colonne.length);
    return (
      <ul className="list-disc space-y-1 pl-5">
        {coppie.map(({ riga, colonna }) => (
          <li key={riga}>
            <ContenutoHtml html={righe[riga] ?? ""} /> → <ContenutoHtml html={colonne[colonna] ?? ""} />
          </li>
        ))}
      </ul>
    );
  }

  // numberentry, jme, patternmatch: `correctAnswer()` è già una stringa
  // pronta per lo studente (part-base.ts, ciascuna col proprio
  // `getCorrectAnswer`).
  return <ContenutoHtml html={risposta === null || risposta === undefined ? "" : String(risposta)} />;
}

/** La risposta attesa di una parte, gap per gap quando è un `gapfill`: la
 * risposta attesa appartiene alla PARTE (a differenza della soluzione
 * svolta, che appartiene alla domanda, vedi `SpiegazioneParte`), e per un
 * gapfill quella parte è ciascuno spazio — non l'array che
 * `GapFillPart#correctAnswer()` restituirebbe per l'intero gapfill. Ogni
 * spazio è etichettato col nome che il motore gli assegna già
 * (`PartBase#name`, "Spazio 0", "Spazio 1", …), lo stesso che compare nel
 * feedback del motore: nessuna nuova chiave i18n per numerarli. */
function RispostaAttesa({ parteEngine, partePubblica }: { parteEngine: PartBase; partePubblica: PartePubblica }) {
  if (partePubblica.type === "gapfill") {
    const gaps = partePubblica.gaps ?? [];
    return (
      <ul className="space-y-1">
        {gaps.map((gapPubblico, i) => {
          const gapEngine = parteEngine.gaps[i];
          if (!gapEngine) return null;
          return (
            <li key={gapPubblico.path}>
              <strong>{gapEngine.name}</strong>: <RispostaAttesaValore parteEngine={gapEngine} partePubblica={gapPubblico} />
            </li>
          );
        })}
      </ul>
    );
  }
  return <RispostaAttesaValore parteEngine={parteEngine} partePubblica={partePubblica} />;
}

/** Il ripasso dopo un errore: due passi, mai simultanei.
 *
 * Primo passo — un bottone "Come si risolve" rivela `Question#adviceHtml`,
 * la soluzione svolta con il seme dello studente già sostituito. La
 * soluzione appartiene alla DOMANDA, non alla parte (`soluzioneRivelata` è
 * un solo flag per l'intero esercizio, passato dal chiamante): su un
 * gapfill con più spazi sbagliati va mostrata una volta sola, non una volta
 * per spazio — altrimenti si legge lo stesso paragrafo due volte (vedi
 * 03-sistemi-lineari). Quando `adviceHtml` è vuoto (08-terminologia-funzioni,
 * l'unico degli otto esercizi senza una soluzione scritta) questo primo
 * passo si salta del tutto: si passa dritti al secondo.
 *
 * Secondo passo — un bottone rivela la risposta attesa DI QUESTA parte
 * (`rispostaRivelata`, per parte: ognuna la propria).
 *
 * Il contenuto rivelato è in un `role="status"` (live region "polite",
 * annunciata da sé): comparire in silenzio, senza che chi usa uno screen
 * reader se ne accorga, sarebbe come non comparire affatto. */
function SpiegazioneParte({
  parte,
  parteEngine,
  adviceHtml,
  soluzioneRivelata,
  onRivelaSoluzione,
  rispostaRivelata,
  onRivelaRisposta,
}: {
  parte: PartePubblica;
  parteEngine: PartBase;
  adviceHtml: string;
  soluzioneRivelata: boolean;
  onRivelaSoluzione: () => void;
  rispostaRivelata: boolean;
  onRivelaRisposta: () => void;
}) {
  const t = useTranslations("esercizi");
  const haSoluzione = adviceHtml.trim().length > 0;
  const prontoPerRisposta = !haSoluzione || soluzioneRivelata;

  return (
    <div className="space-y-2 border-t pt-2">
      {haSoluzione && !soluzioneRivelata && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          aria-expanded={false}
          onClick={onRivelaSoluzione}
        >
          {t("comeSiRisolve")}
        </Button>
      )}
      {haSoluzione && soluzioneRivelata && (
        <div role="status" aria-label={t("mostraSoluzione")} className="rounded-md bg-muted/50 p-3 text-sm">
          <ContenutoHtml html={adviceHtml} />
        </div>
      )}
      {prontoPerRisposta && !rispostaRivelata && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          aria-expanded={false}
          onClick={onRivelaRisposta}
        >
          {t("mostraRispostaAttesa")}
        </Button>
      )}
      {prontoPerRisposta && rispostaRivelata && (
        <div role="status" aria-label={t("rispostaAttesa")} className="rounded-md bg-muted/50 p-3 text-sm">
          <strong>{t("rispostaAttesa")}: </strong>
          <RispostaAttesa parteEngine={parteEngine} partePubblica={parte} />
        </div>
      )}
    </div>
  );
}

export function PlayerEsercizio({
  tentativoId, esercizioId, seed, content, statoIniziale, lastActivityAt, richiestaCompitoRifiutata, locale,
}: PlayerEsercizioProps) {
  const t = useTranslations("esercizi");
  const router = useRouter();
  // Lo stato del motore è un oggetto vivo (chiama `submit`, tiene punteggio e
  // storico): un `useRef`, non uno stato React, perché mutarlo non deve
  // ridisegnare da solo il componente.
  const domandaRef = useRef<Question | null>(null);

  // Il banner di ripresa: visibile fin dal PRIMO render se lo stato arrivato
  // da `page.tsx` porta già almeno una risposta (mai da un effetto — a quel
  // punto lo studente avrebbe già visto un istante di schermo muto). Non un
  // toast che sparisce da solo: resta finché lo studente non interagisce
  // davvero con l'esercizio (la prima `cambiaRisposta`, sotto), perché può
  // aver aperto la pagina ed essersi allontanato prima di leggerlo.
  const [bannerRipresaVisibile, setBannerRipresaVisibile] = useState(() => statoGiaRisposto(statoIniziale));
  const quandoRipreso = useMemo(
    () => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "it-IT", {
      dateStyle: "medium", timeStyle: "short",
    }).format(lastActivityAt),
    [lastActivityAt, locale],
  );

  const [fase, setFase] = useState<Fase>("caricamento");
  const [statementHtml, setStatementHtml] = useState("");
  const [adviceHtml, setAdviceHtml] = useState("");
  const [parti, setParti] = useState<PartePubblica[]>([]);
  const [risposte, setRisposte] = useState<Record<string, Answer>>({});
  const [feedbackPerParte, setFeedbackPerParte] = useState<Record<string, FeedbackItem[]>>({});
  const [erroriRete, setErroriRete] = useState<Record<string, boolean>>({});
  const [inviando, setInviando] = useState<Record<string, boolean>>({});
  const [rispostoConSuccesso, setRispostoConSuccesso] = useState<Record<string, boolean>>({});
  const [punteggio, setPunteggio] = useState<Punteggio | null>(null);
  const [completando, setCompletando] = useState(false);
  const [erroreCompletamento, setErroreCompletamento] = useState(false);
  // Il ripasso dopo un errore (`SpiegazioneParte`): `soluzioneRivelata` è UN
  // solo flag per l'intera domanda (la soluzione svolta appartiene alla
  // domanda, non alla parte), `rispostaRivelataPerParte` uno per parte (la
  // risposta attesa appartiene alla parte). Nessuno dei due viaggia verso il
  // server: è pratica libera, senza tentativi limitati né classifica, e
  // nessuno deve sapere se lo studente ha guardato (vedi il dispaccio).
  const [soluzioneRivelata, setSoluzioneRivelata] = useState(false);
  const [rispostaRivelataPerParte, setRispostaRivelataPerParte] = useState<Record<string, boolean>>({});
  // "Ricomincia": deliberatamente a due passi, mai un solo bottone accanto a
  // "Invia" — `dialogoRicominciaAperto` apre solo la richiesta di conferma,
  // `abbandonaTentativo` (che distrugge le risposte date finora) parte solo
  // da `confermaRicomincio`, mai dal bottone che apre la conferma.
  const [dialogoRicominciaAperto, setDialogoRicominciaAperto] = useState(false);
  const [ricominciando, setRicominciando] = useState(false);
  const [erroreRicomincio, setErroreRicomincio] = useState(false);

  useEffect(() => {
    try {
      const json = content as NumbasQuestionJSON;
      const q = statoIniziale
        ? restoreQuestion(json, { ...statoIniziale, seed }, { locale })
        : loadQuestion(json, { seed, locale });
      domandaRef.current = q;

      const partiCostruite = q.parts.map(costruisciParte);
      const risposteIniziali: Record<string, Answer> = {};
      const rispostoIniziale: Record<string, boolean> = {};
      const feedbackIniziale: Record<string, FeedbackItem[]> = {};
      for (const parte of partiCostruite) {
        risposteIniziali[parte.path] = rispostaDaStato(parte, statoIniziale?.parts);
        if (trovaStato(parte.path, statoIniziale?.parts)?.answered) {
          rispostoIniziale[parte.path] = true;
        }
        // `restoreQuestion` rinvia da sé le parti già risposte
        // (`applyQuestionState`, engine): a questo punto una parte ripresa
        // ha già un `result` fresco, con lo stesso feedback che avrebbe
        // mostrato al momento dell'invio originale. Senza questo, riprendere
        // un tentativo mostrerebbe il punteggio giusto ma nessuna delle
        // spiegazioni sotto ogni parte — un mezzo ripristino.
        const parteEngine = q.getPart(parte.path);
        if (parteEngine?.result) {
          feedbackIniziale[parte.path] = parteEngine.result.feedback;
        }
      }

      setParti(partiCostruite);
      setStatementHtml(q.statementHtml);
      setAdviceHtml(q.adviceHtml);
      setRisposte(risposteIniziali);
      setRispostoConSuccesso(rispostoIniziale);
      setFeedbackPerParte(feedbackIniziale);
      const totale = q.score();
      setPunteggio({ score: totale.score, maxScore: totale.marks });
      setFase("esercizio");
    } catch (e) {
      console.error("[esercizi/player] impossibile caricare la domanda", e);
      setFase("errore");
    }
    // Contenuto, seme e stato iniziale sono fissi per tutta la vita del
    // componente: la domanda si carica una volta sola al montaggio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cambiaRisposta(path: string, valore: Answer) {
    setRisposte((r) => ({ ...r, [path]: valore }));
    // Il primo segno che lo studente è davvero tornato ed è al lavoro: il
    // banner di ripresa ha fatto il suo compito, non deve restare a
    // ingombrare mentre risponde a domande nuove.
    setBannerRipresaVisibile(false);
  }

  /** Una parte è "confermata sbagliata" — la condizione che fa comparire il
   * ripasso — solo dopo un giro di rete riuscito (`rispostoConSuccesso`, mai
   * prima: niente ripasso su un calcolo ottimistico che il server potrebbe
   * ancora smentire).
   *
   * Il tipo delle voci di feedback (`"incorrect"`) NON è un segnale
   * affidabile per questo, a differenza di quanto sembra sulle parti a
   * risposta singola: per `1_n_2`/`m_n_2`/`m_n_x` lo script di correzione
   * (`multipleresponse.jme`, ramo `only_ticked_score_ticks`) dà quasi sempre
   * il proprio commento per cella con `add_credit`, che NON porta un
   * `reason` — sia per una spunta giusta sia per una sbagliata — e diventa
   * "info" (grigio, senza icona) in `publicFeedbackType`. Passa a
   * "incorrect" (`negative_feedback`) solo se quella cella ha peso ESATTAMENTE
   * zero nella matrice E l'autore ha scritto un distrattore non vuoto — vero
   * per 02-scomposizione-polinomi, falso per 04 e 05 (pesi tutti ±1, nessun
   * distrattore): verificato al banco, un 0/2 su 04 non mostrava alcun
   * bottone. Il segnale giusto è quindi il credito della parte
   * (`PartBase#result.correct`, `credit >= 1`): calcolato dallo stesso
   * motore che gira anche sul server, sullo stesso stato appena confermato
   * dal giro di rete riuscito — è quello, e non il tipo dei messaggi, a
   * dire se la parte è a posto. */
  function parteConfermataSbagliata(path: string): boolean {
    if (!rispostoConSuccesso[path]) return false;
    const parteEngine = domandaRef.current?.getPart(path);
    return parteEngine?.result?.correct === false;
  }

  async function inviaParte(parte: PartePubblica) {
    const q = domandaRef.current;
    const parteEngine = q?.getPart(parte.path);
    if (!q || !parteEngine) return;

    const path = parte.path;
    const valoreGrezzo = risposte[path] ?? null;
    // L'ultimo punteggio e feedback CONFERMATI dal server, prima di questo
    // invio: se la richiesta fallisce, si torna esattamente qui, mai al
    // valore ottimistico appena calcolato in locale qualche riga sotto — il
    // punto centrale del disegno (punto 3 del dispaccio) è che sullo
    // schermo non deve mai restare un numero che il server non ha
    // confermato, nemmeno per un attimo dopo che la richiesta è fallita.
    const punteggioConfermato = punteggio;
    const feedbackConfermato = feedbackPerParte[path];

    setErroriRete((e) => ({ ...e, [path]: false }));
    setInviando((s) => ({ ...s, [path]: true }));

    try {
      // Correzione locale immediata, per il feedback ottimistico: mai i
      // numeri che vengono mostrati alla fine, quelli arrivano solo dal
      // server (punto 3 del dispaccio).
      const valorePerMotore = preparaRispostaPerMotore(parte, valoreGrezzo);
      const risultatoLocale = parteEngine.submit(valorePerMotore);
      const totaleLocale = q.score();
      // Il motore, e non l'esito HTTP, decide se la parte risulta RISPOSTA:
      // `submit()` mette `answered = false` quando non c'è una risposta da
      // correggere (`part-base.ts`, ramo `submit_no_staged_answer`). È lo
      // stesso criterio che userà il server, che rinvia solo le parti con
      // `answered: true` (engine, `applyQuestionState`).
      const parteRisposta = parteEngine.answered === true;

      setFeedbackPerParte((f) => ({ ...f, [path]: risultatoLocale.feedback }));
      setPunteggio({ score: totaleLocale.score, maxScore: totaleLocale.marks });

      const esito = await inviaRisposta(tentativoId, path, valoreGrezzo, q.toState(), locale);

      // Il server sostituisce sempre punteggio e feedback locali: è lui
      // l'autorità (punto 3 del dispaccio). Con una eccezione precisa: se non
      // manda NESSUNA voce di feedback. Succede per una parte che il motore
      // considera non risposta — il server rinvia solo le parti con
      // `answered: true`, quindi la sua `p.result` resta vuota e
      // `marking.ts` restituisce `[]`. Sostituire lì il feedback locale con
      // un array vuoto lasciava lo studente davanti a uno schermo muto: campo
      // vuoto, "Invia" premuto, punteggio fermo, nessuna spiegazione. Il
      // motivo — "Non hai inserito un numero valido." — è già stato calcolato
      // qui dal motore del browser: è quello che va mostrato. Non è un
      // punteggio, quindi non viola la regola che i numeri arrivano solo dal
      // server.
      setFeedbackPerParte((f) => ({
        ...f,
        [path]: esito.feedback.length > 0 ? esito.feedback : risultatoLocale.feedback,
      }));
      setPunteggio({ score: esito.score, maxScore: esito.maxScore });
      // Non "la richiesta è andata a buon fine", ma "la parte risulta
      // risposta": una POST riuscita su una parte lasciata in bianco tornava
      // 200, e marcarla risposta faceva comparire "Completa il tentativo"
      // dopo due Invia a vuoto — con un tentativo chiuso a 0 e un seme nuovo
      // alla visita seguente. È anche l'asimmetria che faceva sparire quel
      // bottone dopo una ricarica: al ripristino il flag arriva già dallo
      // stato del motore, che qui non veniva consultato.
      setRispostoConSuccesso((s) => ({ ...s, [path]: parteRisposta }));

      if (esito.score !== totaleLocale.score || esito.maxScore !== totaleLocale.marks) {
        // Browser e Node dovrebbero concordare sullo stesso motore: un
        // disallineamento è un segnale che non deve passare inosservato.
        console.warn("[esercizi/player] punteggio locale e del server divergono", {
          locale: totaleLocale,
          server: { score: esito.score, maxScore: esito.maxScore },
        });
      }
    } catch (e) {
      console.error("[esercizi/player] invio della risposta fallito", e);
      // Nessun numero non confermato dal server resta in vista: si torna al
      // punteggio e al feedback di prima di questo invio, non a quello
      // ottimistico calcolato in locale sopra.
      setPunteggio(punteggioConfermato);
      setFeedbackPerParte((f) => ({ ...f, [path]: feedbackConfermato ?? [] }));
      setErroriRete((er) => ({ ...er, [path]: true }));
    } finally {
      setInviando((s) => ({ ...s, [path]: false }));
    }
  }

  async function completaEsercizio() {
    setCompletando(true);
    setErroreCompletamento(false);
    try {
      const esito = await completaTentativo(tentativoId, locale);
      setPunteggio({ score: esito.score, maxScore: esito.maxScore });
      setFase("riepilogo");
    } catch (e) {
      console.error("[esercizi/player] completamento del tentativo fallito", e);
      setErroreCompletamento(true);
    } finally {
      setCompletando(false);
    }
  }

  /** Distrugge il tentativo attuale (segnato `ABANDONED` dal server, mai
   * `COMPLETED` — vedi `abbandona` nel dominio) e fa ripartire la pagina da
   * capo: `router.refresh()` rifà girare `avviaORiprendi` lato server, che
   * trova il vecchio tentativo non più `IN_PROGRESS` e ne apre uno nuovo con
   * un seme diverso. Chiamata solo da `confermaRicomincio` DOPO la conferma
   * esplicita nel dialogo — mai dal bottone che lo apre. */
  async function confermaRicomincio() {
    setRicominciando(true);
    setErroreRicomincio(false);
    try {
      await abbandonaTentativo(tentativoId, locale);
      setDialogoRicominciaAperto(false);
      router.refresh();
    } catch (e) {
      console.error("[esercizi/player] abbandono del tentativo fallito", e);
      setErroreRicomincio(true);
    } finally {
      setRicominciando(false);
    }
  }

  if (fase === "caricamento") {
    return <p>{t("caricamento")}</p>;
  }

  if (fase === "errore") {
    return <p role="alert">{t("erroreCaricamento")}</p>;
  }

  if (fase === "riepilogo") {
    // Il riepilogo era un vicolo cieco: titolo, "Tentativo completato.",
    // punteggio, e nient'altro. Su un telefono le uniche uscite erano il
    // tasto indietro e la disconnessione, e una ricarica apriva un tentativo
    // nuovo con un altro seme — il punteggio appena preso diventava
    // irraggiungibile senza che nessuno lo avesse detto. Due uscite
    // esplicite, quindi: l'elenco degli esercizi e un nuovo tentativo.
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">{t("riepilogo")}</h1>
        <p>{t("tentativoCompletato")}</p>
        {punteggio && (
          <p className="text-lg font-semibold">
            {t("punteggio")}: {punteggio.score} / {punteggio.maxScore}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Link href="/studente" className={buttonVariants({ variant: "outline" })}>
            {t("tornaAgliEsercizi")}
          </Link>
          {/* Un'ancora vera, non un `Link`: aprire un nuovo tentativo è un
              giro dal server (`avviaORiprendi` ne crea uno con un seme
              nuovo, visto che questo è ormai chiuso), e una navigazione
              client verso la rotta su cui siamo già non lo farebbe. */}
          <a href={withBasePath(`/studente/esercizio/${esercizioId}`)} className={buttonVariants()}>
            {t("riprovaEsercizio")}
          </a>
        </div>
      </section>
    );
  }

  const partiDaRispondere = parti.filter((p) => p.type !== "information");
  const tutteRisposte =
    partiDaRispondere.length > 0 && partiDaRispondere.every((p) => rispostoConSuccesso[p.path]);

  return (
    <section className="space-y-6">
      {richiestaCompitoRifiutata && (
        // Una riga silenziosa, non un avviso (Secondo giro, item 2): lo
        // studente non ha sbagliato nulla, e mostrarla come un errore
        // allarmerebbe per un esito che nella maggioranza dei casi è
        // benigno (un'assegnazione non ancora aperta, una classe cambiata
        // fra un accesso e l'altro — vedi `richiestaCompitoRifiutata` nel
        // dominio). Ma deve essere VISIBILE: senza questa riga il player non
        // diceva nulla che permettesse allo studente di distinguere un
        // tentativo che conta per un compito da uno che non conta più.
        <p className="text-sm text-muted-foreground">{t("praticaLiberaAvviso")}</p>
      )}
      {bannerRipresaVisibile && (
        // `role="status"` (live region "polite"): comparire in silenzio,
        // senza che chi usa uno screen reader se ne accorga, sarebbe
        // esattamente il difetto originale — uno stato reale mostrato come
        // se non ci fosse nulla da spiegare. Resta finché lo studente non
        // interagisce (`cambiaRisposta` la spegne): niente timeout, perché
        // può aver aperto la pagina ed essersi allontanato.
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100"
        >
          <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <span>{t("ripresaTentativo", { quando: quandoRipreso })}</span>
        </div>
      )}
      <ContenutoHtml html={statementHtml} />
      {punteggio && (
        <p>
          {t("punteggio")}: {punteggio.score} / {punteggio.maxScore}
        </p>
      )}
      <div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setDialogoRicominciaAperto(true)}
        >
          {t("ricomincia")}
        </Button>
        {dialogoRicominciaAperto && (
          // Conferma inline, non un bottone unico accanto a "Invia": lo
          // studente deve leggere che le risposte date finora andranno
          // perse PRIMA che qualcosa venga distrutto. `role="alertdialog"`:
          // è una richiesta che interrompe per un sì/no immediato, non un
          // annuncio passivo come i `role="status"` sopra.
          <div
            role="alertdialog"
            aria-label={t("ricominciaTitolo")}
            className="mt-2 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          >
            <p className="font-medium">{t("ricominciaTitolo")}</p>
            <p className="text-sm text-muted-foreground">{t("ricominciaDescrizione")}</p>
            {erroreRicomincio && (
              <p role="alert" className="text-sm text-destructive">{t("erroreRicomincio")}</p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogoRicominciaAperto(false)}
                disabled={ricominciando}
              >
                {t("annulla")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confermaRicomincio}
                disabled={ricominciando}
              >
                {t("ricominciaAzione")}
              </Button>
            </div>
          </div>
        )}
      </div>
      {parti.map((parte) => (
        <div key={parte.path} className="space-y-2 rounded-lg border p-4">
          <InputParte
            parte={parte}
            valore={risposte[parte.path] ?? null}
            onChange={(v) => cambiaRisposta(parte.path, v)}
            disabilitato={inviando[parte.path] === true}
          />
          {parte.type !== "information" && (
            <Button onClick={() => inviaParte(parte)} disabled={inviando[parte.path] === true}>
              {t("invia")}
            </Button>
          )}
          {(feedbackPerParte[parte.path] ?? []).map((f, i) => (
            <VoceFeedback key={i} voce={f} />
          ))}
          {erroriRete[parte.path] && (
            <div role="alert" className="space-y-1">
              <p>{t("erroreRete")}</p>
              <Button type="button" variant="outline" onClick={() => inviaParte(parte)}>
                {t("riprova")}
              </Button>
            </div>
          )}
          {parteConfermataSbagliata(parte.path) &&
            (() => {
              const parteEngine = domandaRef.current?.getPart(parte.path);
              if (!parteEngine) return null;
              return (
                <SpiegazioneParte
                  parte={parte}
                  parteEngine={parteEngine}
                  adviceHtml={adviceHtml}
                  soluzioneRivelata={soluzioneRivelata}
                  onRivelaSoluzione={() => setSoluzioneRivelata(true)}
                  rispostaRivelata={rispostaRivelataPerParte[parte.path] === true}
                  onRivelaRisposta={() =>
                    setRispostaRivelataPerParte((r) => ({ ...r, [parte.path]: true }))
                  }
                />
              );
            })()}
        </div>
      ))}
      {tutteRisposte && (
        <Button onClick={completaEsercizio} disabled={completando}>
          {t("completa")}
        </Button>
      )}
      {erroreCompletamento && <p role="alert">{t("erroreRete")}</p>}
    </section>
  );
}
