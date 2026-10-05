/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-builtins.js:1916-2210 — temi `number_parsing` (1916-2152),
// `precision` (2155-2192) e `json` (2195-2210), uniti in un solo modulo come
// da §9 dell'inventario.
//
// `scientificnumberhtml` upstream costruisce un nodo DOM (`document.createElement`):
// qui produce la stessa stringa HTML, perché nel port `THTML` è una stringa
// opaca (decisione 2 del brief del Task 4a). Vedi DIVERGENCES.md.

import * as math from "../../math";
import type { Scope } from "../scope";
import {
  TBool,
  TDecimal,
  THTML,
  TInt,
  TList,
  TNum,
  TRational,
  TString,
  type Token,
  type Tree,
} from "../tokens";
import { castToType, isType, unwrapValue, wrapValue } from "../evaluate";
import { JmeError } from "../errors";
import { add, int_options, pushLazy, sig } from "./registry";

/** Alias locale. */
const Decimal = math.Decimal;

/** Un token numerico che può portare l'informazione di precisione. */
type WithPrecision = { precisionType?: "dp" | "sigfig" | undefined; precision?: number | undefined };

/** Il risultato di `dpformat`/`sigformat` su un numero. Upstream lo segna
 * come LaTeX (`latex: true`), e in una formula entra così com'è. Con lo stile
 * della domanda (SAVINT, `Scope.numberStyle`) la stringa può contenere una
 * virgola, che in modalità matematica KaTeX spazia come una punteggiatura
 * («0, 765»): allora NON la si segna come LaTeX, e una formula la mostra come
 * testo, con la virgola al suo posto. Senza stile, il comportamento upstream. */
function stringaNumerica(testo: string, s: Scope): TString {
  const t = new TString(testo);
  if (s.numberStyle === undefined) {
    t.latex = true;
  }
  return t;
}

/** `dpformat`/`sigformat` su un decimale esatto: upstream `toFixed`/
 * `toPrecision`, cioè sempre il punto. Con lo stile della domanda il numero
 * reale si riscrive in quello stile (vedi `stringaNumerica`). */
function stileDecimale(testo: string, a: math.ComplexDecimal, s: Scope): TString {
  if (s.numberStyle === undefined || !a.isReal()) {
    return new TString(testo);
  }
  return new TString(math.formatNumberNotation(testo, s.numberStyle));
}

// jme-builtins.js:1917-1990
/** `dpformat`, `sigformat`, `formatnumber`, `string`, `parsenumber`,
 * `with_precision`, `imprecise`. */
