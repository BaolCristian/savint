/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// question.js:809-889 — la costruzione di `variablesTodo` dalle definizioni
// JSON, il ciclo `variablesTest` e la finalizzazione dello scope (`flatten`,
// `local_definitions`, `unwrappedVariables`).
//
// upstream: il ciclo è `async` solo per poter attendere le funzioni JavaScript
// che restituiscono una `Promise` (inventario 06 §8); quelle sono rifiutate al
// caricamento (decisione 4 del brief), quindi qui è sincrono.
// Vedi DIVERGENCES.md.

import { findvars, unwrapValue } from "../jme/evaluate";
import { compile } from "../jme/parser";
import { Scope } from "../jme/scope";
import { normaliseName } from "../jme/tokenizer";
import { TNum, type Tree } from "../jme/tokens";
import { makeVariables, splitVariableNames, type VariablesTodo } from "../variables";
import type { JMEValue, QuestionVariableJSON } from "./types";

/** Il numero massimo di tentativi di generazione, come upstream
 * (question.js:851: `Math.min(1000000, maxRuns)`). */
const MAX_RUNS_LIMIT = 1000000;

/** Chi segnala un errore attribuendolo alla domanda (`Question#error`). */
export type QuestionErrorFn = (message: string, args?: Record<string, string | number>, cause?: unknown) => never;

// question.js:809-842
/** Costruisce il grafo delle variabili dalle definizioni JSON: normalizza i
 * nomi, rifiuta i duplicati, compila le definizioni e ne calcola le
 * dipendenze. */
export function buildVariablesTodo(
  definitions: QuestionVariableJSON[],
  scope: Scope,
  error: QuestionErrorFn,
): VariablesTodo {
  const todo: VariablesTodo = {};
  const seen_names: Record<string, boolean> = {};
  const depScope = scopeDelleDipendenze(definitions, scope);
  for (const def of definitions) {
    const name = normaliseName((def.name ?? "").trim(), scope);
    const names = splitVariableNames(name);
    for (const n of names) {
      if (seen_names[n]) {
        error("jme.variables.duplicate definition", { name: n });
      }
      seen_names[n] = true;
    }
    const definition = String(def.definition ?? "").trim();
    if (name === "") {
      if (definition === "") {
        continue;
      }
      error("jme.variables.empty name");
    }
    if (definition === "") {
      error("jme.variables.empty definition", { name: name });
    }
    let tree: Tree | null;
    try {
      tree = compile(definition);
    } catch (e) {
      error("variable.error in variable definition", { name: name }, e);
    }
    todo[name] = { tree: tree, vars: findvars(tree, [], depScope) };
  }
  return todo;
}

/** Lo scope in cui cercare le dipendenze: quello della domanda, senza le
 * costanti che hanno lo stesso nome di una variabile della domanda.
 *
 * upstream: `findvars` salta i nomi delle costanti (jme.js), quindi in
 * `p = [5, 20, 25][i]` con una variabile `i` la dipendenza da `i` non c'è, e
 * il risultato dipende dall'ordine delle definizioni: se `p` si calcola
 * prima di `i`, legge la costante `i` (l'unità immaginaria) e fallisce o dà
 * un valore sbagliato. L'ordine non è nelle mani del docente: PostgreSQL
 * (jsonb) riordina le chiavi di `variables`. Qui la variabile è sempre una
 * dipendenza; la valutazione la preferisce già alla costante
 * (`Scope.getVariable` prima di `getConstant`). Vedi DIVERGENCES.md. */
function scopeDelleDipendenze(definitions: QuestionVariableJSON[], scope: Scope): Scope {
  const nomi = definitions.flatMap((d) => splitVariableNames(normaliseName((d.name ?? "").trim(), scope)));
  const ombra = nomi.filter((n) => scope.getConstant(n) !== undefined);
  if (ombra.length === 0) return scope;
  const s = new Scope([scope]);
  ombra.forEach((n) => s.deleteConstant(n));
  return s;
}

/** Il risultato del ciclo di generazione. */
export interface GeneratedVariables {
  /** Lo scope che contiene i valori generati (figlio di quello di domanda). */
  scope: Scope;
  /** Quanti tentativi sono serviti. */
  runs: number;
}

// question.js:844-867
/** Genera le variabili, ripetendo finché `condition` non è soddisfatta.
 *
 * Ogni tentativo crea un **nuovo** scope figlio di `questionScope` e chiama di
 * nuovo `makeVariables`, che continua a consumare lo stesso generatore
 * casuale: i tentativi falliti "bruciano" casualità, esattamente come
 * upstream. */
export function generateVariables(
  todo: VariablesTodo,
  questionScope: Scope,
  variablesTest: { condition: string; maxRuns: number },
  error: QuestionErrorFn,
): GeneratedVariables {
  let conditionSatisfied = false;
  // `compile("")` ritorna `null`: nessuna condizione, nessuna valutazione, un
  // solo giro (inventario 06 §8). Un `condition` che non compila è un errore
  // di caricamento come qualunque altra espressione della domanda.
  const condition = compile(variablesTest.condition);
  let runs = 0;
  let scope: Scope | undefined;
  let maxRuns = variablesTest.maxRuns;
  if (isNaN(maxRuns) || maxRuns < 1) {
    maxRuns = 1;
  }
  maxRuns = Math.min(MAX_RUNS_LIMIT, maxRuns);
  while (runs < maxRuns && !conditionSatisfied) {
    runs += 1;
    scope = new Scope([questionScope]);
    scope.setVariable("variable_generation_run_number", new TNum(runs));
    const result = makeVariables(todo, scope, condition);
    conditionSatisfied = result.conditionSatisfied;
  }
  if (!conditionSatisfied || scope === undefined) {
    error("jme.variables.question took too many runs to generate variables");
  }
  return { scope: scope, runs: runs };
}

// question.js:868-886
/** Chiude la generazione: appiattisce le variabili nello scope della domanda e
 * ne restituisce la versione "spacchettata" per l'API pubblica. */
export function finaliseVariableScope(generatedScope: Scope): {
  scope: Scope;
  unwrappedVariables: Record<string, JMEValue>;
} {
  const scope = new Scope([generatedScope]);
  scope.flatten();
  const unwrappedVariables: Record<string, JMEValue> = {};
  for (const [name, v] of Object.entries(scope.allVariables())) {
    unwrappedVariables[name] = unwrapValue(v) as JMEValue;
  }
  return { scope: scope, unwrappedVariables: unwrappedVariables };
}

/** Riesporta il tipo del grafo delle variabili, per non obbligare chi consuma
 * il modulo `question/` a importare `variables/`. */
export type { VariablesTodo };
