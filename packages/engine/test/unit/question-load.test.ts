// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Caricamento di una domanda dal JSON (question.js:495-645 `loadFromJSON`,
// 772-808 costanti/funzioni/ruleset di `finaliseLoad`), più i rifiuti espliciti
// delle funzionalità fuori ambito (decisioni 1-4 del brief).
//
// Traduce anche i casi `question_test` del modulo "Question"
// (part-tests.mjs:1344-1412) che riguardano il caricamento: 'Question',
// 'Built-in constants: with j', 'Built-in constants: no j', 'e defined as a
// variable is not used in mathematical expression part answers'.

import { describe, expect, it } from "vitest";
import { JmeError } from "../../src/jme/errors";
import { loadQuestion } from "../../src/question";
import { engineErrorKeys } from "../../src/errors";
import type { NumbasQuestionJSON } from "../../src/question";

/** La domanda minima del brief: due variabili dipendenti e una parte che le usa. */
const minimalQuestion: NumbasQuestionJSON = {
  name: "Q",
  statement: "<p>{a}+{b}</p>",
  variables: {
    a: { name: "a", definition: "random(1..9)" },
    b: { name: "b", definition: "a+1" },
  },
  parts: [{ type: "numberentry", marks: 1, minValue: "a+b", maxValue: "a+b" }],
};

/** Le chiavi d'errore lanciate da `fn`, dalla più esterna alla più interna.
 *
 * Gli errori di caricamento della domanda sono avvolti in `question.error`
 * come upstream (question.js:249-260): la chiave che interessa è quella
 * interna, quindi si confronta la catena. */
function errorKeys(fn: () => unknown): string[] {
  try {
    fn();
  } catch (e) {
    return e instanceof JmeError ? engineErrorKeys(e) : [`NON-JmeError: ${String(e)}`];
  }
  return [];
}

