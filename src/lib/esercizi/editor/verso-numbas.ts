import { esercizioFileSchema, type EsercizioFile } from "../format/schema";
import type { EsercizioEditor, ParteEditor, Tolleranza } from "./modello";

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
        prompt: `<p>${parte.consegna}</p>`,
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
        prompt: `<p>${parte.consegna}</p>`,
        choices: parte.risposte.map((r) => `<p>${r}</p>`),
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
        distractors: parte.spiegazioni ?? parte.risposte.map(() => ""),
      };
    case "espressione":
      return {
        type: "jme",
        marks: parte.punti,
        prompt: `<p>${parte.consegna}</p>`,
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
    statement: `<p>${e.testo}</p>`,
    advice: e.suggerimento ? `<p>${e.suggerimento}</p>` : "",
    variables: Object.fromEntries(
      e.variabili.map((v) => [v.nome, { name: v.nome, definition: v.definizione, description: v.descrizione }]),
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
