/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme-display.js:860-1046 (la classe base `JMEDisplayer`, qui
// `Displayer<TOut>`) e 1048-1648 (`Texifier` e `texify`), più le opzioni dei
// due renderer (`displayer_settings`/`jme_display_settings`, 860-876 e
// 1932-1942).
//
// Il file è separato da `display.ts` (l'API di alto livello) perché
// `display-jme.ts` ha bisogno della sola classe base: così il grafo degli
// import resta aciclico
// (`display-tex` → `display-texifier` → `display-jme` → `display`) e chi
// importa `display.ts` carica tutto il modulo di visualizzazione, ganci
// compresi. È la suddivisione prevista dalla risoluzione 6 del brief.
//
// Non portati (inventario §7): `align_text_blocks`/`tree_diagram`
// (2336-2471), gli alias di compatibilità verso `jme.rules` (2473-2479) e
// `registerType` (1891-1911) — i dizionari `typeToTeX`/`typeToJME` sono
// statici e completi.

import * as math from "../math";
import { builtinScope } from "./builtins";
import { castToType, isComplex as isComplexTok, isOp, isType, unwrapSubexpression } from "./evaluate";
import { eq as eqTokens } from "./equality";
import type { Ruleset } from "./rules-ruleset";
import { JmeError } from "./errors";
import type { ConstantDefinition, Scope } from "./scope";
import { commutative, normaliseName, precedence } from "./tokenizer";
import { TNum, type Token, type Tree, type TName, type TFunc, type TOp } from "./tokens";
import {
  flatten,
  LIST_SEPARATOR,
  specialNames,
  texNameAnnotations,
  texOps,
  typeToTeX,
  type DisplayNumberOptions,
  type TexOpFn,
  type TypeToTexFn,
} from "./display-tex";

// jme-display.js:21-23
const D1 = new math.Decimal(1);
const Dm1 = new math.Decimal(-1);
const DPI = math.Decimal.acos(-1);

/** La soglia oltre la quale un numero passa alla notazione scientifica.
 *
 * Upstream la ripete come letterale `20` in sei punti (jme-display.js:1189,
 * 1251, 1313, 1356, 2177, 2246); qui è una costante sola (inventario §9). */
export const NICE_NUMBER_MAX_LENGTH = 20;

// jme-display.js:860-876 (`displayer_settings`) + 1932-1942
// (`jme_display_settings`), uniti: le due classi leggono `this.settings` dallo
// stesso oggetto e i chiamanti mescolano le chiavi.
/** Le opzioni dei due renderer. */
export interface DisplaySettings {
  /** Mostra tutti i numeri come frazioni. */
  fractionnumbers?: boolean;
  /** Mostra le frazioni improprie come numeri misti (es. `3 3/4`). */
  mixedfractions?: boolean;
  /** Frazioni in linea (`\left. a \middle/ b \right.`) invece di `\frac`. */
  flatfractions?: boolean;
  /** Vettori come lista orizzontale di componenti. */
  rowvector?: boolean;
  /** Mostra sempre il simbolo di moltiplicazione. */
  alwaystimes?: boolean;
  /** Usa `\cdot` invece di `\times`. */
  timesdot?: boolean;
  /** Usa uno spazio (`\,`) invece di `\times`. */
  timesspace?: boolean;
  /** Non usare mai la notazione scientifica. */
  noscientificnumbers?: boolean;
  /** Passa i numeri per `math.niceNumber` (se `false`, stringa grezza). */
  nicenumber?: boolean;
  /** Matrici senza parentesi attorno. */
  barematrices?: boolean;
  /** Accuratezza per `math.rationalApproximation`. */
  accuracy?: number;
  /** Non avvolgere le stringhe in `safe(...)`/`latex(...)`. */
  ignorestringattributes?: boolean;
  /** Avvolge i token `expression` in `expression("...")`. */
  wrapexpressions?: boolean;
  /** Virgole fra le celle di una riga di matrice. */
  matrixcommas?: boolean;
  /** Mantiene precisione e tipo di arrotondamento nel numero reso. */
  store_precision?: boolean;
  /** Rende `dec("...")` come numero nudo. */
  plaindecimal?: boolean;
  [k: string]: unknown;
}

/** Quel che i chiamanti passano come `settings`: upstream accetta anche `''`
 * (test `texify(t2,'',scope)`) e un `Ruleset` intero (jme.js:426). */
export type DisplaySettingsArg = DisplaySettings | Ruleset | string | null | undefined;

/** La costante che fa da π: il simbolo e il fattore di scala rispetto a
 * `Math.PI` (jme-display.js:918-923). */
export interface CircleConstant {
  scale: number;
  constant: ConstantDefinition;
}

/** Le costanti "notevoli" trovate nello scope. */
export interface CommonConstants {
  pi: CircleConstant | null;
  imaginary_unit: ConstantDefinition | null;
  e: ConstantDefinition | null;
  infinity: ConstantDefinition | null;
}

/** `settings` normalizzato: upstream fa `settings || {}`, quindi `''` e `null`
 * diventano l'oggetto vuoto. */
function normaliseSettings(settings: DisplaySettingsArg): DisplaySettings {
  if (!settings || typeof settings !== "object") {
    return {};
  }
  return settings as DisplaySettings;
}

// jme-display.js:888-1046
/** Un oggetto che sa convertire un albero JME in un formato di uscita. */
export abstract class Displayer<TOut> {
  /** Le opzioni di resa. */
  settings: DisplaySettings;
  /** Lo scope da cui leggere costanti e ruleset. */
  scope: Scope;
  /** Tutte le costanti dello scope, nell'ordine di definizione. */
  constants: ConstantDefinition[] = [];
  /** π, l'unità immaginaria, `e` e l'infinito, se lo scope li definisce. */
  common_constants: CommonConstants = { pi: null, imaginary_unit: null, e: null, infinity: null };

  constructor(settings?: DisplaySettingsArg, scope?: Scope) {
    this.settings = normaliseSettings(settings);
    this.scope = scope || builtinScope;
    this.getConstants();
  }

  // jme-display.js:896-930
  /** Riempie i dizionari delle costanti leggendo lo scope. Si fa una volta
   * sola, alla creazione del renderer. */
  getConstants(): void {
    const scope = this.scope;
    this.constants = Object.values(scope.allConstants()).reverse();
    const common_constants: CommonConstants = (this.common_constants = {
      pi: null,
      imaginary_unit: null,
      e: null,
      infinity: null,
    });
    const cpi = scope.getConstant("pi");
    if (cpi && eqTokens(cpi.value, new TNum(Math.PI), scope)) {
      // upstream (908-910) assegna qui la definizione nuda; il ciclo sotto la
      // riscrive sempre come `{scale, constant}` quando `pi` è un numero, e
      // tutti i lettori usano solo `.scale`/`.constant`.
      common_constants.pi = { scale: 1, constant: cpi };
    }

    const imaginary_unit = new TNum(math.complex(0, 1) as math.Complex);
    this.constants.forEach((c) => {
      if (isType(c.value, "number")) {
        const n = (castToType(c.value, "number") as { value: math.NumbasNumber }).value;
        if (eqTokens(c.value, imaginary_unit, scope)) {
          common_constants.imaginary_unit = c;
        } else if (math.piDegree(n) === 1) {
          common_constants.pi = { scale: (n as number) / Math.PI, constant: c };
        } else if (n === Infinity) {
          common_constants.infinity = c;
        } else if (n === Math.E) {
          common_constants.e = c;
        }
      }
    });
    this.constants.reverse();
  }

  /** Converte l'albero nel formato d'uscita. */
  abstract render(tree: Tree | Token | null | undefined): TOut;

  /** Rende un numero complesso. */
  abstract complex_number(n: math.Complex, options: DisplayNumberOptions): TOut;

  /** Rende un numero come frazione. */
  abstract rational_number(n: number, options: DisplayNumberOptions): TOut;

  /** Rende un numero come decimale. */
  abstract real_number(n: number, options: DisplayNumberOptions): TOut;

  // jme-display.js:973-989
  /** Rende un numero, scegliendo fra complesso, frazione e decimale. */
  number(n: math.NumbasNumber, options: DisplayNumberOptions = {}): TOut {
    if (math.isComplex(n)) {
      return this.complex_number(n, options);
    } else {
      const fn = this.settings.fractionnumbers ? this.rational_number : this.real_number;
      return fn.call(this, n as number, options);
    }
  }

  /** Rende un decimale complesso. */
  abstract complex_decimal(n: math.ComplexDecimal, options: DisplayNumberOptions): TOut;

  /** Rende un decimale come frazione. */
  abstract rational_decimal(n: math.Decimal, options: DisplayNumberOptions): TOut;

  /** Rende un decimale come decimale. */
  abstract real_decimal(n: math.Decimal, options: DisplayNumberOptions): TOut;

  // jme-display.js:1030-1044
  /** Rende un decimale, scegliendo fra complesso, frazione e decimale. */
  decimal(n: math.ComplexDecimal | math.Decimal, options: DisplayNumberOptions = {}): TOut {
    const isComplexDecimal = n instanceof math.ComplexDecimal;
    if (isComplexDecimal && !n.isReal()) {
      return this.complex_decimal(n, options);
    } else {
      const fn = this.settings.fractionnumbers ? this.rational_decimal : this.real_decimal;
      const re = isComplexDecimal ? n.re : (n as math.Decimal);
      return fn.call(this, re, options);
    }
  }
}

/** Il valore numerico di un token che si sa essere un numero. */
function numberValueOf(tok: Token): math.NumbasNumber {
  return (castToType(tok, "number") as { value: math.NumbasNumber }).value;
}

/** Riproduce `util.eq(negated(tok), c.value, scope)` di
 * `texConstant`/`JMEifier.constant` (jme-display.js:1543, 2046): `negated()`
 * restituisce un numero grezzo, senza `.type`, quindi upstream
 * `findCompatibleType(undefined, ...)` fallisce e il confronto è sempre
 * falso. Il ramo è morto anche upstream: verificato sul runtime upstream,
 * dove `texify(-e)` dà `-2.7182818285` e non `-e`. */
export function eqMaybeUntyped(): boolean {
  return false;
}

// Non upstream (v. `texFunction`). Giro di correzioni 1: la prima versione
// deduceva il minimo dalla funzione REGISTRATA nello scope con lo stesso
// nome (`enumerate_signatures` su `scope.getFunction(name)`) — un'inferenza
// sbagliata, non solo imprecisa: un NOME di visualizzazione può coincidere
// per puro caso con una funzione VALUTABILE senza alcuna relazione. `int`
// registra un cast a intero (`[TNum] → TInt`, un argomento, `builtins/
// type-casting.ts`), che non ha niente a che vedere con la notazione
// dell'integrale indefinito `int(espressione, variabile)`; `diff` registra
// SOLO la firma a due argomenti (`[TExpression, TString]`,
// `builtins/differentiation.ts`), perché il terzo — il grado di
// derivazione — è una convenzione di sola VISUALIZZAZIONE, senza
// valutatore: nessuna definizione a tre argomenti esiste da dedurre.
// Quell'inferenza rifiutava `diff(y,x,2)`/`int(x,y)`, entrambi validi (resi
// identici all'oracolo — verificato, `display.diff.test.ts`), e lasciava
// passare `int(x)`/`defint(...)` con meno argomenti del dovuto, perché
// `defint` non è nemmeno una funzione registrata (`scope.getFunction`
// ritornava `[]`, e il ramo "nome sconosciuto" del vecchio codice si
// arrendeva lasciandolo passare).
//
// Qui l'arità voluta è una TABELLA ESPLICITA, per voce di `texOps`, scritta
// leggendo il renderer di ciascuna e verificata chiamandolo direttamente con
// `texArgs` di lunghezza crescente (non dedotta da nessuna funzione dello
// scope): il minimo è quello sotto cui il renderer indicizza `texArgs`/
// `tree.args` per posizione senza controllo, producendo la stringa
// "undefined" (o, per alcune — `abs`, `fact`, `decimal`, `transpose`, `ln`,
// `root` — un `TypeError` grezzo dereferenziando `.tok` su un elemento
// assente: stesso meccanismo, un'indicizzazione fuori raggio, un sintomo
// diverso; vedi DIVERGENCES.md). Un argomento facoltativo/di sola
// visualizzazione (il grado di `diff`/`partialdiff`, la base di `log`) non
// abbassa il minimo sopra quello: resta valido in più, non necessario.
//
// Non ci sono `dot`/`cross`: la loro arità valida non è "almeno N" ma
// "esattamente 1 o 2" — `infixTex` (display-tex.ts) non rende nient'altro,
// ritornando `undefined` per qualunque altra arità (upstream jme-display.js
// non ha un `return` per quel ramo); gestite a parte, sotto.
const TEX_FUNCTION_MIN_ARITY: Readonly<Record<string, number>> = {
  sqrt: 1,
  exp: 1,
  fact: 1,
  abs: 1,
  transpose: 1,
  decimal: 1,
  ln: 1,
  log: 1,
  ceil: 1,
  floor: 1,
  int: 2,
  sub: 2,
  sup: 2,
  mod: 2,
  perm: 2,
  comb: 2,
  root: 2,
  diff: 2,
  partialdiff: 2,
  listval: 2,
  limit: 3,
  if: 3,
  defint: 4,
  m_exactly: 1,
  m_commutative: 1,
  m_noncommutative: 1,
  m_associative: 1,
  m_nonassociative: 1,
  m_strictplus: 1,
  m_gather: 1,
  m_nogather: 1,
  m_numeric: 1,
};

/** `dot`/`cross`: le uniche arità che il renderer (`infixTex`) rende sono 1
 * (applicazione a un solo argomento) e 2 (il prodotto vero e proprio). */
const DOT_CROSS_VALID_ARITY = new Set([1, 2]);

/** Questa chiamata di funzione ha un'arità che il suo renderer (`texOps`)
 * sa gestire? `false` solo per un nome della tabella sopra chiamato con
 * meno argomenti del minimo, o per `dot`/`cross` fuori da {1, 2}. Un nome
 * NON elencato qui non ha un'arità nota da controllare: passa, come fa
 * qualunque voce di `texOps` che non indicizza per posizione (`switch`,
 * `sin`, `matrix`, ...) — la lista è la premessa del controllo, non uno
 * scope da consultare. */
function hasKnownGoodArity(name: string, argCount: number): boolean {
  if (DOT_CROSS_VALID_ARITY.has(argCount) && (name === "dot" || name === "cross")) {
    return true;
  }
  if (name === "dot" || name === "cross") {
    return false;
  }
  const min = TEX_FUNCTION_MIN_ARITY[name];
  return min === undefined || argCount >= min;
}

// jme-display.js:1048-1630
/** Converte un albero JME in TeX. */
export class Texifier extends Displayer<string> {
  /** I dizionari condivisi, agganciati come upstream (1629-1630) così che una
   * sottoclasse possa sovrascriverne le singole voci. */
  typeToTeX: Record<string, TypeToTexFn> = typeToTeX;
  /** Le rese TeX di operatori e funzioni. */
  texOps: Record<string, TexOpFn> = texOps;

  // jme-display.js:1057-1098
  override render(tree: Tree | Token | null | undefined): string {
    if (!tree) {
      return "";
    }
    let t = tree as Tree;
    let texArgs: string[] | undefined;

    const tok = t.tok || (tree as unknown as Token);
    if (isOp(tok, "*")) {
      // appiattisce le moltiplicazioni annidate, così una catena di prodotti
      // consecutivi si può considerare tutta insieme
      t = { tok: t.tok, args: flatten(t, "*") };
    }
    if (t.args) {
      t = {
        tok: t.tok,
        args: t.args.map((arg) => unwrapSubexpression(arg)),
      };
      texArgs = (t.args as Tree[]).map((arg) => this.render(arg));
    } else {
      const constantTex = this.texConstant(t);
      if (constantTex) {
        return constantTex;
      }
    }
    const fn = this.typeToTeX[tok.type];
    if (fn) {
      return fn.call(this, t, tok, texArgs);
    } else {
      throw new JmeError("jme.display.unknown token type", { type: tok.type });
    }
  }

  // jme-display.js:1101-1140
  override complex_number(n: math.Complex, options: DisplayNumberOptions): string {
    let imaginary_unit = "\\sqrt{-1}";
    if (this.common_constants.imaginary_unit) {
      imaginary_unit = this.common_constants.imaginary_unit.tex as string;
    }
    const re = this.number(n.re, options);
    const im = this.number(n.im, options) + " " + imaginary_unit;
    if (n.im === 0) {
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
        return re + " " + im;
      }
    } else {
      if (n.im === 1) {
        return re + " + " + imaginary_unit;
      } else {
        return re + " + " + im;
      }
    }
  }

  // jme-display.js:1142-1181
  override complex_decimal(n: math.ComplexDecimal, options: DisplayNumberOptions): string {
    let imaginary_unit = "\\sqrt{-1}";
    if (this.common_constants.imaginary_unit) {
      imaginary_unit = this.common_constants.imaginary_unit.tex as string;
    }
    const re = this.decimal(n.re, options);
    const im = this.decimal(n.im, options) + " " + imaginary_unit;
    if (n.im.isZero()) {
      return re;
    } else if (n.re.isZero()) {
      if (n.im.equals(D1)) {
        return imaginary_unit;
      } else if (n.im.equals(Dm1)) {
        return "-" + imaginary_unit;
      } else {
        return im;
      }
    } else if (n.im.isNegative()) {
      if (n.im.equals(Dm1)) {
        return re + " - " + imaginary_unit;
      } else {
        return re + " " + im;
      }
    } else {
      if (n.im.equals(D1)) {
        return re + " + " + imaginary_unit;
      } else {
        return re + " + " + im;
      }
    }
  }

  // jme-display.js:1183-1243
  override rational_number(n: number, options: DisplayNumberOptions): string {
    let piD: number | undefined;
    if (this.common_constants.pi && (piD = math.piDegree(n)) > 0) {
      n /= Math.pow(Math.PI * this.common_constants.pi.scale, piD);
    }
    let out = math.niceNumber(n, { ...options, syntax: "latex" });
    if (out.length > NICE_NUMBER_MAX_LENGTH && !this.settings.noscientificnumbers) {
      const bits = math.parseScientific(n.toExponential(), false) as { significand: string; exponent: string };
      return bits.significand + " " + this.texTimesSymbol() + " 10^{" + bits.exponent + "}";
    }
    const f = math.rationalApproximation(Math.abs(n));
    if (f[1] === 1) {
      out = Math.abs(f[0]).toString();
    } else {
      if (this.settings.mixedfractions && f[0] > f[1]) {
        const properNumerator = math.mod(f[0], f[1]) as number;
        const mixedInteger = (f[0] - properNumerator) / f[1];
        if (this.settings.flatfractions) {
          out = mixedInteger + "\\; \\left. " + properNumerator + " \\middle/ " + f[1] + " \\right.";
        } else {
          out = mixedInteger + " \\frac{" + properNumerator + "}{" + f[1] + "}";
        }
      } else {
        if (this.settings.flatfractions) {
          out = "\\left. " + f[0] + " \\middle/ " + f[1] + " \\right.";
        } else {
          out = "\\frac{" + f[0] + "}{" + f[1] + "}";
        }
      }
    }
    if (n < 0 && out !== "0") {
      out = "-" + out;
    }
    const circle_constant_symbol = this.common_constants.pi && this.common_constants.pi.constant.tex;
    switch (piD) {
      case undefined:
      case 0:
        return out;
      case 1:
        if (n === -1) {
          return "-" + circle_constant_symbol;
        } else {
          return out + " " + circle_constant_symbol;
        }
      default:
        if (n === -1) {
          return "-" + circle_constant_symbol + "^{" + piD + "}";
        } else {
          return out + " " + circle_constant_symbol + "^{" + piD + "}";
        }
    }
  }

  // jme-display.js:1245-1305
  override rational_decimal(n: math.Decimal, options: DisplayNumberOptions): string {
    let piD: number | undefined;
    if (this.common_constants.pi && (piD = math.piDegree(n.toNumber())) > 0) {
      n = n.dividedBy(DPI.times(this.common_constants.pi.scale).pow(piD));
    }
    let out = math.niceDecimal(n, { ...options, syntax: "latex" });
    if (out.length > NICE_NUMBER_MAX_LENGTH && !this.settings.noscientificnumbers) {
      const bits = math.parseScientific(n.toExponential(), false) as { significand: string; exponent: string };
      return bits.significand + " " + this.texTimesSymbol() + " 10^{" + bits.exponent + "}";
    }
    const f = n.toFraction();
    if ((f[1] as math.Decimal).equals(D1)) {
      out = (f[0] as math.Decimal).absoluteValue().toString();
    } else {
      if (this.settings.mixedfractions && (f[0] as math.Decimal).greaterThan(f[1] as math.Decimal)) {
        const properNumerator = (f[0] as math.Decimal).mod(f[1] as math.Decimal);
        const mixedInteger = (f[0] as math.Decimal).minus(properNumerator).dividedBy(f[1] as math.Decimal);
        if (this.settings.flatfractions) {
          out = mixedInteger + "\\; \\left. " + properNumerator + " \\middle/ " + f[1] + " \\right.";
        } else {
          out = mixedInteger + " \\frac{" + properNumerator + "}{" + f[1] + "}";
        }
      } else {
        if (this.settings.flatfractions) {
          out = "\\left. " + f[0] + " \\middle/ " + f[1] + " \\right.";
        } else {
          out = "\\frac{" + f[0] + "}{" + f[1] + "}";
        }
      }
    }
    if (n.isNegative() && out !== "0") {
      out = "-" + out;
    }
    const circle_constant_symbol = this.common_constants.pi && this.common_constants.pi.constant.tex;
    switch (piD) {
      case undefined:
      case 0:
        return out;
      case 1:
        if (n.isNegative()) {
          return "-" + circle_constant_symbol;
        } else {
          return out + " " + circle_constant_symbol;
        }
      default:
        // upstream (1290) confronta qui il `Decimal` con `-1` usando `==`:
        // la coercizione a stringa lo rende falso per ogni decimale diverso
        // da `-1`.
        if (looseEqMinusOne(n)) {
          return "-" + circle_constant_symbol + "^{" + piD + "}";
        } else {
          return out + " " + circle_constant_symbol + "^{" + piD + "}";
        }
    }
  }

  // jme-display.js:1307-1348
  override real_number(n: number, options: DisplayNumberOptions): string {
    let piD: number | undefined;
    if (this.common_constants.pi && (piD = math.piDegree(n)) > 0) {
      n /= Math.pow(Math.PI * this.common_constants.pi.scale, piD);
    }
    const out = math.niceNumber(n, { ...options, syntax: "latex" });
    if (out.length > NICE_NUMBER_MAX_LENGTH && !this.settings.noscientificnumbers) {
      const bits = math.parseScientific(n.toExponential(), false) as { significand: string; exponent: string };
      return bits.significand + " " + this.texTimesSymbol() + " 10^{" + bits.exponent + "}";
    }
    const circle_constant_symbol = this.common_constants.pi && this.common_constants.pi.constant.tex;
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
          return circle_constant_symbol + "^{" + piD + "}";
        } else if (n === -1) {
          return "-" + circle_constant_symbol + "^{" + piD + "}";
        } else {
          return out + " " + circle_constant_symbol + "^{" + piD + "}";
        }
    }
  }

  // jme-display.js:1350-1390
  override real_decimal(n: math.Decimal, options: DisplayNumberOptions): string {
    let piD: number | undefined;
    if (this.common_constants.pi && (piD = math.piDegree(n.toNumber())) > 0) {
      n = n.dividedBy(DPI.times(this.common_constants.pi.scale).pow(piD));
    }
    const out = math.niceDecimal(n, { ...options, syntax: "latex" });
    if (out.length > NICE_NUMBER_MAX_LENGTH && !this.settings.noscientificnumbers) {
      const bits = math.parseScientific(n.toExponential(), false) as { significand: string; exponent: string };
      return bits.significand + " " + this.texTimesSymbol() + " 10^{" + bits.exponent + "}";
    }
    const circle_constant_symbol = this.common_constants.pi && this.common_constants.pi.constant.tex;
    switch (piD) {
      case undefined:
      case 0:
        return out;
      case 1:
        if (looseEqOne(n)) {
          return circle_constant_symbol as string;
        } else if (looseEqMinusOne(n)) {
          return "-" + circle_constant_symbol;
        } else {
          return out + " " + circle_constant_symbol;
        }
      default:
        if (looseEqOne(n)) {
          return circle_constant_symbol + "^{" + piD + "}";
        } else if (looseEqMinusOne(n)) {
          return "-" + circle_constant_symbol + "^{" + piD + "}";
        } else {
          return out + " " + circle_constant_symbol + "^{" + piD + "}";
        }
    }
  }

  // jme-display.js:1392-1420
  /** Il TeX di un vettore. Con `settings.rowvector` è orizzontale. */
  texVector(v: math.NumbasNumber[] | Tree, options?: DisplayNumberOptions): string {
    let elements: string[];
    if ((v as Tree).args) {
      elements = ((v as Tree).args as Tree[]).map((x) => this.render(x));
    } else {
      elements = (v as math.NumbasNumber[]).map((x) => this.number(x, options));
    }
    if (this.settings.rowvector) {
      return elements.join(this.settings.matrixcommas === false ? " \\quad " : " " + LIST_SEPARATOR + " ");
    } else {
      return "\\begin{matrix} " + elements.join(" \\\\ ") + " \\end{matrix}";
    }
  }

  // jme-display.js:1422-1460
  /** Il TeX di una matrice, eventualmente fra parentesi. */
  texMatrix(m: math.Matrix | Tree, parens?: boolean, options?: DisplayNumberOptions): string {
    let rows: string[][];
    if ((m as Tree).args) {
      let all_lists = true;
      rows = ((m as Tree).args as Tree[]).map((x) => {
        if (x.tok.type === "list") {
          return (x.args as Tree[]).map((y) => this.render(y));
        } else {
          all_lists = false;
          return undefined as unknown as string[];
        }
      });
      if (!all_lists) {
        return (
          "\\operatorname{matrix}(" +
          ((m as Tree).args as Tree[]).map((x) => this.render(x)).join(LIST_SEPARATOR) +
          ")"
        );
      }
    } else {
      rows = (m as math.Matrix).map((x) => x.map((y) => this.number(y, options)));
    }
    const commas = (rows.length === 1 && this.settings.matrixcommas !== false) || this.settings.matrixcommas;
    const joined = rows.map((x) => x.join((commas ? LIST_SEPARATOR : "") + " & "));
    const out = joined.join(" \\\\ ");
    const macro = parens ? "pmatrix" : "matrix";
    return "\\begin{" + macro + "} " + out + " \\end{" + macro + "}";
  }

  // jme-display.js:1462-1470
  /** Il simbolo di moltiplicazione. */
  texTimesSymbol(): string {
    if (this.settings.timesdot) {
      return "\\cdot";
    } else if (this.settings.timesspace) {
      return "\\,";
    } else {
      return "\\times";
    }
  }

  // jme-display.js:1480-1529
  /** Il TeX del nome di una variabile o di una funzione. */
  texName(tok: TName | TFunc, longNameMacro?: (name: string) => string): string {
    let name = tok.nameWithoutAnnotation;
    const annotations = tok.annotation;
    const longName =
      longNameMacro ||
      function (n: string): string {
        return "\\texttt{" + n.replaceAll("_", "\\_") + "}";
      };

    /** Applica al nome le annotazioni del token. */
    function applyAnnotations(n: string): string {
      if (!annotations) {
        return n;
      }
      for (let i = 0; i < annotations.length; i++) {
        const annotation = annotations[i] as string;
        const f = texNameAnnotations[annotation];
        if (f) {
          n = f(n);
        } else {
          n = "\\" + annotation + "{" + n + "}";
        }
      }
      return n;
    }

    if (specialNames[name]) {
      return applyAnnotations(specialNames[name] as string);
    }

    const nameInfo = tok.nameInfo;
    name = nameInfo.root;
    if (nameInfo.isGreek) {
      name = "\\" + name;
    }
    if (nameInfo.isLong) {
      name = longName(name);
    }
    name = applyAnnotations(name);
    if (nameInfo.subscript) {
      let subscript = nameInfo.subscript;
      if (nameInfo.subscriptGreek) {
        subscript = "\\" + subscript;
      }
      name += "_{" + subscript + "}";
    }
    if (nameInfo.primes) {
      name += nameInfo.primes;
    }
    return name;
  }

  // jme-display.js:1532-1549
  /** Il TeX del token, se è il valore di una costante dello scope. */
  texConstant(tree: Tree): string | undefined {
    let constantTex: string | undefined;
    const scope = this.scope;
    this.constants.find((c) => {
      if (c.value === null || c.value === undefined) {
        return false;
      }
      if (eqTokens(tree.tok, c.value, scope)) {
        constantTex = c.tex;
        return true;
      }
      if (
        isType(tree.tok, "number") &&
        isType(c.value, "number") &&
        eqMaybeUntyped()
      ) {
        constantTex = "-" + c.tex;
        return true;
      }
      return false;
    });
    return constantTex;
  }

  // jme-display.js:1551-1555
  /** Il TeX di un'operazione. */
  texOp(tree: Tree, tok: TOp, texArgs: string[]): string {
    const name = normaliseName(tok.name, this.scope);
    const fn = name in this.texOps ? (this.texOps[name] as TexOpFn) : infixTexFallback(name);
    return fn.call(this, tree, texArgs);
  }

  // jme-display.js:1557-1578
  /** Il TeX di una chiamata di funzione. */
  texFunction(tree: Tree, tok: TFunc, texArgs: string[]): string {
    const normalisedName = normaliseName(tok.name, this.scope);
    const fn = this.texOps[normalisedName];
    if (fn) {
      // Divergenza dal comportamento upstream, registrata in DIVERGENCES.md:
      // alcune voci di `texOps` (`sqrt`, `int`, `mod`, ...) indicizzano
      // `texArgs`/`tree.args` per posizione senza controllare che ci sia
      // davvero un argomento in quella posizione; con un'arità sbagliata
      // (es. `sqrt()`) l'indice mancante è `undefined`, concatenato senza
      // errore nella stringa resa (`"\\sqrt{ undefined }"`) — verificato che
      // upstream fa lo stesso (`packages/engine/oracle`, commit 0f0ea33). A
      // differenza degli operatori (la sintassi shunting-yard fissa la loro
      // arità a tempo di analisi: `12*x^` lancia già `jme.shunt.not enough
      // arguments`), la chiamata di funzione `nome(...)` accetta
      // sintatticamente qualunque numero di argomenti: il controllo va
      // fatto qui, non nel parser — e solo per i nomi della tabella
      // esplicita `TEX_FUNCTION_MIN_ARITY` sopra, non per tutti (v. il suo
      // commento: dedurlo da una funzione REGISTRATA nello scope con lo
      // stesso nome è l'errore del giro di correzioni precedente, non la
      // correzione).
      if (!hasKnownGoodArity(normalisedName, texArgs.length)) {
        throw new JmeError("jme.display.wrong number of arguments", {
          name: normalisedName,
          count: texArgs.length,
        });
      }
      return fn.call(this, tree, texArgs);
    } else {
      /** I nomi lunghi di operatore vanno in `\operatorname`. */
      function texOperatorName(name: string): string {
        return "\\operatorname{" + name.replace(/_/g, "\\_") + "}";
      }
      return (
        this.texName(tok, texOperatorName) + " \\left ( " + texArgs.join(LIST_SEPARATOR + " ") + " \\right )"
      );
    }
  }

  // jme-display.js:1580-1618
  /** `texify` metterebbe le parentesi attorno a questo argomento? */
  texifyWouldBracketOpArg(tree: Tree, i: number): boolean {
    let arg = (tree.args as Tree[])[i] as Tree;
    if ((isOp(arg.tok, "-u") || isOp(arg.tok, "+u")) && isComplexTok(((arg.args as Tree[])[0] as Tree).tok)) {
      arg = (arg.args as Tree[])[0] as Tree;
    }
    const tok = arg.tok;

    if (tok.type === "op") {
      // un'operazione applicata a un'operazione: potrebbero servire le parentesi
      if ((tree.args as Tree[]).length === 1) {
        const a0 = (tree.args as Tree[])[0] as Tree;
        return a0.tok.type === "op" && (a0.args as Tree[]).length > 1;
      }
      const op1 = (arg.tok as TOp).name; // operatore figlio
      const op2 = (tree.tok as TOp).name; // operatore padre
      const p1 = precedence[op1] as number;
      const p2 = precedence[op2] as number;
      // servono se togliendole il figlio verrebbe valutato dopo il padre, o
      // se hanno la stessa precedenza e il padre non è commutativo, o se il
      // figlio è una negazione e il padre un elevamento
      //
      // upstream (1598) scrive `op2 == '+u'` nella seconda disgiunzione (e
      // non `op1`): riprodotto tale e quale.
      return (
        p1 > p2 ||
        (p1 === p2 && i > 0 && !commutative[op2]) ||
        (i > 0 && (op1 === "-u" || op2 === "+u") && p2 <= (precedence["*"] as number))
      );
    } else if (
      isComplexTok(tok) &&
      tree.tok.type === "op" &&
      // upstream (1599) ripete `'-u'` due volte: la seconda era probabilmente
      // `'+u'`. Riprodotto tale e quale.
      ((tree.tok as TOp).name === "*" ||
        (tree.tok as TOp).name === "-u" ||
        (tree.tok as TOp).name === "-u" ||
        (i === 0 && (tree.tok as TOp).name === "^"))
    ) {
      // i numeri complessi possono aver bisogno delle parentesi quando sono
      // moltiplicati per qualcos'altro o hanno un meno unario davanti
      const v = (arg.tok as { value: { re: unknown; im: unknown } }).value;
      return !(looseEqZero(v.re) || looseEqZero(v.im));
    } else if (
      isOp(tree.tok, "^") &&
      this.settings.fractionnumbers &&
      isType(tok, "number") &&
      this.texConstant(arg) === undefined &&
      math.rationalApproximation(Math.abs(numberValueOf(tok) as number))[1] !== 1
    ) {
      return true;
    }
    return false;
  }

  // jme-display.js:1620-1628
  /** Mette le parentesi attorno a un argomento, se servono. */
  texifyOpArg(tree: Tree, texArgs: string[], i: number): string {
    let tex = texArgs[i] as string;
    if (this.texifyWouldBracketOpArg(tree, i)) {
      tex = "\\left ( " + tex + " \\right )";
    }
    return tex;
  }
}

