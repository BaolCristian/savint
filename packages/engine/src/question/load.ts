/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// question.js:495-645 (`loadFromJSON`) e 772-808 (i blocchi
// costanti → funzioni → ruleset di `finaliseLoad`, in quest'ordine: upstream
// sono rami paralleli di un grafo di Promise, il cui ordine reale dipende
// dall'ordine dei microtask; qui è quello del sorgente, deterministico —
// inventario 06 §8).
//
// Il modulo non conosce la classe `Question`: prende il JSON e restituisce i
// campi già normalizzati più lo scope della domanda. Chi lo chiama
// (`question.ts`) ci mette sopra le variabili e le parti.

import { JmeError } from "../jme/errors";
import { builtinConstants, builtinScope } from "../jme/builtins";
import { makeRng, Scope, type ScopeExtras } from "../jme/scope";
import { getLocale } from "../i18n";
// passi interni del caricamento: si importano dai loro moduli, non
// dall'indice (che pubblica solo la superficie di `variables/`). L'indice va
// comunque importato per il suo side effect, il builtin `make_variables`.
import "../variables";
import { makeConstants } from "../variables/constants";
import { makeFunctions, type FunctionDef } from "../variables/functions";
import { makeRulesets } from "../variables/rulesets";
import type { PartJSON } from "../parts";
import type { LoadOptions, NumbasQuestionJSON, QuestionConstantJSON, QuestionVariableJSON } from "./types";

/** I campi di una domanda già letti dal JSON, prima della generazione delle
 * variabili. */
export interface ParsedQuestion {
  /** Il nome grezzo (le `{variabili}` non sono ancora sostituite). */
  name: string;
  /** Il nome alternativo scelto dall'autore. */
  customName: string;
  /** L'autore ha dato un nome proprio alla domanda?
   *
   * upstream: il percorso JSON non calcola MAI `hasCustomName` (lo fa solo il
   * percorso XML, question.js:280-283); qui è derivato da `customName`
   * (decisione 10 del brief, inventario 06 §8 ultimo punto). */
  hasCustomName: boolean;
  /** L'enunciato grezzo, in HTML. */
  statement: string;
  /** Il testo di aiuto grezzo, in HTML. */
  advice: string;
  /** Le etichette libere. */
  tags: string[];
  /** Le definizioni delle variabili, nell'ordine di inserimento delle chiavi. */
  variableDefinitions: QuestionVariableJSON[];
  /** La condizione che le variabili generate devono soddisfare. */
  variablesTest: { condition: string; maxRuns: number };
  /** Le definizioni delle funzioni personalizzate. */
  functionsTodo: FunctionDef[];
  /** I ruleset di semplificazione, per nome. */
  rulesets: Record<string, string[]>;
  /** Quali costanti builtin sono abilitate o disabilitate. */
  enabledConstants: Record<string, boolean>;
  /** Le costanti personalizzate. */
  customConstants: QuestionConstantJSON[];
  /** Le definizioni delle parti. */
  parts: PartJSON[];
}

// question.js:500-626, senza `objectives`/`penalties` (modalità explore,
// decisione 1) e senza il ramo delle estensioni dei tipi di parte custom
// (question.js:514-537: `Numbas.custom_part_types` non è portato).
/** Legge i campi di una domanda dal JSON, rifiutando quel che non è
 * supportato. */
export function parseQuestionJSON(data: NumbasQuestionJSON, opts: LoadOptions): ParsedQuestion {
  // upstream: `partsMode` sceglie fra `'all'` e `'explore'` (question.js:197,
  // 638-642) e la modalità "explore" genera le parti a richiesta con
  // `addExtraPart` (426-458). Decisione 1 del brief: è fuori ambito. Con essa
  // cadono anche `objectives`, `penalties`, `maxMarks` e `showAllParts`, che il
  // port legge e ignora. Vedi DIVERGENCES.md.
  const partsMode = data.partsMode ?? "all";
  if (partsMode !== "all") {
    throw new JmeError("question.parts mode not supported", { mode: String(partsMode) });
  }

  // upstream: `useExtension`/`addExtensionScopes` (question.js:508-513,
  // 647-671) aggiungono lo scope di ogni estensione registrata. Decisione 3 del
  // brief: il motore non ha un meccanismo di estensioni, e fallire subito è
  // meglio che fallire più tardi su una funzione JME sconosciuta (inventario 06
  // §8). Vedi DIVERGENCES.md.
  const extensions = data.extensions ?? [];
  if (extensions.length > 0) {
    // upstream: la chiave è `question.required extension not available` con il
    // parametro `extension` (question.js:664).
    throw new JmeError("question.required extension not available", { extension: String(extensions[0]) });
  }

  // upstream: `runPreamble` esegue `preamble.js` con
  // `new Function(['question'], js)` (question.js:1183-1201), cioè JavaScript
  // arbitrario con accesso completo all'oggetto domanda. Decisione 2 del brief:
  // non si esegue, e nel modulo `question/` non c'è nessun `new Function`.
  // Vedi DIVERGENCES.md.
  const preambleJs = String(data.preamble?.js ?? "").trim();
  if (preambleJs !== "") {
    if (!opts.ignorePreamble) {
      throw new JmeError("question.preamble not supported");
    }
    // eslint-disable-next-line no-console
    console.warn(
      "[@savint/engine] la domanda definisce un preambolo JavaScript: non è supportato ed è ignorato (ignorePreamble).",
    );
  }
  // `preamble.css` è ignorato in silenzio: il motore non produce HTML.

  const variablesTest = { condition: "", maxRuns: 10 };
  if (data.variablesTest) {
    if (data.variablesTest.condition !== undefined) {
      variablesTest.condition = String(data.variablesTest.condition);
    }
    if (data.variablesTest.maxRuns !== undefined) {
      variablesTest.maxRuns = parseFloat(String(data.variablesTest.maxRuns));
    }
  }

  const customName = String(data.customName ?? "");
  return {
    name: String(data.name ?? ""),
    customName: customName,
    hasCustomName: customName !== "",
    statement: String(data.statement ?? ""),
    advice: String(data.advice ?? ""),
    tags: (data.tags ?? []).slice(),
    variableDefinitions: Object.values(data.variables ?? {}),
    variablesTest: variablesTest,
    functionsTodo: parseFunctions(data.functions ?? {}),
    rulesets: { ...(data.rulesets ?? {}) },
    enabledConstants: parseBuiltinConstants(data.builtin_constants),
    customConstants: (data.constants ?? []).slice(),
    parts: (data.parts ?? []).slice(),
  };
}

