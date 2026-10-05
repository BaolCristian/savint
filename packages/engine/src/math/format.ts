/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// math.js:760-994 (niceRealNumber, niceNumber, niceComplexDecimal,
// niceDecimal, numberToDecimal) + util.js:513-747 (standardNumberFormatter,
// matchNotationStyle, cleanNumber, formatNumberNotation, parseDecimal,
// parseNumber, parseInt, parseFraction) + util.js:1460-1598
// (numberNotationStyles).
//
// Dove l'upstream legge `Numbas.locale.default_number_notation[0]` (globale
// mutabile impostata da localisation.js, fuori ambito per il motore) qui si
// usa il letterale `"plain"` come default esplicito (decisione 4 del brief,
// §8.4 dell'inventario — la locale vera e propria è nel Task 9).

import type { NumbasNumber, NotationStyle } from "./types";
import { isComplex } from "./types";
import {
  precround,
  siground,
  countDP,
  countSigFigs,
  addDigits,
  unscientific,
  parseScientific,
  toExponential,
  piDegree,
  MAX_FLOAT_PRECISION,
} from "./rounding";
import { isInt, isFloat, re_fraction } from "./predicates";
import { ComplexDecimal, isComplexDecimal, Decimal } from "./complex-decimal";
import { MathError } from "../errors";

const DEFAULT_STYLE = "plain";

// math.js:739-751 (JSDoc) — opzioni di formattazione, rinominato
// `imaginary_unit` in `imaginary` come da Interfaces del brief.
export type NiceNumberOptions = {
  precisionType?: "dp" | "sigfig";
  precision?: number;
  style?: string;
  scientificStyle?: string;
  syntax?: "plain" | "latex";
  infinity?: string;
  imaginary?: string;
  circle_constant?: { scale: number; symbol: string };
};

// math.js:760-821
/** Formatta un numero reale (non complesso). A differenza di `niceNumber`
 * non gestisce i complessi né i multipli di pi greco. */
export function niceRealNumber(n: NumbasNumber, options: NiceNumberOptions = {}): string {
  if (n === undefined) {
    throw new MathError("math.niceNumber.undefined");
  }
  let out: string;
  const style = options.style || DEFAULT_STYLE;
  if (options.style == "scientific") {
    const s = toExponential(n);
    const bits = parseScientific(s) as { significand: number; exponent: number };
    const noptions: NiceNumberOptions = {
      ...(options.precisionType !== undefined ? { precisionType: options.precisionType } : {}),
      ...(options.precision !== undefined ? { precision: options.precision } : {}),
      ...(options.syntax !== undefined ? { syntax: options.syntax } : {}),
      style: options.scientificStyle || DEFAULT_STYLE,
    };
    const significand = niceNumber(bits.significand, noptions);
    let exponentStr = bits.exponent + "";
    if (bits.exponent >= 0) {
      exponentStr = "+" + bits.exponent;
    }
    return significand + "e" + exponentStr;
  } else {
    if (typeof n === "bigint") {
      out = n.toString();
    } else {
      let precision: number;
      switch (options.precisionType) {
        case "sigfig":
          precision = options.precision!;
          out = siground(n, precision) + "";
          {
            const sigFigs = countSigFigs(out, true);
            if (sigFigs < precision) {
              out = addDigits(out, precision - sigFigs);
            }
          }
          break;
        case "dp":
          precision = Math.min(options.precision!, MAX_FLOAT_PRECISION);
          out = precround(n, precision) + "";
          {
            const dp = countDP(out);
            if (dp < precision) {
              out = addDigits(out, precision - dp);
            }
          }
          break;
        default: {
          const a = Math.abs(n as number);
          if (a < 1e-15) {
            out = "0";
          } else if (Math.abs(n as number) < 1e-8) {
            out = n + "";
          } else {
            out = precround(n, 10) + "";
          }
        }
      }
      out = unscientific(out);
    }
    if (style && numberNotationStyles[style]) {
      out = formatNumberNotation(out, style, options.syntax);
    }
  }
  return out;
}

// math.js:830-901
/** Mostra un numero in modo leggibile: arrotonda i float a 10dp così gli
 * errori di floating point non si vedono; gestisce i complessi e i
 * multipli di pi greco/costante-cerchio. */
