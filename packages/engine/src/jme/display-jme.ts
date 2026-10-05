/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-display.js:1650-1996 (i dizionari `typeToJME`, `jmeFunctions`,
// `opBrackets`, `jmeOpSymbols` e la funzione `treeToJME`) e 1998-2333 (la
// classe `JMEifier`).
//
// L'euristica della moltiplicazione implicita di `typeToJME.op` (1821-1840)
// resta separata da quella di `texOps['*']` (300-341): sono due euristiche
// diverse, non una sola condivisa (inventario §9).
//
// `registerType` (1891-1911) non si porta: il dizionario è statico e completo.

import * as math from "../math";
import {
  conjugate,
  hasRealPart,
  isComplex as isComplexTok,
  isNegative,
  isOp,
  isType,
  negated,
} from "./evaluate";
import { eq as eqTokens } from "./equality";
import { JmeError } from "./errors";
import type { Scope } from "./scope";
import { displayHooks, typeToDisplayString } from "./subvars";
import { TKeyPair, type Token, type Tree, type TFunc, type TOp } from "./tokens";
import { escape } from "./util";
import {
  flatten,
  number_options,
  string_options,
  type DisplayNumberOptions,
  type StringOptions,
} from "./display-tex";
import {
  Displayer,
  NICE_NUMBER_MAX_LENGTH,
  eqMaybeUntyped,
  type DisplaySettingsArg,
} from "./display-texifier";

/** Una voce di `typeToJME`: riceve l'albero, il token in cima e il JME già
 * reso dei suoi argomenti (assente per i token senza figli). */
export type TypeToJmeFn = (this: JMEifier, tree: Tree, tok: Token, bits?: string[]) => string;

// jme-display.js:1650-1889
/** Come rendere in JME ciascun tipo di token. */
export const typeToJME: Record<string, TypeToJmeFn> = {
  nothing: function () {
    return "nothing";
  },
  integer: function (tree, tok) {
    return math.niceNumber((tok as { bigValue: bigint }).bigValue, number_options(tok));
  },
  rational: function (tree, tok) {
    const value = (tok as { value: math.Fraction }).value.reduced();
    const options = number_options(tok);
    const numerator = this.number(value.numerator, options);
    if (value.denominator === 1) {
      return numerator;
    } else {
      return numerator + "/" + this.number(value.denominator, options);
    }
  },
  decimal: function (tree, tok) {
    return this.decimal((tok as { value: math.ComplexDecimal }).value, number_options(tok));
  },
  number: function (tree, tok) {
    return this.number((tok as { value: math.NumbasNumber }).value, number_options(tok));
  },
  name: function (tree, tok) {
    return (tok as { name: string }).name;
  },
  string: function (tree, tok) {
    return this.string((tok as { value: string }).value, string_options(tok));
  },
  // upstream legge `tok.html`, l'elemento del DOM serializzato; qui il token
  // conserva già la sorgente HTML (vedi DIVERGENCES.md).
  html: function (tree, tok) {
    const html = (tok as { value: string }).value.replace(/"/g, '\\"');
    return 'html(safe("' + html + '"))';
  },
  boolean: function (tree, tok) {
    return (tok as { value: boolean }).value ? "true" : "false";
  },
  range: function (tree, tok) {
    const v = (tok as { value: math.Range }).value;
    return v[0] + ".." + v[1] + (v[2] === 1 ? "" : "#" + v[2]);
  },
  list: function (tree, tok, bits) {
    const t = tok as { value?: Token[] };
    if (!bits) {
      if (t.value) {
        bits = t.value.map((b) => this.render({ tok: b }));
      } else {
        bits = [];
      }
    }
    return "[ " + bits.join(", ") + " ]";
  },
  keypair: function (tree, tok, bits) {
    const key = (this.typeToJME["string"] as TypeToJmeFn).call(
      this,
      null as unknown as Tree,
      { value: (tok as { key: string }).key } as unknown as Token,
      [],
    );
    let arg = (bits as string[])[0] as string;
    if (((tree.args as Tree[])[0] as Tree).tok.type === "op") {
      arg = "( " + arg + " )";
    }
    return key + ": " + arg;
  },
  dict: function (tree, tok, bits) {
    const t = tok as { value?: Record<string, Token> };
    if (!bits) {
      bits = [];
      if (t.value) {
        for (const key in t.value) {
          bits.push(this.render({ tok: new TKeyPair(key), args: [{ tok: t.value[key] as Token }] }));
        }
      }
    }
    if (bits.length) {
      return "[ " + bits.join(", ") + " ]";
    } else {
      return "dict()";
    }
  },
  vector: function (tree, tok) {
    return (
      "vector(" +
      (tok as { value: math.NumbasNumber[] }).value.map((n) => this.number(n, number_options(tok))).join(",") +
      ")"
    );
  },
  matrix: function (tree, tok) {
    return (
      "matrix(" +
      (tok as { value: math.Matrix }).value
        .map((row) => "[" + row.map((n) => this.number(n, number_options(tok))).join(",") + "]")
        .join(",") +
      ")"
    );
  },
  function: function (tree, tok, bits) {
    const name = (tok as TFunc).name;
    const special = this.jmeFunctions[name];
    if (special) {
      return special.call(this, tree, tok, bits);
    }
    if (!bits) {
      return name + "()";
    } else {
      return name + "(" + bits.join(",") + ")";
    }
  },
  op: function (tree, tok, bits) {
    const op = (tok as TOp).name;
    const args = tree.args as Tree[];
    const jbits = bits as string[];
    const bracketed: boolean[] = [];
    for (let i = 0; i < args.length; i++) {
      const arg = (args[i] as Tree).tok;
      const isNumber = isType(arg, "number");
      const arg_type = arg.type;
      const arg_value = (arg as { value?: unknown }).value;
      let pd: number;
      let arg_op: string | null = null;
      if (arg_type === "op") {
        arg_op = (arg as TOp).name;
      } else if (isNumber) {
        if (isComplexTok(arg)) {
          const cv = arg_value as { re: unknown; im: unknown };
          if (!looseEqZero(cv.re)) {
            // addizione/sottrazione implicita: il numero sarà scritto `a+bi`
            arg_op = looseLtZero(cv.im) ? "-" : "+";
          } else if (i === 0 || !looseEqOne(cv.im)) {
            // moltiplicazione implicita: il numero sarà scritto `bi`
            arg_op = "*";
          }
        } else if (isNegative(arg)) {
          arg_op = "-u";
        } else if (
          (jbits[i] as string).indexOf("*") >= 0 ||
          (this.common_constants.pi &&
            (pd = math.piDegree(((args[i] as Tree).tok as { value: math.NumbasNumber }).value)) > 0 &&
            (arg_value as number) /
              (math.pow(Math.PI * this.common_constants.pi.scale, pd) as number) >
              1)
        ) {
          // moltiplicazione implicita: il numero sarà scritto `a*pi`
          arg_op = "*";
        } else if ((jbits[i] as string).indexOf("/") >= 0) {
          // divisione implicita: il numero sarà scritto `a/b`
          arg_op = "/";
        }
      }
      let bracketArg = false;
      if (arg_op !== null) {
        if ((isOp(arg, "-u") || isOp(arg, "+u")) && isComplexTok((((args[i] as Tree).args as Tree[])[0] as Tree).tok)) {
          arg_op = "+";
        }
        const j = i > 0 ? 1 : 0;
        const table = opBrackets[op];
        if (table) {
          const row = table[j] as Record<string, boolean>;
          bracketArg =
            row[arg_op] === true ||
            ((tok as TOp).prefix === true && row[arg_op] === undefined) ||
            (!(arg as TOp).postfix && !(arg as TOp).prefix && opBrackets[arg_op] === undefined);
        } else {
          bracketArg = (tok as TOp).prefix === true || (tok as TOp).postfix === true;
        }
      }
      bracketed[i] = bracketArg;
      if (bracketArg) {
        // upstream ammette anche una coppia di delimitatori diversa, che solo
        // le notazioni alternative impostano: qui `bracketed` è sempre un
        // booleano, quindi i delimitatori sono sempre le tonde.
        jbits[i] = "(" + jbits[i] + ")";
      }
    }
    let symbol: string;
    const opSymbol = this.jmeOpSymbols[op];
    if (opSymbol !== undefined) {
      symbol = opSymbol;
    } else if (args.length > 1 && op.length > 1) {
      symbol = " " + op + " ";
    } else {
      symbol = op;
    }
    switch (op) {
      case "-u":
        if (isComplexTok((args[0] as Tree).tok)) {
          return this.number(negated((args[0] as Tree).tok), number_options((args[0] as Tree).tok));
        }
        break;
      case "-":
        if (isComplexTok((args[1] as Tree).tok) && hasRealPart((args[1] as Tree).tok)) {
          jbits[1] = this.number(conjugate((args[1] as Tree).tok), number_options((args[1] as Tree).tok));
        }
        break;
      case "*": {
        // omette il simbolo di moltiplicazione quando non serve
        let s = jbits[0] as string;
        for (let i = 1; i < args.length; i++) {
          // un numero o una parentesi seguiti da un nome o da una parentesi
          // non hanno bisogno del simbolo — tranne <qualcosa>*(-<qualcosa>)
          let use_symbol = true;
          if (
            !this.settings.alwaystimes &&
            ((isType((args[i - 1] as Tree).tok, "number") && /\d$/.test(jbits[i - 1] as string)) ||
              bracketed[i - 1]) &&
            (isType((args[i] as Tree).tok, "name") ||
              (bracketed[i] &&
                !(isOp((args[i] as Tree).tok, "-u") || isOp((args[i] as Tree).tok, "+u"))))
          ) {
            use_symbol = false;
          }
          if (use_symbol) {
            s += symbol;
          }
          s += jbits[i];
        }
        return s;
      }
    }
    if (args.length === 1) {
      return (tok as TOp).postfix ? (jbits[0] as string) + symbol : symbol + jbits[0];
    } else {
      return (jbits[0] as string) + symbol + jbits[1];
    }
  },
  set: function (tree, tok) {
    return (
      "set(" +
      (tok as { value: Token[] }).value.map((t) => this.render({ tok: t })).join(",") +
      ")"
    );
  },
  interval: function (tree, tok) {
    const intervals = (tok as { value: { intervals: math.RealInterval[] } }).value.intervals.map((interval) => {
      return `interval(${this.number(interval.start)}, ${this.number(interval.end)}, ${
        interval.includes_start ? "true" : "false"
      }, ${interval.includes_end ? "true" : "false"})`;
    });

    if (intervals.length === 1) {
      return intervals[0] as string;
    } else {
      return `union(${intervals.join(", ")})`;
    }
  },
  expression: function (tree, tok) {
    let expr = this.render((tok as { tree: Tree }).tree);
    if (this.settings.wrapexpressions) {
      expr = 'expression("' + escape(expr) + '")';
    }
    return expr;
  },
  lambda: function (tree, tok, bits) {
    const t = tok as { names: Tree[]; expr: Tree };
    let names = t.names.map((name) => this.render(name)).join(", ");
    if (names.length !== 1) {
      names = "(" + names + ")";
    }
    const expr = this.render(t.expr);
    const fn = "(" + names + " -> " + expr + ")";
    if (bits) {
      return fn + "(" + bits.join(",") + ")";
    } else {
      return fn;
    }
  },
  scope: function () {
    return "scope()";
  },
};

// jme-display.js:1913-1930
/** Come rendere in JME le funzioni per cui la resa generica `f(...)` non va. */
export const jmeFunctions: Record<string, TypeToJmeFn> = {
  dict: typeToJME["dict"] as TypeToJmeFn,
  fact: function (tree, tok, bits) {
    const a0 = (tree.args as Tree[])[0] as Tree;
    if (isType(a0.tok, "number") || a0.tok.type === "name") {
      return (bits as string[])[0] + "!";
    } else {
      return "( " + (bits as string[])[0] + " )!";
    }
  },
  listval: function (tree, tok, bits) {
    return (bits as string[])[0] + "[" + (bits as string[])[1] + "]";
  },
};

// jme-display.js:1958-1979
/** Ciascun argomento di un'operazione ha bisogno delle parentesi?
 *
 * Un dizionario per posizione dell'argomento (sinistra/destra), che mappa
 * l'operatore del figlio a `true`/`false`; l'assenza vuol dire "usa
 * l'euristica generale". */
export const opBrackets: Record<string, Array<Record<string, boolean>>> = {
  "+u": [{ "+": true, "-": true, "*": false, "/": false }],
  "-u": [{ "+": true, "-": true, "*": false, "/": false }],
  "+": [{}, {}],
  "-": [{}, { "+": true, "-": true }],
  "*": [
    { "+u": true, "+": true, "-": true, "/": true },
    { "+u": true, "-u": true, "+": true, "-": true, "/": true },
  ],
  "/": [
    { "+u": true, "+": true, "-": true, "*": false },
    { "+u": true, "-u": true, "+": true, "-": true, "*": true, "/": true },
  ],
  "^": [
    { "+u": true, "-u": true, "+": true, "-": true, "*": true, "/": true, "^": true },
    { "+u": true, "-u": true, "+": true, "-": true, "*": true, "/": true },
  ],
  and: [
    { or: true, xor: true, nor: true },
    { or: true, xor: true, nor: true },
  ],
  not: [{ and: true, or: true, xor: true, nand: true, nor: true }],
  or: [{ xor: true }, { xor: true }],
  xor: [{}, {}],
  "=": [{}, {}],
};

// jme-display.js:1981-1996
/** Il simbolo JME degli operatori che non coincidono col proprio nome. */
export const jmeOpSymbols: Record<string, string> = {
  "+u": "+",
  "-u": "-",
  not: "not ",
  fact: "!",
  "+": " + ",
  "-": " - ",
};

/** `x == 0`, con la coercizione debole dell'upstream (i `Decimal` si
 * coercono a stringa). */
function looseEqZero(x: unknown): boolean {
  // upstream: coercizione debole voluta (i `Decimal` si coercono a stringa)
  return (x as number) == 0;
}

/** `x == 1`, con la coercizione debole dell'upstream. */
function looseEqOne(x: unknown): boolean {
  // upstream: coercizione debole voluta (i `Decimal` si coercono a stringa)
  return (x as number) == 1;
}

/** `x < 0`, con la coercizione debole dell'upstream. */
function looseLtZero(x: unknown): boolean {
  return (x as number) < 0;
}

/** Segnala che si è chiamato un metodo che il `JMEifier` non usa mai. */
function unreachableDecimal(name: string): never {
  throw new Error(`JMEifier.${name} non è raggiungibile: decimal() è sovrascritto`);
}

// jme-display.js:1998-2333
/** Converte un albero JME in una stringa di codice JME. */
export class JMEifier extends Displayer<string> {
  /** I dizionari condivisi, agganciati come upstream (2331-2333). */
  typeToJME: Record<string, TypeToJmeFn> = typeToJME;
  /** I simboli JME degli operatori. */
  jmeOpSymbols: Record<string, string> = jmeOpSymbols;
  /** Le rese speciali di alcune funzioni. */
  jmeFunctions: Record<string, TypeToJmeFn> = jmeFunctions;

  // jme-display.js:2007-2035
  override render(tree: Tree | Token | null | undefined): string {
    if (!tree) {
      return "";
    }
    let t = tree as Tree;

    if (isOp(t.tok, "*")) {
      // appiattisce le moltiplicazioni annidate, così una catena di prodotti
      // consecutivi si può considerare tutta insieme
      t = { tok: t.tok, args: flatten(t, "*") };
    }

    let bits: string[] | undefined;
    if (t.args !== undefined) {
      bits = t.args.map((i) => this.render(i));
    } else {
      const constant = this.constant(t);
      if (constant) {
        return constant;
      }
    }
    const tok = t.tok;
    const fn = this.typeToJME[tok.type];
    if (fn) {
      return fn.call(this, t, tok, bits);
    } else {
      throw new JmeError("jme.display.unknown token type", { type: tok.type });
    }
  }

  // jme-display.js:2037-2054
  /** Il nome della costante dello scope che vale quanto il token, se c'è. */
  constant(tree: Tree): string | undefined {
    let constantJME: string | undefined;
    const scope = this.scope;
    this.constants.find((c) => {
      if (c.value === null) {
        return false;
      }
      if (eqTokens(c.value, tree.tok, scope)) {
        constantJME = c.name;
        return true;
      }
      if (isType(tree.tok, "number") && isType(c.value, "number") && eqMaybeUntyped()) {
        constantJME = "-" + c.name;
        return true;
      }
      return false;
    });
    return constantJME;
  }

  // jme-display.js:2056-2071
  /** Il letterale JME di una stringa, con gli attributi che porta con sé. */
  string(s: string, options?: StringOptions): string {
    options = options || {};

    let str = '"' + escape(s) + '"';

    if (!this.settings.ignorestringattributes) {
      if (options.safe) {
        str = "safe(" + str + ")";
      }
      if (options.latex) {
        str = "latex(" + str + ")";
      }
    }

    return str;
  }

  // jme-display.js:2073-2111
  override complex_number(n: math.Complex, options: DisplayNumberOptions): string {
    let imaginary_unit = "sqrt(-1)";
    if (this.common_constants.imaginary_unit) {
      imaginary_unit = this.common_constants.imaginary_unit.name as string;
    }
    const opts: DisplayNumberOptions = { ...options, store_precision: false };
    const re = this.number(n.re, opts);
    let im = this.number(n.im, opts);
    im += (/\d$/.test(im) ? "" : "*") + imaginary_unit;
    if (Math.abs(n.im) < 1e-15) {
      return re;
    } else if (n.re === 0) {
      if (n.im === 1) {
        return imaginary_unit;
      } else if (n.im === -1) {
        return "-" + imaginary_unit;
      } else {
        return im;
      }
    } else if (n.im < 0) {
      if (n.im === -1) {
        return re + " - " + imaginary_unit;
      } else {
        return re + " - " + im.slice(1);
      }
    } else {
      if (n.im === 1) {
        return re + " + " + imaginary_unit;
      } else {
        return re + " + " + im;
      }
    }
  }

  // jme-display.js:2113-2134 — non confondere con `settings.nicenumber` né con
  // `math.niceNumber`: questo è l'involucro che inietta nello scope i simboli
  // locali di unità immaginaria, costante del cerchio e infinito.
  /** `math.niceNumber` con i simboli delle costanti dello scope. */
  niceNumber(n: math.NumbasNumber, options?: DisplayNumberOptions): string {
    const opts: DisplayNumberOptions = options || {};
    if (this.common_constants.imaginary_unit) {
      opts.imaginary = this.common_constants.imaginary_unit.name as string;
    }
    if (this.common_constants.pi) {
      opts.circle_constant = {
        scale: this.common_constants.pi.scale,
        symbol: this.common_constants.pi.constant.name as string,
      };
    }
    if (this.common_constants.infinity) {
      opts.infinity = this.common_constants.infinity.name as string;
    }
    return math.niceNumber(n, opts);
  }

  // jme-display.js:2136-2160
  /** `math.niceComplexDecimal` con i simboli delle costanti dello scope. */
  niceDecimal(n: math.ComplexDecimal, options?: DisplayNumberOptions): string {
    const opts: DisplayNumberOptions = options || {};
    if (this.common_constants.imaginary_unit) {
      opts.imaginary = this.common_constants.imaginary_unit.name as string;
    }
    if (this.common_constants.pi) {
      opts.circle_constant = {
        scale: this.common_constants.pi.scale,
        symbol: this.common_constants.pi.constant.name as string,
      };
    }
    if (this.common_constants.infinity) {
      opts.infinity = this.common_constants.infinity.name as string;
    }
    return math.niceComplexDecimal(n, opts);
  }

  // jme-display.js:2162-2208
  override rational_number(n: number, options: DisplayNumberOptions): string {
    let piD: number | undefined;
    if (isNaN(n)) {
      return "NaN";
    }
    const circle_constant_symbol = this.common_constants.pi && this.common_constants.pi.constant.name;
    if (this.common_constants.pi && (piD = math.piDegree(n)) > 0) {
      n /= Math.pow(Math.PI * this.common_constants.pi.scale, piD);
    }
    let out: string;
    if (this.settings.nicenumber === false) {
      out = n + "";
    } else {
      out = this.niceNumber(n, options);
    }
    if (out.length > NICE_NUMBER_MAX_LENGTH && !this.settings.noscientificnumbers) {
      const bits = math.parseScientific(n.toExponential(), false) as { significand: string; exponent: string };
      return bits.significand + "*10^(" + bits.exponent + ")";
    }
    const f = math.rationalApproximation(Math.abs(n), this.settings.accuracy);
    if (f[1] === 1) {
      out = Math.abs(f[0]).toString();
    } else {
      out = f[0] + "/" + f[1];
    }
    if (n < 0 && out !== "0") {
      out = "-" + out;
    }
    switch (piD) {
      case undefined:
      case 0:
        return out;
      case 1:
        return out + " " + circle_constant_symbol;
      default:
        return out + " " + circle_constant_symbol + "^" + piD;
    }
  }

  // jme-display.js:2210-2281
  override real_number(n: number, options: DisplayNumberOptions): string {
    let piD: number | undefined;
    if (isNaN(n)) {
      return "NaN";
    }
    options = options || {};
    if (this.common_constants.pi && (piD = math.piDegree(n, false)) > 0) {
      n /= Math.pow(Math.PI * this.common_constants.pi.scale, piD);
    }
    let out: string;
    if (this.settings.nicenumber === false) {
      out = n + "";
      if (/e/.test(out)) {
        out = math.unscientific(out);
      }
      const precision = options.precision === undefined ? "nothing" : options.precision;
      const precisionType = options.precisionType === undefined ? "nothing" : this.string(options.precisionType, {});
      const store_precision =
        options.store_precision === undefined ? this.settings.store_precision : options.store_precision;
      if (store_precision) {
        if (precision === "nothing" && precisionType === "nothing") {
          out = "imprecise(" + out + ")";
        } else {
          out = "with_precision(" + out + ", " + precision + ", " + precisionType + ")";
        }
        return out;
      }
    } else {
      // Il JME è codice: lo stile resta "plain" (il punto), tranne quando chi
      // chiama chiede esplicitamente testo da mostrare (`numberstyle`, vedi
      // `tokenToDisplayString` e DIVERGENCES.md, «Stile dei numeri mostrati»).
      out = this.niceNumber(n, { ...options, style: this.settings.numberstyle ?? "plain" });
    }
    if (Math.abs(n) < 1e-15) {
      if (this.settings.nicenumber === false) {
        return "0";
      } else {
        return this.niceNumber(0, options);
      }
    }
    if (out.length > NICE_NUMBER_MAX_LENGTH && !this.settings.noscientificnumbers) {
      const bits = math.parseScientific(n.toExponential(), false) as { significand: string; exponent: string };
      return bits.significand + "*10^(" + bits.exponent + ")";
    }
    const circle_constant_symbol = this.common_constants.pi && this.common_constants.pi.constant.name;
    switch (piD) {
      case undefined:
      case 0:
        return out;
      case 1:
        if (n === 1) {
          return circle_constant_symbol as string;
        } else if (n === -1) {
          return "-" + circle_constant_symbol;
        } else {
          return out + " " + circle_constant_symbol;
        }
      default:
        if (n === 1) {
          return circle_constant_symbol + "^" + piD;
        } else if (n === -1) {
          return "-" + circle_constant_symbol + "^" + piD;
        } else {
          return out + " " + circle_constant_symbol + "^" + piD;
        }
    }
  }

  // upstream (jme-display.js:1002-1029) lascia queste tre vuote sulla classe
  // base: il `JMEifier` sovrascrive `decimal()` per intero, quindi non le
  // raggiunge mai. Qui la base le dichiara astratte, e queste sono i tappi.
  /** Non raggiungibile: `decimal()` è sovrascritto. */
  override complex_decimal(): string {
    return unreachableDecimal("complex_decimal");
  }

  /** Non raggiungibile: `decimal()` è sovrascritto. */
  override rational_decimal(): string {
    return unreachableDecimal("rational_decimal");
  }

  /** Non raggiungibile: `decimal()` è sovrascritto. */
  override real_decimal(): string {
    return unreachableDecimal("real_decimal");
  }

  // jme-display.js:2283-2330
  override decimal(n: math.ComplexDecimal | math.Decimal | math.NumbasNumber, options?: DisplayNumberOptions): string {
    if (n instanceof math.ComplexDecimal) {
      const re = this.decimal(n.re, options);
      if (n.isReal()) {
        return re;
      }
      let imaginary_unit = "sqrt(-1)";
      if (this.common_constants.imaginary_unit) {
        imaginary_unit = this.common_constants.imaginary_unit.name as string;
      }
      const im = this.decimal(n.im, options) + "*" + imaginary_unit;
      if (n.re.isZero()) {
        if (n.im.eq(1)) {
          return imaginary_unit;
        } else if (n.im.eq(-1)) {
          return "-" + imaginary_unit;
        } else {
          return im;
        }
      } else if (n.im.lt(0)) {
        if (n.im.eq(-1)) {
          return re + " - " + imaginary_unit;
        } else {
          return re + " - " + im.replace(/^(dec\(")?-/, "$1");
        }
      } else {
        if (n.im.eq(1)) {
          return re + " + " + imaginary_unit;
        } else {
          return re + " + " + im;
        }
      }
    } else if (n instanceof math.Decimal) {
      let out = math.niceDecimal(n, { ...(this.settings.plaindecimal ? {} : options), style: "plain" });
      if (this.settings.plaindecimal) {
        return out;
      } else {
        if (out.length > NICE_NUMBER_MAX_LENGTH) {
          out = n.toExponential().replace(/e\+0$/, "");
        }
        return 'dec("' + out + '")';
      }
    } else {
      return this.number(n, options);
    }
  }
}

// jme-display.js:1944-1957
/** Rende un albero JME come stringa di codice JME. */
export function treeToJME(
  tree: Tree | Token | null | undefined,
  settings?: DisplaySettingsArg,
  scope?: Scope,
): string {
  const jmeifier = new JMEifier(settings, scope);
  return jmeifier.render(tree);
}

// jme.js:537-543 e jme-rules.js:2013 arrivano qui attraverso il gancio: il
// modulo di visualizzazione è caricato dopo `subvars.ts`.
displayHooks.treeToJME = treeToJME as (tree: Tree, settings: unknown, scope: Scope) => string;

// jme.js:501-515 — le due voci di `typeToDisplayString` che costruiscono un
// `JMEifier`. Upstream stanno nel dizionario di jme.js e risolvono
// `Numbas.jme.display.JMEifier` a tempo di chiamata (jme-display.js è
// caricato dopo); qui il dizionario vive in `subvars.ts`, che non può
// importare questo modulo (ciclo), quindi le due voci si registrano da qui.
//
// SAVINT: lo stile dei numeri mostrati della domanda (`Scope.numberStyle`),
// se il numero non ne porta già uno. Vedi DIVERGENCES.md, «Stile dei numeri
// mostrati».
function conStileMostrato(options: DisplayNumberOptions, scope?: Scope): DisplayNumberOptions {
  const stile = scope?.numberStyle;
  return stile === undefined || options.style !== undefined ? options : { ...options, style: stile };
}
typeToDisplayString["number"] = function (v, scope) {
  const jmeifier = new JMEifier({}, scope);
  return jmeifier.niceNumber((v as { value: math.NumbasNumber }).value, conStileMostrato(number_options(v), scope));
};
typeToDisplayString["decimal"] = function (v, scope) {
  const jmeifier = new JMEifier({}, scope);
  return jmeifier.niceDecimal((v as { value: math.ComplexDecimal }).value, conStileMostrato(number_options(v), scope));
};
