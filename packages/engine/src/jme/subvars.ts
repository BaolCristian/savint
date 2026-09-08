/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme.js:399-594 — sostituzione di variabili dentro le stringhe:
// `contentsubvars`, `texsplit`, `typeToDisplayString`, `tokenToDisplayString`,
// `subvars`.
//
// Upstream questi rami chiamano direttamente `jme.display.*`, che è caricato
// dopo `jme-base`: una dipendenza in avanti che funziona solo perché a runtime
// tutto è già stato eseguito. Qui passano da `displayHooks`, riempiti dal
// modulo di visualizzazione (Task 5); se il modulo non c'è, i rami che ne
// hanno bisogno lanciano `jme.subvars.display not available`.

import * as math from "../math";
import { JmeError } from "./errors";
import { errorMessageIn } from "../errors";
import type { Scope } from "./scope";
// import di solo tipo: nessun ciclo a runtime
import type { Ruleset, RulesetSpec } from "./rules-ruleset";
import type { Token, Tree } from "./tokens";
import { isType } from "./evaluate";
import { escape } from "./util";

/** I ganci verso il modulo di visualizzazione (jme/display.ts, Task 5). */
export const displayHooks: {
  /** Riscrive un albero come espressione JME. */
  treeToJME?: (tree: Tree, settings: unknown, scope: Scope) => string;
  /** Rende un albero in LaTeX. */
  texify?: (tree: Tree, settings: unknown, scope: Scope) => string;
  /** Compila un'espressione e la rende in LaTeX. */
  exprToLaTeX?: (expr: string, ruleset: unknown, scope: Scope) => string;
  /** Sostituisce le variabili in una stringa con semantica JME. */
  subvars?: (str: string, scope: Scope) => Tree;
  /** Raccoglie un ruleset a partire da una descrizione (jme/rules.ts). */
  collectRuleset?: (set: RulesetSpec, scopeSets: Record<string, Ruleset>) => Ruleset;
} = {};

/** Il gancio richiesto, o un errore se il modulo di visualizzazione manca. */
function requireHook<K extends keyof typeof displayHooks>(name: K): NonNullable<(typeof displayHooks)[K]> {
  const hook = displayHooks[name];
  if (!hook) {
    throw new JmeError("jme.subvars.display not available", { op: name });
  }
  return hook as NonNullable<(typeof displayHooks)[K]>;
}

// jme.js:443-494 — upstream `cmdre` è `/^((?:.|[\n\r])*?)\\(var|simplify)/m`,
// che riconosce `\var`/`\simplify` come prefisso letterale: `\varphi`,
// `\varepsilon`, `\vartheta`, `\varsigma`, `\varrho`, `\varpi` (notazione
// trigonometrica ordinaria) cominciano con quelle quattro lettere e vengono
// scambiati per un `\var` a cui manca l'argomento — verificato che upstream
// fa lo stesso (`packages/engine/oracle`, commit 0f0ea33). Divergenza voluta,
// registrata in DIVERGENCES.md: il lookahead negativo `(?![a-zA-Z])` esclude
// solo il caso in cui il nome del comando prosegue in altre lettere; uno
// spazio (o qualunque carattere non alfabetico) fra `\var` e la sua graffa
// resta un errore, come upstream (`s.charAt(i) !== "{"` qui sotto non cambia).
/** Spezza un'espressione TeX sui comandi `\var` e `\simplify`, restituendo
 * `[tex, comando, opzioni, argomento, tex, ...]`. */
export function texsplit(s: string): string[] {
  const cmdre = /^((?:.|[\n\r])*?)\\(var|simplify)(?![a-zA-Z])/m;
  const out: string[] = [];
  let m = s.match(cmdre);
  while (m) {
    out.push(m[1] as string);
    const cmd = m[2] as string;
    out.push(cmd);
    let i = (m[0] as string).length;
    let args = "";
    let argbrackets = false;
    if (s.charAt(i) === "[") {
      argbrackets = true;
      const si = i + 1;
      while (i < s.length && s.charAt(i) !== "]") {
        i++;
      }
      if (i === s.length) {
        throw new JmeError("jme.texsubvars.no right bracket", { op: cmd });
      } else {
        args = s.slice(si, i);
        i++;
      }
    }
    if (!argbrackets) {
      args = "all";
    }
    out.push(args);
    if (s.charAt(i) !== "{") {
      throw new JmeError("jme.texsubvars.missing parameter", { op: cmd, parameter: s });
    }
    let brackets = 1;
    const si = i + 1;
    while (i < s.length - 1 && brackets > 0) {
      i++;
      if (s.charAt(i) === "{") {
        brackets++;
      } else if (s.charAt(i) === "}") {
        brackets--;
      }
    }
    if (i === s.length - 1 && brackets > 0) {
      throw new JmeError("jme.texsubvars.no right brace", { op: cmd });
    }
    const expr = s.slice(si, i);
    s = s.slice(i + 1);
    out.push(expr);

    m = s.match(cmdre);
  }
  out.push(s);
  return out;
}