export function niceNumber(n: NumbasNumber, options: NiceNumberOptions = {}): string {
  if (n === undefined) {
    throw new MathError("math.niceNumber.undefined");
  }
  if (isComplex(n)) {
    const imaginary_unit = options.imaginary || "i";
    const re = niceNumber(n.re, options);
    const im = niceNumber(n.im, options);
    if (precround(n.im, 10) == 0) {
      return re + "";
    } else if (precround(n.re, 10) == 0) {
      if (n.im == 1) {
        return imaginary_unit;
      } else if (n.im == -1) {
        return "-" + imaginary_unit;
      } else {
        return im + "*" + imaginary_unit;
      }
    } else if (n.im < 0) {
      if (n.im == -1) {
        return re + " - " + imaginary_unit;
      } else {
        return re + im + "*" + imaginary_unit;
      }
    } else {
      if (n.im == 1) {
        return re + " + " + imaginary_unit;
      } else {
        return re + " + " + im + "*" + imaginary_unit;
      }
    }
  } else {
    const infinity = options.infinity || "infinity";
    if (n == Infinity) {
      return infinity;
    } else if (n == -Infinity) {
      return "-" + infinity;
    }
    let piD = 0;
    let circle_constant_scale = 1;
    let circle_constant_symbol = "pi";
    if (options.circle_constant) {
      circle_constant_scale = options.circle_constant.scale;
      circle_constant_symbol = options.circle_constant.symbol;
    }
    let nn = n as number;
    if (options.precisionType === undefined && (piD = piDegree(nn, false)) > 0) {
      nn /= Math.pow(Math.PI * circle_constant_scale, piD);
    }
    const out = niceRealNumber(nn, options);
    switch (piD) {
      case 0:
        return out;
      case 1:
        if (nn == 1) {
          return circle_constant_symbol;
        } else if (nn == -1) {
          return "-" + circle_constant_symbol;
        } else {
          return out + "*" + circle_constant_symbol;
        }
      default:
        if (nn == 1) {
          return circle_constant_symbol + "^" + piD;
        } else if (nn == -1) {
          return "-" + circle_constant_symbol + "^" + piD;
        } else {
          return out + "*" + circle_constant_symbol + "^" + piD;
        }
    }
  }
}

// math.js:910-931
/** Formattazione di un `ComplexDecimal`. */
export function niceComplexDecimal(n: ComplexDecimal, options: NiceNumberOptions = {}): string {
  if (n === undefined) {
    throw new MathError("math.niceNumber.undefined");
  }
  const re = niceDecimal(n.re, options);
  if (n.isReal()) {
    return re;
  } else {
    let im = niceDecimal(n.im.absoluteValue(), options);
    if (options.style == "scientific") {
      im = "(" + im + ")*i";
    } else {
      im = n.im.absoluteValue().equals(1) ? "i" : im + "*i";
    }
    if (n.re.isZero()) {
      return (n.im.lessThan(0) ? "-" : "") + im;
    }
    const symbol = n.im.lessThan(0) ? "-" : "+";
    return re + " " + symbol + " " + im;
  }
}

// math.js:940-974
/** Formattazione di un `Decimal`. */
export function niceDecimal(n: Decimal, options: NiceNumberOptions = {}): string {
  if (n === undefined) {
    throw new MathError("math.niceNumber.undefined");
  }
  if (!n.isFinite()) {
    return n.lessThan(0) ? "-infinity" : "infinity";
  }

  const precision = options.precision;
  const style = options.style || DEFAULT_STYLE;
  if (options.style == "scientific") {
    const e = n.toExponential(options.precision);
    const m = /^(-?\d(?:\.\d+)?)(e[+-]\d+)$/.exec(e)!;
    const significand = formatNumberNotation(m[1]!, DEFAULT_STYLE);
    const exponential = m[2];
    return significand + exponential;
  } else {
    let out: string;
    switch (options.precisionType) {
      case "sigfig":
        out = n.toPrecision(precision);
        break;
      case "dp":
        out = n.toFixed(precision);
        break;
      default:
        out = n.toString();
    }
    if (style && numberNotationStyles[style]) {
      // upstream: `formatNumberNotation(out, style)`, senza `syntax`: in una
      // formula uno stile con la virgola usciva «0,765» invece di «0{,}765»,
      // e KaTeX spazia la virgola nuda come una punteggiatura. Con lo stile
      // predefinito (il punto) le due sintassi coincidono, per questo
      // upstream non se ne accorge. Vedi DIVERGENCES.md, «Stile dei numeri
      // mostrati».
      out = formatNumberNotation(out, style, options.syntax);
    }
    return out;
  }
}