describe("loadQuestion", () => {
  it("genera le variabili e le sostituisce nell'enunciato", () => {
    const q = loadQuestion(minimalQuestion, { seed: "s1" });
    const a = q.variables["a"] as number;
    const b = q.variables["b"] as number;
    expect(typeof a, "a è un numero").toBe("number");
    expect(b, "b vale a+1").toBe(a + 1);
    expect(q.statementHtml, "l'enunciato contiene i valori").toBe(`<p>${a}+${b}</p>`);
    expect(q.name).toBe("Q");
    expect(q.parts).toHaveLength(1);
    expect(q.parts[0]?.type).toBe("numberentry");
  });

  it("lo stesso seed dà gli stessi valori", () => {
    const a1 = loadQuestion(minimalQuestion, { seed: "s1" }).variables["a"];
    const a2 = loadQuestion(minimalQuestion, { seed: "s1" }).variables["a"];
    expect(a2).toBe(a1);
  });

  it("`regenerate` con un altro seed cambia i valori", () => {
    const q = loadQuestion(minimalQuestion, { seed: "s1" });
    // `random(1..9)` ha nove valori: si cerca un seed che dia un `a` diverso.
    const seeds = ["s2", "s3", "s4", "s5"];
    const different = seeds.some((s) => q.regenerate(s).variables["a"] !== q.variables["a"]);
    expect(different, "almeno un altro seed dà un `a` diverso").toBe(true);
    expect(q.regenerate("s1").variables["a"], "lo stesso seed rigenera lo stesso valore").toBe(q.variables["a"]);
  });

  it("la parte usa le variabili della domanda", () => {
    const q = loadQuestion(minimalQuestion, { seed: "s1" });
    const a = q.variables["a"] as number;
    const b = q.variables["b"] as number;
    const p = q.getPart("p0");
    expect(p, "la parte p0 esiste").toBeDefined();
    expect(p?.submit(String(a + b)).credit).toBe(1);
    expect(q.score()).toEqual({ score: 1, marks: 1 });
  });

  it("`partsMode: \"explore\"` non è supportato", () => {
    expect(errorKeys(() => loadQuestion({ ...minimalQuestion, partsMode: "explore" }, { seed: "s1" }))).toContain(
      "question.parts mode not supported",
    );
  });

  it("`preamble.js` non vuoto non è supportato, se non con `ignorePreamble`", () => {
    const withPreamble: NumbasQuestionJSON = { ...minimalQuestion, preamble: { js: "x=1", css: "" } };
    expect(errorKeys(() => loadQuestion(withPreamble, { seed: "s1" }))).toContain("question.preamble not supported");
    // il preambolo vuoto (o di soli spazi) non è un problema
    expect(
      errorKeys(() => loadQuestion({ ...minimalQuestion, preamble: { js: "  \n ", css: "p{}" } }, { seed: "s1" })),
    ).toEqual([]);
    const q = loadQuestion(withPreamble, { seed: "s1", ignorePreamble: true });
    expect(q.variables["b"]).toBe((q.variables["a"] as number) + 1);
  });

  it("le estensioni non sono disponibili", () => {
    expect(errorKeys(() => loadQuestion({ ...minimalQuestion, extensions: ["geogebra"] }, { seed: "s1" }))).toContain(
      "question.required extension not available",
    );
    // una lista vuota non è un problema
    expect(errorKeys(() => loadQuestion({ ...minimalQuestion, extensions: [] }, { seed: "s1" }))).toEqual([]);
  });

  it("una funzione JavaScript asincrona non è supportata", () => {
    const json: NumbasQuestionJSON = {
      ...minimalQuestion,
      functions: {
        wait: {
          parameters: [["time", "number"]],
          type: "promise",
          language: "javascript",
          definition: "return new Promise(function(){});",
        },
      },
    };
    expect(errorKeys(() => loadQuestion(json, { seed: "s1" }))).toContain("question.function.async not supported");
  });

  it("una funzione JME personalizzata è utilizzabile dalle variabili", () => {
    const json: NumbasQuestionJSON = {
      name: "f",
      functions: {
        double: {
          parameters: [["x", "number"]],
          type: "number",
          language: "jme",
          definition: "2*x",
        },
      },
      variables: { a: { name: "a", definition: "double(21)" } },
    };
    expect(loadQuestion(json, { seed: "s1" }).variables["a"]).toBe(42);
  });

  it("`allowJavascriptFunctions: false` rifiuta le funzioni JavaScript", () => {
    const json: NumbasQuestionJSON = {
      name: "f",
      functions: {
        one: { parameters: [], type: "number", language: "javascript", definition: "return new Numbas.jme.types.TNum(1);" },
      },
    };
    expect(errorKeys(() => loadQuestion(json, { seed: "s1", allowJavascriptFunctions: false }))).toContain(
      "jme.variables.javascript function not allowed",
    );
  });

  it("i ruleset della domanda sono definiti nello scope", () => {
    const json: NumbasQuestionJSON = { name: "r", rulesets: { mine: ["basic", "unitFactor"] } };
    const q = loadQuestion(json, { seed: "s1" });
    expect(q.scope.getRuleset("mine")).toBeDefined();
  });

  // part-tests.mjs:1364-1377
  it("costanti builtin: con j", () => {
    const q = loadQuestion({ name: "c", builtin_constants: { j: true, e: false } }, { seed: "s1" });
    expect(q.scope.getConstant("j"), "j è accesa dalla domanda").toBeDefined();
    expect(q.scope.getConstant("pi"), "pi è accesa di default").toBeDefined();
    expect(q.scope.getConstant("e"), "e è spenta dalla domanda").toBeUndefined();
  });

  // part-tests.mjs:1378-1390
  it("costanti builtin: senza j", () => {
    const q = loadQuestion({ name: "c", builtin_constants: { e: false } }, { seed: "s1" });
    expect(q.scope.getConstant("j"), "j è spenta di default").toBeUndefined();
    expect(q.scope.getConstant("pi")).toBeDefined();
    expect(q.scope.getConstant("e")).toBeUndefined();
  });

  it("le costanti personalizzate sono definite", () => {
    const q = loadQuestion(
      { name: "c", constants: [{ name: "k", value: "6*7", tex: "k" }], variables: { a: { name: "a", definition: "k" } } },
      { seed: "s1" },
    );
    expect(q.variables["a"]).toBe(42);
  });

  // part-tests.mjs:1392-1412
  it("`e` definita come variabile non entra nelle risposte delle parti `jme`", () => {
    const q = loadQuestion(
      {
        variables: { e: { name: "e", definition: "3" } },
        parts: [{ type: "jme", answer: "e^2+a", answerSimplification: "basic" }],
      },
      { seed: "s1" },
    );
    const p = q.getPart("p0");
    expect(p?.submit("e^2+a").credit).toBe(1);
  });

  // part-tests.mjs:1345-1362 (`question_test('Question', ...)`)
  it("Question: una parte `jme`, punteggio 1", () => {
    const q = loadQuestion({ name: "Barg", parts: [{ type: "jme", answer: "x+2", marks: 1 }] }, { seed: "s1" });
    const p = q.getPart("p0");
    expect(p, "la parte è stata creata").toBeDefined();
    p?.storeAnswer("x+2");
    q.submit();
    expect(q.name).toBe("Barg");
    expect(q.score().score, "il punteggio è 1").toBe(1);
  });

  it("il nome della domanda passa per la sostituzione delle variabili", () => {
    const q = loadQuestion({ name: "Domanda {a}", variables: { a: { name: "a", definition: "7" } } }, { seed: "s1" });
    expect(q.name).toBe("Domanda 7");
  });

  it("`advice` è sostituito come l'enunciato", () => {
    const q = loadQuestion(
      { name: "a", advice: "<p>vale {a}</p>", variables: { a: { name: "a", definition: "7" } } },
      { seed: "s1" },
    );
    expect(q.adviceHtml).toBe("<p>vale 7</p>");
  });

  it("il `prompt` di una parte è sostituito con le variabili", () => {
    const q = loadQuestion(
      {
        variables: { a: { name: "a", definition: "7" } },
        parts: [{ type: "information", prompt: "<p>vale {a}</p>" }],
      },
      { seed: "s1" },
    );
    expect(q.parts[0]?.promptHtml).toBe("<p>vale 7</p>");
  });

  // Giro di correzioni 1: `substituteHtml` va chiamata avvolta da
  // `Question#error`, come già fa `buildVariablesTodo` per le definizioni di
  // variabile (`variable.error in variable definition`, sopra) — altrimenti
  // un difetto di sostituzione (qui `\simplify{sqrt()}`, che l'arità di
  // `texFunction` ora rifiuta) arriva senza dire in quale campo si trova.
  // La catena resta intera: la chiave di `jme.display.wrong number of
  // arguments` (la causa vera) c'è ancora, PIÙ una chiave che nomina il
  // campo — non una al posto dell'altra.
  it("un difetto di sostituzione nell'enunciato nomina il campo, senza perdere la causa", () => {
    const keys = errorKeys(() =>
      loadQuestion({ name: "n", statement: "\\(\\simplify{sqrt()}\\)" }, { seed: "s1" }),
    );
    expect(keys).toContain("question.error in statement");
    expect(keys).toContain("jme.display.wrong number of arguments");
  });

  it("un difetto di sostituzione nel suggerimento nomina il campo", () => {
    const keys = errorKeys(() =>
      loadQuestion({ name: "n", advice: "\\(\\simplify{sqrt()}\\)" }, { seed: "s1" }),
    );
    expect(keys).toContain("question.error in advice");
    expect(keys).toContain("jme.display.wrong number of arguments");
  });

  it("un difetto di sostituzione nella consegna di una parte nomina il percorso della parte", () => {
    const keys = errorKeys(() =>
      loadQuestion(
        { name: "n", parts: [{ type: "information", prompt: "\\(\\simplify{sqrt()}\\)" }] },
        { seed: "s1" },
      ),
    );
    expect(keys).toContain("question.error in part prompt");
    expect(keys).toContain("jme.display.wrong number of arguments");
  });

  it("i nomi delle parti sono assegnati come upstream", () => {
    const q = loadQuestion(
      {
        parts: [
          { type: "gapfill", prompt: "[[0]]", gaps: [{ type: "numberentry", marks: 1, minValue: "1", maxValue: "1" }] },
          { type: "numberentry", marks: 1, minValue: "1", maxValue: "1" },
        ],
      },
      { seed: "s1" },
    );
    expect(q.getPart("p0")?.name).toBe("a)");
    expect(q.getPart("p1")?.name).toBe("b)");
    // il nome dei gap passa da `t("gap")`, quindi è nella lingua corrente
    // (predefinita `it`): "Spazio 0", non "Gap 0".
    expect(q.getPart("p0g0")?.name).toBe("Spazio 0");
  });

  it("una variabile senza nome, o senza definizione, è un errore", () => {
    expect(
      errorKeys(() => loadQuestion({ variables: { x: { name: "", definition: "1" } } }, { seed: "s1" })),
    ).toContain("jme.variables.empty name");
    expect(
      errorKeys(() => loadQuestion({ variables: { x: { name: "x", definition: "" } } }, { seed: "s1" })),
    ).toContain("jme.variables.empty definition");
    // nome e definizione entrambi vuoti: la definizione è saltata in silenzio
    expect(errorKeys(() => loadQuestion({ variables: { x: { name: "", definition: "" } } }, { seed: "s1" }))).toEqual([]);
  });

  it("due definizioni della stessa variabile sono un errore", () => {
    expect(
      errorKeys(() =>
        loadQuestion(
          { variables: { x: { name: "a", definition: "1" }, y: { name: "a", definition: "2" } } },
          { seed: "s1" },
        ),
      ),
    ).toContain("jme.variables.duplicate definition");
  });

  it("una definizione che non compila è un errore", () => {
    expect(
      errorKeys(() => loadQuestion({ variables: { x: { name: "a", definition: "1+" } } }, { seed: "s1" })),
    ).toContain("variable.error in variable definition");
  });

  it("l'assegnazione multipla `a,b` funziona", () => {
    const q = loadQuestion({ variables: { "a,b": { name: "a,b", definition: "[1,2]" } } }, { seed: "s1" });
    expect(q.variables["a"]).toBe(1);
    expect(q.variables["b"]).toBe(2);
  });

  it("i campi di sola redazione sono ignorati", () => {
    const q = loadQuestion(
      {
        name: "m",
        tags: ["algebra"],
        metadata: { description: "x", licence: "y" },
        ungrouped_variables: ["a"],
        variable_groups: [],
        variables: { a: { name: "a", definition: "1", group: "Ungrouped variables", description: "", templateType: "anything" } },
      },
      { seed: "s1" },
    );
    expect(q.variables["a"]).toBe(1);
    expect(q.tags).toEqual(["algebra"]);
  });
});