// jme.js:496-529 — upstream ha anche i rami `number` e `decimal`, che
// costruiscono un `JMEifier`: qui quei tipi passano dal gancio `treeToJME`
// (vedi `tokenToDisplayString`), e il ramo `html` non tocca il DOM perché il
// valore di `THTML` è già la sorgente HTML.
/** Come rendere un token come stringa, per tipo. */
export const typeToDisplayString: Record<string, (v: Token, scope?: Scope) => string> = {
  integer(v) {
    return (v as { bigValue: bigint }).bigValue.toString();
  },
  rational(v) {
    const f = (v as { value: math.Fraction }).value.reduced();
    return f.toString();
  },
  string(v) {
    return (v as { value: string }).value;
  },
  html(v) {
    return (v as { value: string }).value;
  },
};

// jme.js:537-543
/** Rende un token come stringa, per la visualizzazione. */
export function tokenToDisplayString(v: Token, scope: Scope): string {
  const f = typeToDisplayString[v.type];
  if (f) {
    return f(v, scope);
  }
  return requireHook("treeToJME")({ tok: v }, {}, scope);
}

// jme.js:553-588
/** Sostituisce nelle graffe di `str` il valore delle espressioni JME che
 * contengono.
 *
 * Con `display` attivo i valori sono resi per la lettura (niente parentesi né
 * apici superflui); altrimenti sono resi come codice JME. */
export function subvars(str: string, scope: Scope, display?: boolean): string {
  const bits = math.splitbrackets(str, "{", "}", "(", ")");
  if (bits.length === 1) {
    return str;
  }
  let out = "";
  for (let i = 0; i < bits.length; i++) {
    if (i % 2) {
      let tree: Tree | null;
      try {
        tree = scope.parser.compile(bits[i] as string);
      } catch (e) {
        throw new JmeError(
          "jme.subvars.error compiling",
          { message: errorMessageIn(e, scope.locale), expression: bits[i] as string },
          e,
        );
      }
      const v = scope.evaluate(tree as Tree);
      if (v === null || v === undefined) {
        throw new JmeError("jme.subvars.null substitution", { str: str });
      }
      let ov: string;
      if (display) {
        ov = tokenToDisplayString(v, scope);
      } else {
        if (isType(v, "number")) {
          ov =
            "(" +
            requireHook("treeToJME")({ tok: v }, { nicenumber: false, noscientificnumbers: true }, scope) +
            ")";
        } else if (v.type === "string") {
          ov = "'" + escape(v.value) + "'";
        } else {
          ov = requireHook("treeToJME")({ tok: v }, { nicenumber: false, noscientificnumbers: true }, scope);
        }
      }
      out += ov;
    } else {
      out += bits[i];
    }
  }
  return out;
}

// jme.js:406-435
/** Sostituisce le variabili in un blocco di testo, tenendo separate le parti
 * matematiche delimitate da `$...$` o `\[...\]`. */
export function contentsubvars(str: string, scope: Scope, sub_tex?: boolean): string {
  // spezza la stringa sui delimitatori TeX: "let $X$ = \[expr\]" diventa
  // ['let ','$','X','$',' = ','\[','expr','\]',''].
  const bits = math.contentsplitbrackets(str);
  for (let i = 0; i < bits.length; i += 4) {
    bits[i] = subvars(bits[i] as string, scope, true);
    if (sub_tex && i + 3 < bits.length) {
      const tbits = texsplit(bits[i + 2] as string);
      let out = "";
      for (let j = 0; j < tbits.length; j += 4) {
        out += tbits[j];
        if (j + 3 < tbits.length) {
          const cmd = tbits[j + 1];
          const rules = requireHook("collectRuleset")(tbits[j + 2] as string, scope.allRulesets());
          let expr = tbits[j + 3] as string;
          switch (cmd) {
            case "var": {
              const v = scope.evaluate(expr);
              if (v === null) {
                throw new JmeError("jme.subvars.null substitution", { str: expr });
              }
              const tex = requireHook("texify")({ tok: v }, rules, scope);
              out += "{" + tex + "}";
              break;
            }
            case "simplify": {
              expr = subvars(expr, scope);
              out += "{" + requireHook("exprToLaTeX")(expr, rules, scope) + "}";
              break;
            }
          }
        }
      }
      bits[i + 2] = out;
    }
  }
  return bits.join("");
}