// math.js:981-994
/** Converte un `number`/complesso JS a `Decimal`/`ComplexDecimal`. */
export function numberToDecimal(x: NumbasNumber): Decimal | ComplexDecimal {
  if (isComplex(x)) {
    return new ComplexDecimal(numberToDecimal(x.re) as Decimal, numberToDecimal(x.im) as Decimal);
  } else {
    const xn = Number(x);
    if (xn == Math.PI) {
      return Decimal.acos(-1);
    } else if (xn == Math.E) {
      return new Decimal(1).exp();
    } else {
      return new Decimal(xn);
    }
  }
}

// util.js:528-544
/** Fabbrica un formattatore `(integer,decimal) -> string` secondo la
 * punteggiatura data. */
export function standardNumberFormatter(
  thousands: string,
  decimal_mark: string,
  separate_decimal?: boolean
): (integer: string, decimal: string) => string {
  return function (integer: string, decimal: string): string {
    let s = separateThousands(integer, thousands);
    if (decimal) {
      let o = "";
      if (separate_decimal) {
        for (let i = 0; i < decimal.length; i += 3) {
          o += (o ? thousands : "") + decimal.slice(i, i + 3);
        }
      } else {
        o = decimal;
      }
      s += decimal_mark + o;
    }
    return s;
  };
}

// util.js:854-876 — string-format.ts non è ancora pronto in questo step
// (Step 3): `separateThousands` dipende da `niceRealNumber` (qui sopra), non
// il contrario, quindi la definizione completa vive in string-format.ts
// (Step 4) che la re-esporta; qui serve solo per costruire
// `standardNumberFormatter`, quindi si porta una copia minima locale che
// opera solo sulla stringa intera (l'uso reale, con `n: number`, resta in
// string-format.ts). Vedi la nota nella funzione stessa.
function separateThousands(whole: string, separator: string): string {
  const over = whole.length % 3;
  let out = whole.slice(0, over);
  let i = over;
  while (i < whole.length) {
    out += (out ? separator : "") + whole.slice(i, i + 3);
    i += 3;
  }
  return out;
}

// util.js:556-608
/** Trova quale stile (tra quelli passati) combacia meglio con l'inizio di
 * `s`, e ritorna sia il testo combaciato sia il numero "ripulito". */
export function matchNotationStyle(
  s: string,
  styles?: string | string[],
  strictStyle?: boolean,
  mustMatchAll?: boolean
): { matched: string; cleaned: string } {
  let pos = 0;
  s = s.toString();
  const match_neg = /^\s*(-)?\s*/.exec(s)!;
  const minus = match_neg[1] || "";
  pos += match_neg[0].length;

  let matched = false;
  let cleaned = s;
  let bestpos = pos;
  if (styles !== undefined) {
    const styleList = typeof styles == "string" ? [styles] : styles;
    for (let i = 0, l = styleList.length; i < l; i++) {
      const style = numberNotationStyles[styleList[i]!];
      if (!style) {
        continue;
      }
      const re = style.re;
      let m: RegExpExecArray | null;
      if (re && (m = re.exec(s.slice(pos))) && (!mustMatchAll || s.slice(pos + m[0].length).trim() == "")) {
        matched = true;
        let mcleaned: string;
        let mpos = pos + m[0].length;
        if (style.clean) {
          mcleaned = minus + style.clean(m[0]);
        } else {
          const integer = m[1]!.replace(/\D/g, "");
          if (m[2]) {
            const decimal = m[2].replace(/\D/g, "");
            mcleaned = minus + integer + "." + decimal;
          } else {
            mcleaned = minus + integer;
          }
          mpos = pos + m[0].length;
        }
        if (mpos > bestpos) {
          bestpos = mpos;
          cleaned = mcleaned;
        }
      }
    }
  }
  pos = bestpos;
  if (strictStyle && !matched) {
    cleaned = "NaN";
  }
  return {
    matched: matched ? s.slice(0, pos) : "",
    cleaned: cleaned,
  };
}