export function registerNumberFormatting(scope: Scope): void {
  // SAVINT: senza uno stile esplicito, `dpformat` e `sigformat` usano lo
  // stile dei numeri mostrati della domanda (`Scope.numberStyle`), così un
  // importo nel testo esce «41,20» e non «41.20». Vedi DIVERGENCES.md, «Stile
  // dei numeri mostrati». Uno stile scritto dall'autore vince sempre.
  add(scope, "dpformat", [TNum, TNum], TString, null, {
    evaluate: (args, s) => {
      const [n, p] = (args as Token[]).map((a) => unwrapValue(a)) as [math.NumbasNumber, number];
      return stringaNumerica(math.niceNumber(n, { precisionType: "dp", precision: p, style: s.numberStyle }), s);
    },
  });
  add(
    scope,
    "dpformat",
    [TNum, TNum, TString],
    TString,
    (n: math.NumbasNumber, p: number, style: string) =>
      math.niceNumber(n, { precisionType: "dp", precision: p, style: style }),
    { latex: true },
  );
  add(scope, "dpformat", [TDecimal, TNum], TString, null, {
    evaluate: (args, s) => {
      const [a, dp] = (args as Token[]).map((x) => unwrapValue(x)) as [math.ComplexDecimal, number];
      return stileDecimale(a.toFixed(dp), a, s);
    },
  });
  add(scope, "sigformat", [TNum, TNum], TString, null, {
    evaluate: (args, s) => {
      const [n, p] = (args as Token[]).map((a) => unwrapValue(a)) as [math.NumbasNumber, number];
      return stringaNumerica(math.niceNumber(n, { precisionType: "sigfig", precision: p, style: s.numberStyle }), s);
    },
  });
  add(
    scope,
    "sigformat",
    [TNum, TNum, TString],
    TString,
    (n: math.NumbasNumber, p: number, style: string) =>
      math.niceNumber(n, { precisionType: "sigfig", precision: p, style: style }),
    { latex: true },
  );
  add(scope, "sigformat", [TDecimal, TNum], TString, null, {
    evaluate: (args, s) => {
      const [a, sf] = (args as Token[]).map((x) => unwrapValue(x)) as [math.ComplexDecimal, number];
      return stileDecimale(a.toPrecision(sf), a, s);
    },
  });
  add(scope, "formatnumber", [TDecimal, TString], TString, (n: math.ComplexDecimal, style: string) =>
    math.niceComplexDecimal(n, { style: style }),
  );
  add(scope, "formatnumber", [TNum, TString], TString, (n: math.NumbasNumber, style: string) =>
    math.niceNumber(n, { style: style }),
  );
  add(scope, "string", [TNum], TString, math.niceNumber);
  add(scope, "parsenumber", [TString, TString], TNum, (s: string, style: string) =>
    math.parseNumber(s, false, style, true),
  );
  add(
    scope,
    "parsenumber",
    [TString, sig.listof(sig.type("string"))],
    TNum,
    (s: string, styles: string[]) => math.parseNumber(s, false, styles, true),
    { unwrapValues: true },
  );
  add(scope, "parsenumber_or_fraction", [TString], TNum, (s: string) => math.parseNumber(s, true, "plain-en", true));
  add(scope, "parsenumber_or_fraction", [TString, TString], TNum, (s: string, style: string) =>
    math.parseNumber(s, true, style, true),
  );
  add(
    scope,
    "parsenumber_or_fraction",
    [TString, sig.listof(sig.type("string"))],
    TNum,
    (s: string, styles: string[]) => math.parseNumber(s, true, styles, true),
    { unwrapValues: true },
  );

  // 1958-1989 — `evaluate` custom (non pigro): MUTA il token in ingresso,
  // come upstream.
  add(scope, "with_precision", [TNum, "nothing or number", "nothing or string"], TNum, null, {
    evaluate: (args) => {
      const a = args as Token[];
      const n = a[0] as TNum;
      const precision = a[1] as Token;
      const precisionType = a[2] as Token;

      if (isType(precision, "nothing")) {
        delete n.precision;
      } else {
        n.precision = (precision as { value: number }).value;
      }

      if (isType(precisionType, "nothing")) {
        delete n.precisionType;
      } else {
        n.precisionType = (precisionType as { value: "dp" | "sigfig" }).value;
      }

      return n;
    },
  });

  add(scope, "imprecise", [TNum], TNum, null, {
    evaluate: (args) => {
      const n = (args as Token[])[0] as TNum;
      delete n.precision;
      delete n.precisionType;
      return n;
    },
  });
}