/** `x == 0`, con la coercizione debole dell'upstream. */
function looseEqZero(x: unknown): boolean {
  // upstream: coercizione debole voluta (i `Decimal` si coercono a stringa)
  return (x as number) == 0;
}

/** `x == 1`, con la coercizione debole dell'upstream. */
function looseEqOne(x: unknown): boolean {
  // upstream: coercizione debole voluta (i `Decimal` si coercono a stringa)
  return (x as number) == 1;
}

/** `x == -1`, con la coercizione debole dell'upstream. */
function looseEqMinusOne(x: unknown): boolean {
  // upstream: coercizione debole voluta (i `Decimal` si coercono a stringa)
  return (x as number) == -1;
}

// jme-display.js:1553 — la resa di un operatore sconosciuto.
/** Il TeX di un operatore che non è in `texOps`. */
function infixTexFallback(name: string): TexOpFn {
  const code = "\\, \\operatorname{" + name + "} \\,";
  return function (tree, texArgs) {
    const arity = (tree.args as Tree[]).length;
    if (arity === 1) {
      const arg = this.texifyOpArg(tree, texArgs, 0);
      return (tree.tok as TOp).postfix ? arg + code : code + arg;
    } else if (arity === 2) {
      return this.texifyOpArg(tree, texArgs, 0) + " " + code + " " + this.texifyOpArg(tree, texArgs, 1);
    }
    return undefined as unknown as string;
  };
}

// jme-display.js:1632-1648
/** Rende un albero JME come stringa TeX. */
export function texify(tree: Tree | Token | null | undefined, settings?: DisplaySettingsArg, scope?: Scope): string {
  const texifier = new Texifier(settings, scope);
  return texifier.render(tree);
}