// util.js:622-625
/** Rimuove la punteggiatura di stile da una stringa numerica e la riscrive
 * con `.` come separatore decimale. */
export function cleanNumber(s: string, styles?: string | string[], strictStyle?: boolean): string {
  const result = matchNotationStyle(s, styles, strictStyle, true);
  return result.cleaned;
}

// util.js:634-647
/** Formatta una stringa "pulita" (`-123.45`) nello stile scelto. */
export function formatNumberNotation(s: string, style_name: string, syntax?: "plain" | "latex"): string {
  const match_neg = /^(-)?(.*)/.exec(s)!;
  const minus = match_neg[1] || "";
  const bits = match_neg[2]!.split(".");
  const integer = bits[0]!;
  const decimal = bits[1];
  const style = numberNotationStyles[style_name]!;
  const syn = syntax || "plain";
  if (!style.format[syn]) {
    throw new MathError("util.formatNumberNotation.unrecognised syntax", { syntax: syn });
  }
  const formatted = style.format[syn](integer, decimal || "");
  return minus + formatted;
}

// util.js:658-672
/** Come `parseNumber` ma ritorna un `Decimal`. */
export function parseDecimal(s: string, allowFractions: boolean, styles?: string | string[], strictStyle?: boolean): Decimal {
  const cleaned_s = cleanNumber(s, styles, strictStyle);
  let m: { numerator: number; denominator: number } | undefined;
  if (isFloat(cleaned_s)) {
    return new Decimal(cleaned_s);
  } else if (s.toLowerCase() == "infinity") {
    return new Decimal(Infinity);
  } else if (s.toLowerCase() == "-infinity") {
    return new Decimal(-Infinity);
  } else if (allowFractions && (m = parseFraction(s, true))) {
    return new Decimal(m.numerator).dividedBy(new Decimal(m.denominator));
  } else {
    return new Decimal(NaN);
  }
}

// util.js:682-696
/** Parsa un numero, anche "infinity" o (se richiesto) una frazione, secondo lo stile. */
export function parseNumber(s: string, allowFractions: boolean, styles?: string | string[], strictStyle?: boolean): number {
  const cleaned_s = cleanNumber(s, styles, strictStyle);
  let m: { numerator: number; denominator: number } | undefined;
  if (isFloat(cleaned_s)) {
    return parseFloat(cleaned_s);
  } else if (s.toLowerCase() == "infinity") {
    return Infinity;
  } else if (s.toLowerCase() == "-infinity") {
    return -Infinity;
  } else if (allowFractions && (m = parseFraction(s, true))) {
    return m.numerator / m.denominator;
  } else {
    return NaN;
  }
}

// util.js:707-716
/** Come il `parseInt` nativo, ma in base arbitraria e con `NaN` se ci sono
 * caratteri non validi (a differenza del built-in). */
export function parseInt(s: string, base: number): number {
  const lower = s.toLowerCase();
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const acceptable_digits = (digits + alphabet).slice(0, base);
  if (!lower.match(new RegExp("^[" + acceptable_digits + "]*$"))) {
    return NaN;
  }
  return globalThis.parseInt(lower, base);
}

// util.js:724-743
/** Parsa una stringa che rappresenta un intero o una frazione `a/b`. */
export function parseFraction(s: string, mustMatchAll?: boolean): { numerator: number; denominator: number } | undefined {
  if (isInt(s)) {
    return { numerator: globalThis.parseInt(s, 10), denominator: 1 };
  }
  const m = re_fraction.exec(s);
  if (!m || (mustMatchAll && m[0] != s)) {
    return undefined;
  }
  let n = globalThis.parseInt(m[2]!, 10);
  n = !!m[1] !== !!m[3] ? -n : n;
  const d = globalThis.parseInt(m[4]!, 10);
  return { numerator: n, denominator: d };
}