// jme-builtins.js:1991-2152
/** `parsedecimal`, le conversioni di base, `scientificnumber*`, `decimal`. */
export function registerNumberConversion(scope: Scope): void {
  add(scope, "parsedecimal", [TString, TString], TDecimal, (s: string, style: string) =>
    math.parseDecimal(s, false, style, true),
  );
  add(
    scope,
    "parsedecimal",
    [TString, sig.listof(sig.type("string"))],
    TDecimal,
    (s: string, styles: string[]) => math.parseDecimal(s, false, styles, true),
    { unwrapValues: true },
  );
  add(scope, "parsedecimal_or_fraction", [TString], TDecimal, (s: string) =>
    math.parseDecimal(s, true, "plain-en", true),
  );
  add(scope, "parsedecimal_or_fraction", [TString, TString], TDecimal, (s: string, style: string) =>
    math.parseDecimal(s, true, style, true),
  );
  add(
    scope,
    "parsedecimal_or_fraction",
    [TString, sig.listof(sig.type("string"))],
    TDecimal,
    (s: string, styles: string[]) => math.parseDecimal(s, true, styles, true),
    { unwrapValues: true },
  );

  // 2007-2018
  add(scope, "tobinary", [TInt], TString, (n: bigint) => n.toString(2), { latex: true, ...int_options });
  add(scope, "tooctal", [TInt], TString, (n: bigint) => n.toString(8), { latex: true, ...int_options });
  add(scope, "tohexadecimal", [TInt], TString, (n: bigint) => n.toString(16), { latex: true, ...int_options });
  add(scope, "tobase", [TInt, TInt], TString, (n: bigint, b: bigint) => n.toString(Number(b)), {
    latex: true,
    ...int_options,
  });

  // 2019-2031
  add(scope, "frombinary", [TString], TInt, (s: string) => math.parseInt(s, 2));
  add(scope, "fromoctal", [TString], TInt, (s: string) => math.parseInt(s, 8));
  add(scope, "fromhexadecimal", [TString], TInt, (s: string) => math.parseInt(s, 16));
  add(scope, "frombase", [TString, TInt], TInt, (s: string, b: number) => math.parseInt(s, b));

  // 2032-2056
  add(scope, "scientificnumberlatex", [TNum], TString, null, {
    evaluate: (args) => {
      let n = ((args as Token[])[0] as TNum).value;
      if (math.isComplex(n)) {
        n = n.re;
      }
      const bits = math.parseScientific(math.niceRealNumber(n, { style: "scientific", scientificStyle: "plain" })) as {
        significand: number;
        exponent: number;
      };
      const s = new TString(
        math.niceRealNumber(bits.significand, { syntax: "latex" }) + " \\times 10^{" + bits.exponent + "}",
      );
      s.latex = true;
      s.safe = true;
      s.display_latex = true;
      return s;
    },
  });
  add(scope, "scientificnumberlatex", [TDecimal], TString, null, {
    evaluate: (args) => {
      const n = ((args as Token[])[0] as TDecimal).value;
      const bits = math.parseScientific(n.re.toExponential()) as { significand: number; exponent: number };
      const s = new TString(math.niceRealNumber(bits.significand) + " \\times 10^{" + bits.exponent + "}");
      s.latex = true;
      s.safe = true;
      s.display_latex = true;
      return s;
    },
  });

  // 2057-2073 — upstream costruisce un `<span data-interactive="false">` nel
  // DOM: qui la stessa marcatura come stringa.
  add(scope, "scientificnumberhtml", [TDecimal], THTML, (n: math.ComplexDecimal) => {
    const bits = math.parseScientific(n.re.toExponential()) as { significand: number; exponent: number };
    // upstream ritorna l'elemento `<span>`, che `FuncObj` avvolge poi in un
    // `THTML`: qui il valore grezzo è la sorgente HTML, non il token.
    return (
      '<span data-interactive="false">' +
      math.niceRealNumber(bits.significand) +
      " × 10<sup>" +
      bits.exponent +
      "</sup></span>"
    );
  });
  add(scope, "scientificnumberhtml", [TNum], THTML, (n: math.NumbasNumber) => {
    if (math.isComplex(n)) {
      n = n.re;
    }
    const bits = math.parseScientific(math.niceRealNumber(n, { style: "scientific", scientificStyle: "plain" })) as {
      significand: number;
      exponent: number;
    };
    return (
      '<span data-interactive="false">' +
      math.niceRealNumber(bits.significand) +
      " × 10<sup>" +
      bits.exponent +
      "</sup></span>"
    );
  });

  // 2074-2084
  add(
    scope,
    "matchnumber",
    [TString, sig.listof(sig.type("string"))],
    TList,
    (s: string, styles: string[]) => {
      const result = math.matchNotationStyle(s, styles, true);
      return [new TString(result.matched), new TNum(math.parseNumber(result.cleaned, false, ["plain"], true))];
    },
    { unwrapValues: true },
  );
  add(scope, "cleannumber", [TString, sig.optional(sig.listof(sig.type("string")))], TString, math.cleanNumber, {
    unwrapValues: true,
  });
  add(scope, "isbool", [TString], TBool, math.isBool);
  add(scope, "string", [TInt], TString, math.niceNumber, int_options);
  add(scope, "string", [TRational], TString, (a: math.Fraction) => a.toString());
  add(scope, "string", [TDecimal], TString, math.niceComplexDecimal);

  // 2085-2137 — `decimal` è PIGRA: sostituisce nell'ALBERO ogni token
  // `number` con il `decimal` equivalente, poi valuta.
  add(scope, "decimal", [TNum], TDecimal, null, {
    evaluate: (args, s) => {
      if (args.length !== 1) {
        throw new JmeError("jme.typecheck.no right type definition", { op: "decimal" });
      }
      /** Sostituisce ogni token `number` dell'albero col `decimal` equivalente.
       * upstream costruisce anche un `ntree` che poi non usa mai: l'effetto
       * reale è la mutazione in place di `tree.tok`. */
      function replace_number(tree: Tree): Tree {
        if (tree.args) {
          tree.args.map(replace_number);
        }
        let tok: Token;
        switch (tree.tok.type) {
          case "number": {
            const n = tree.tok;
            const d =
              typeof n.originalValue == "string"
                ? new math.ComplexDecimal(new Decimal(n.originalValue))
                : (math.numberToDecimal(n.value) as math.ComplexDecimal);
            const t = new TDecimal(d);
            (t as WithPrecision).precisionType = n.precisionType;
            (t as WithPrecision).precision = n.precision;
            tok = t;
            break;
          }
          default:
            tok = tree.tok;
        }
        tree.tok = tok;
        return tree;
      }
      const tree = replace_number((args as Tree[])[0] as Tree);
      const arg = s.evaluate(tree) as Token;
      if (isType(arg, "decimal")) {
        return castToType(arg, "decimal");
      } else if (isType(arg, "number")) {
        const n = castToType(arg, "number") as TNum;
        const d = math.numberToDecimal(n.value) as math.ComplexDecimal;
        const t = new TDecimal(d);
        (t as WithPrecision).precisionType = n.precisionType;
        (t as WithPrecision).precision = n.precision;
        return t;
      } else if (isType(arg, "string")) {
        const str = (castToType(arg, "string") as TString).value;
        const d = new Decimal(str);
        const t = new TDecimal(d);
        (t as WithPrecision).precisionType = "dp";
        (t as WithPrecision).precision = math.countDP(str);
        return t;
      }
      // upstream: nessun `return` in coda — la funzione restituisce
      // `undefined`, che il valutatore poi usa come token.
      return arg;
    },
  });
  pushLazy("decimal");
  add(scope, "decimal", [TRational], TDecimal, null, {
    evaluate: (args) => {
      const n = (args as Token[])[0] as { value: math.Fraction };
      return new TDecimal(new Decimal(String(n.value.numerator)).dividedBy(new Decimal(String(n.value.denominator))));
    },
  });
  add(
    scope,
    "decimal",
    [TString],
    TDecimal,
    (x: string) => {
      const d = new Decimal(x);
      const t = new TDecimal(d);
      (t as WithPrecision).precisionType = "dp";
      (t as WithPrecision).precision = math.countDP(x);
      return t;
    },
    { unwrapValues: true },
  );
}

