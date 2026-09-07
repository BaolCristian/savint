import { esercizioFileSchema, type EsercizioFile } from "../format/schema";
import type { EsercizioEditor, ParteEditor, Tolleranza } from "./modello";

/** Il testo del docente finisce dentro `<p>...</p>` (o, per `distractors` e
 * `description`, direttamente nel campo): un `<`/`>`/`&` letterale non è più
 * vietato dallo schema (una disequazione `x < 0` è testo matematico
 * legittimo), ma senza escaping diventerebbe HTML vero quando il player lo
 * incorpora nella pagina. L'ampersand va per primo: se andasse dopo,
 * un `<` scritto dal docente diventerebbe `&lt;`, e poi quell'`&` verrebbe
 * scappato di nuovo in `&amp;lt;` — doppio escaping, testo sbagliato in
 * pagina. Esportata perché `da-numbas.ts` la riusa per costruire la stessa
 * forma canonica nel confronto strutturale, non una seconda regola. */
export function escapaTesto(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Numbas non ha un campo «risposta» per una domanda numerica: ha `minValue`
 * e `maxValue`, entrambe espressioni JME. Le parentesi attorno a `valore`
 * sono obbligatorie: `valore` può essere un'espressione come `(c-b)/a`, e
 * senza parentesi la sottrazione/addizione del margine cambierebbe il
 * significato dell'espressione invece di spostarne solo il risultato. Le
 * cifre decimali impostano solo la precisione mostrata/attesa: l'intervallo
 * resta lo stesso valore esatto su entrambi gli estremi. */
function intervalloNumerico(valore: string, t: Tolleranza) {
  switch (t.tipo) {
    case "esatta":
      return { minValue: valore, maxValue: valore };
    case "margine":
      return {
        minValue: `(${valore}) - (${t.margine})`,
        maxValue: `(${valore}) + (${t.margine})`,
      };
    case "decimali":
      return {
        minValue: valore,
        maxValue: valore,
        precision: String(t.cifre),
        precisionType: "dp",
        strictPrecision: false,
        showPrecisionHint: true,
        precisionPartialCredit: 0,
      };
  }
}

function versoParte(parte: ParteEditor): unknown {
  switch (parte.tipo) {
    case "numerica":
      return {
        type: "numberentry",
        marks: parte.punti,
        prompt: `<p>${escapaTesto(parte.consegna)}</p>`,
        ...intervalloNumerico(parte.valore, parte.tolleranza),
        correctAnswerFraction: false,
        allowFractions: false,
        notationStyles: ["plain", "en", "si-en", "plain-eu", "eu", "si-fr"],
        correctAnswerStyle: "plain-eu",
      };
    case "scelta":
      return {
        type: "1_n_2",
        marks: 0, // i punti stanno nella matrice, non qui
        prompt: `<p>${escapaTesto(parte.consegna)}</p>`,
        choices: parte.risposte.map((r) => `<p>${escapaTesto(r)}</p>`),
        matrix: parte.risposte.map((_, i) => (i === parte.indiceGiusta ? String(parte.punti) : "0")),
        displayType: "radiogroup",
        displayColumns: 0,
        shuffleChoices: true,
        showCellAnswerState: true,
        minMarks: 0,
        maxMarks: 0,
        // Il commento che lo studente legge dopo una risposta sbagliata.
        // "" per ogni risposta quando il docente non ha scritto spiegazioni:
        // stesso involucro (Numbas vuole comunque un array lungo quanto
        // le risposte), nessuna informazione persa.
        distractors: (parte.spiegazioni ?? parte.risposte.map(() => "")).map(escapaTesto),
      };
    case "espressione":
      return {
        type: "jme",
        marks: parte.punti,
        prompt: `<p>${escapaTesto(parte.consegna)}</p>`,
        answer: parte.risposta,
        checkingType: "absdiff",
        checkingAccuracy: 0.001,
        failureRate: 1,
        vsetRange: [0, 1],
        vsetRangePoints: 5,
        checkVariableNames: false,
        expectedVariableNames: [],
        showPreview: true,
        valuegenerators: [],
      };
  }
}

/** Il blocco `question` che il motore Numbas legge. */
export function versoNumbas(e: EsercizioEditor): unknown {
  return {
    name: e.meta.titolo,
    statement: `<p>${escapaTesto(e.testo)}</p>`,
    advice: e.suggerimento ? `<p>${escapaTesto(e.suggerimento)}</p>` : "",
    variables: Object.fromEntries(
      e.variabili.map((v) => [
        v.nome,
        { name: v.nome, definition: v.definizione, description: escapaTesto(v.descrizione) },
      ]),
    ),
    variablesTest: { condition: e.condizione, maxRuns: 10 },
    ungrouped_variables: e.variabili.map((v) => v.nome),
    variable_groups: [],
    functions: {},
    rulesets: {},
    parts: e.parti.map(versoParte),
  };
}

/** L'involucro SAVINT attorno al blocco question, pronto per
 * `esercizioFileSchema`. */
export function versoFile(e: EsercizioEditor): EsercizioFile {
  const file = {
    savint: {
      version: 1 as const,
      title: e.meta.titolo,
      description: e.meta.descrizione,
      yearLevel: e.meta.anno,
      topic: e.meta.argomento,
      tags: e.meta.tag,
      difficulty: e.meta.difficolta,
    },
    question: versoNumbas(e),
  };
  return esercizioFileSchema.parse(file);
}