// util.js:1460-1598 — tabella degli stili di notazione numerica. Regex
// copiate VERBATIM (§6.12 dell'inventario): codificano regole culturali di
// raggruppamento delle cifre. Solo `scientific` ha `clean` in più.
export const numberNotationStyles: Record<string, NotationStyle> = {
  // Plain English style - no thousands separator, dot for decimal point
  plain: {
    re: /^([0-9]+)(\x2E[0-9]+)?/,
    format: {
      plain: (integer, decimal) => (decimal ? integer + "." + decimal : integer),
      latex: (integer, decimal) => (decimal ? integer + "." + decimal : integer),
    },
  },
  // English style - commas separate thousands, dot for decimal point
  en: {
    re: /^(\d{1,3}(?:,\d{3})*)(\x2E\d+)?/,
    format: {
      plain: standardNumberFormatter(",", "."),
      latex: standardNumberFormatter("{,}", "."),
    },
  },
  // English SI style - spaces separate thousands, dot for decimal point
  "si-en": {
    re: /^(\d{1,3}(?: +\d{3})*)(\x2E(?:\d{3} )*\d{1,3})?/,
    format: {
      plain: standardNumberFormatter(" ", ".", true),
      latex: standardNumberFormatter("\\,", ".", true),
    },
  },
  // French SI style - spaces separate thousands, comma for decimal point
  "si-fr": {
    re: /^(\d{1,3}(?: +\d{3})*)(,(?:\d{3} )*\d{1,3})?/,
    format: {
      plain: standardNumberFormatter(" ", ",", true),
      latex: standardNumberFormatter("\\,", "{,}", true),
    },
  },
  // Continental European style - dots separate thousands, comma for decimal point
  eu: {
    re: /^(\d{1,3}(?:\x2E\d{3})*)(,\d+)?/,
    format: {
      plain: standardNumberFormatter(".", ","),
      latex: standardNumberFormatter(".\\,", "{,}"),
    },
  },
  // Plain French style - no thousands separator, comma for decimal point
  "plain-eu": {
    re: /^([0-9]+)(,[0-9]+)?/,
    format: {
      plain: (integer, decimal) => (decimal ? integer + "," + decimal : integer),
      latex: (integer, decimal) => (decimal ? integer + "{,}" + decimal : integer),
    },
  },
  // Swiss style - apostrophes separate thousands, dot for decimal point
  ch: {
    re: /^(\d{1,3}(?:'\d{3})*)(\x2E\d+)?/,
    format: {
      plain: standardNumberFormatter("'", "."),
      latex: standardNumberFormatter("'", "."),
    },
  },
  // Indian style - commas separate groups, dot for decimal point. The rightmost group is three digits, other groups are two digits.
  in: {
    re: /^((?:\d{1,2}(?:,\d{2})*,\d{3})|\d{1,3})(\x2E\d+)?/,
    format: {
      plain: (integer, decimal) => formatIndian(integer, decimal, ","),
      latex: (integer, decimal) => formatIndian(integer, decimal, "{,}"),
    },
  },
  // Significand-exponent ("scientific") style
  scientific: {
    re: /^(\d[ \d]*)(\x2E\d[ \d]*)?\s*[eE]\s*([-+]?\d[ \d]*)/,
    clean: (s) => unscientific(s),
    format: {
      plain: (integer, decimal) => niceRealNumber(parseFloat(integer + "." + decimal), { style: "scientific" }),
      latex: (integer, decimal) =>
        niceRealNumber(parseFloat(integer + "." + decimal), { style: "scientific", syntax: "latex" }),
    },
  },
};

/** Raggruppamento indiano (2-2-3) condiviso da `format.plain`/`format.latex` dello stile `in`. */
function formatIndian(integer: string, decimal: string, sep: string): string {
  let ints = integer + "";
  if (ints.length > 3) {
    const over = (ints.length - 3) % 2;
    let out = ints.slice(0, over);
    let i = over;
    while (i < ints.length - 3) {
      out += (out ? sep : "") + ints.slice(i, i + 2);
      i += 2;
    }
    ints = out + sep + ints.slice(i);
  }
  return decimal ? ints + "." + decimal : ints;
}