// jme-builtins.js:2155-2192
/** Tema `precision`. */
export function registerPrecision(scope: Scope): void {
  add(scope, "togivenprecision", [TString, TString, TNum, TBool], TBool, math.toGivenPrecision);
  add(scope, "togivenprecision_scientific", [TString, TString, TNum], TBool, math.toGivenPrecisionScientific);
  add(scope, "withintolerance", [TNum, TNum, TNum], TBool, math.withinTolerance);
  add(scope, "countdp", [TString], TNum, (s: string) => math.countDP(math.cleanNumber(s)));
  // upstream: `a.decimalPlaces()` su una `ComplexDecimal`, che non ha quel
  // metodo (lo ha `Decimal`): la firma upstream lancia un TypeError. Qui si
  // conta sulla parte reale — vedi DIVERGENCES.md.
  add(scope, "countdp", [TDecimal], TInt, (a: math.ComplexDecimal) => a.re.decimalPlaces());
  add(scope, "countsigfigs", [TString], TNum, (s: string) => math.countSigFigs(math.cleanNumber(s)));

  add(scope, "isint", [TDecimal], TBool, (a: math.ComplexDecimal) => a.isInt());
  add(scope, "isint", [TNum], TBool, (a: math.NumbasNumber) => math.isInt(a));

  add(scope, "isnan", [TDecimal], TBool, (a: math.ComplexDecimal) => a.isNaN());
  add(scope, "iszero", [TDecimal], TBool, (a: math.ComplexDecimal) => a.isZero());
  add(scope, "isnan", [TNum], TBool, (n: math.NumbasNumber) => {
    if (math.isComplex(n)) {
      return isNaN(n.re) || isNaN(n.im);
    }
    return isNaN(n as number);
  });
  // upstream: `a.re.countSigFigs()`, metodo che `Decimal` non ha — stesso
  // caso di `countdp` sopra.
  add(scope, "countsigfigs", [TDecimal], TInt, (a: math.ComplexDecimal) => math.countSigFigs(a.re.toString()));
}

// jme-builtins.js:2195-2210
/** Tema `json`. */
export function registerJson(scope: Scope): void {
  add(scope, "json_decode", [TString], "?", null, {
    evaluate: (args) => {
      const data: unknown = JSON.parse(((args as Token[])[0] as TString).value);
      return wrapValue(data, "dict");
    },
  });
  add(scope, "json_encode", ["?"], TString, null, {
    evaluate: (args) => {
      const s = new TString(JSON.stringify(unwrapValue((args as Token[])[0] as Token)));
      s.safe = true;
      return s;
    },
  });
}