// question.js:564-582
/** Traduce il dizionario `functions` nella forma che vuole `makeFunctions`. */
function parseFunctions(functions: NonNullable<NumbasQuestionJSON["functions"]>): FunctionDef[] {
  return Object.keys(functions).map((name) => {
    const fd = functions[name] as NonNullable<(typeof functions)[string]>;
    // upstream: una funzione JavaScript con `type: "promise"` ritorna un
    // `TPromise` che `makeVariablesPromise` attende (jme-variables.js:308-312) —
    // è il motivo per cui tutta la generazione delle variabili è `async`.
    // Decisione 4 del brief: qui il motore è sincrono, quindi si rifiuta al
    // caricamento invece di dare risultati diversi dall'oracolo.
    // Vedi DIVERGENCES.md.
    if (fd.language === "javascript" && fd.type === "promise") {
      throw new JmeError("question.function.async not supported", { name: name });
    }
    return {
      name: name,
      definition: fd.definition,
      language: fd.language,
      outtype: fd.type,
      type: fd.type,
      parameters: (fd.parameters ?? []).map((p) => ({ name: p[0], type: p[1] })),
    };
  });
}

// question.js:551-560, 789-796
/** Il dizionario `nome → abilitata` delle costanti builtin. */
function parseBuiltinConstants(builtin_constants: NumbasQuestionJSON["builtin_constants"]): Record<string, boolean> {
  const enabled: Record<string, boolean> = {};
  for (const [names, enable] of Object.entries(builtin_constants ?? {})) {
    names.split(",").forEach((name) => {
      enabled[name] = enable;
    });
  }
  return enabled;
}

// question.js:86 (scope della domanda), 789-808 (costanti, funzioni, ruleset)
/** Costruisce lo scope della domanda a partire da `builtinScope`: prima le
 * costanti, poi le funzioni, poi i ruleset — l'ordine del sorgente upstream.
 *
 * `question` è il riferimento opaco che `Scope.question` porta con sé: serve
 * alla correzione adattiva (`mark_part`/`submit_part` risolvono i percorsi
 * delle parti attraverso di esso). */
export function buildQuestionScope(parsed: ParsedQuestion, opts: LoadOptions, question: unknown): Scope {
  // upstream: `new jme.Scope(gscope)` con `gscope = Numbas.jme.builtinScope`
  // (question.js:85-86). Il generatore casuale seminato e la lingua sono le
  // due aggiunte del port: upstream la casualità viene da `Math.random` e la
  // lingua da `Numbas.locale`, entrambe globali. Qui viaggiano sullo scope, e
  // quello della domanda è l'unico punto in cui vengono fissate: ogni scope
  // figlio (parti, script di correzione, lambda) le eredita.
  // Vedi DIVERGENCES.md.
  const extras: ScopeExtras = { rng: makeRng(opts.seed), locale: opts.locale ?? getLocale() };
  if (opts.numberStyle !== undefined) {
    extras.numberStyle = opts.numberStyle;
  }
  let scope = new Scope([builtinScope, extras]);
  scope.question = question;

  makeConstants(builtinConstants, scope, parsed.enabledConstants);
  makeConstants(parsed.customConstants, scope);

  const functions = makeFunctions(parsed.functionsTodo, scope, { question: question }, {
    allowJavascript: opts.allowJavascriptFunctions ?? true,
  });
  scope = new Scope([scope, { functions: functions }]);

  makeRulesets(parsed.rulesets, scope);
  return scope;
}
