// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

/* Differenziale: `renderLatex` contro `Numbas.jme.display.exprToLaTeX`.
 *
 * Le prime 59 espressioni sono quelle del test "expression to LaTeX" upstream
 * (tests/jme/jme-tests.mjs:2732-2790), con l'insieme di regole che il test
 * passa: l'helper locale di quel file usa `rules || ''`, quindi "nessun
 * secondo argomento" significa `''` (nessuna semplificazione), non `'all'`.
 * Le altre vengono dalle fixture `test/fixtures/savint`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { renderLatex } from "../../src/index";
import { loadOracle, type OracleApi } from "./oracle";
import { checkDivergences, checkNoStaleDivergences, normTex } from "./compare";

let oracle: OracleApi;
beforeAll(async () => {
  oracle = await loadOracle();
}, 120_000);

/** `[espressione, insieme di regole]`. */
type Case = [string, string | string[]];

// tests/jme/jme-tests.mjs:2735-2790
const UPSTREAM_CASES: Case[] = [
  ["-2+i", ""],
  ["1+i +(-2+2i)", "collectComplex"],
  ["1-i +(-2+2i)", "collectComplex"],
  ["10000000000000000000000000", ""],
  ["47652000000000000000000000", ""],
  ["ln(abs(x))", ""],
  ["ln(x)", ""],
  ["4-(x^2+x+1)", []],
  ["(x^2+x+1)-4", []],
  ["x-(-1.5)", "fractionNumbers,all"],
  ["x-(5-p)", []],
  ["3*5^2*19", ["basic"]],
  ["exp(x)^2", ""],
  ["-(-x)", []],
  ["+(-x)", []],
  ["3+(-2)", []],
  ["3-(-2)", []],
  ["2+(3+2)+(4-5)", []],
  ["lambda1'(x)", ""],
  ["lambda * theta", ""],
  ["x * xy", ""],
  ["long_function_name(x)", ""],
  ["fact(3)*fact(2)", ""],
  ["not a", ""],
  ["7*(5x+y)", ""],
  ["(5 + 9i)*(2 + 7)", ""],
  ["(-7+9i)*(x+1)", ""],
  ["(0.5)^3", "fractionNumbers"],
  ["(5)^3", "fractionNumbers"],
  ["(1+i)^3", "fractionNumbers"],
  ["2*e^2", ""],
  ["2 * pi", ""],
  ["2 * e", ""],
  ["2*(i^3)", ""],
  ["x*i", ""],
  ["x*i", "alwaystimes"],
  ["2^3 * 2^3 * 2^3", "basic"],
  ["sin(x)^5", ""],
  ["sin(x)^(-1)", ""],
  ["infinity", ""],
  ["infinity", "fractionNumbers"],
  ["e", "fractionNumbers"],
  ["pi", "fractionNumbers"],
  ["e^(3x)", "fractionNumbers"],
  ["e*i", ""],
  ["2/4", "flatFractions"],
  ["(2 + 3)/(a + b)", "flatFractions"],
  ["matrix([1,1]) + matrix([1]) + (-5)matrix([1])", "all"],
  ["x*(x+1)", ""],
  ["-2x", "all"],
  ["Gamma gamma", ""],
  ["1.2 pi", "fractionNumbers"],
  ["set()", ""],
  ["set(1,2)", ""],
  ["set([1,2])", ""],
  ["set([[1,2]])", ""],
  ["root(x,2)", ""],
  ["root(x,3)", ""],
  ["root(x,z)", ""],
];

// Espressioni prese dalle fixture `savint` (o della stessa forma: equazioni,
// radicali, frazioni, percentuali — quel che scrive un esercizio delle
// superiori), con e senza semplificazione.
const SAVINT_CASES: Case[] = [
  ["(c-b)/a", "all"],
  ["(c-b)/a", ""],
  ["x^2 + p*x + r", "all"],
  ["sqrt(n^2*k)", "all"],
  ["(x1+x2)/2", "all"],
  ["100*promossi/tot", "all"],
  ["3*x + 5 = 17", "all"],
  ["x^2-5x+6 = 0", "all"],
  ["(a+b)^2", "all"],
  ["(a+b)^2", []],
  ["1/(1+1/x)", "all"],
  ["-3/4", "fractionNumbers"],
  ["3/4 + 1/6", "all"],
  ["10^(-3)", "all"],
  ["2*10^8", "all"],
  ["abs(x-3) <= 5", "all"],
  ["log(x,2)", "all"],
  ["sin(pi/6) + cos(pi/3)", "all"],
  ["matrix([1,2],[3,4])", "all"],
  ["vector(1,2,3)", "all"],
  ["sum(map(2*j+1, j, 1..5))", "all"],
  ["sqrt(a^2+b^2)", "all"],
  ["(2x+1)/(x-3)", "all"],
  ["x = -3", "all"],
];

// Giro di correzioni 1 del guardiano d'arità di `texFunction`
// (display-texifier.ts): la prima versione deduceva il minimo dalla
// funzione REGISTRATA nello scope con lo stesso nome, e rifiutava
// `diff(y,x,2)`/`int(x,y)` — validi, con un'arità che nessuna fixture di
// questo corpus esercitava. La loro assenza è quel che ha lasciato passare
// la regressione: qui restano, byte per byte contro l'oracolo, così una
// futura modifica del guardiano non può romperli in silenzio.
const ARITY_GUARD_CASES: Case[] = [
  ["diff(y,x,2)", ""],
  ["diff(y,x,1)", ""],
  ["partialdiff(y,x,2)", ""],
  ["int(x,y)", ""],
  ["int(x^2,x)", ""],
  ["defint(x^2,x,0,1)", ""],
  ["log(x)", ""],
  ["log(x,2)", ""],
];

const CASES: Case[] = [...UPSTREAM_CASES, ...SAVINT_CASES, ...ARITY_GUARD_CASES];

describe("renderLatex contro exprToLaTeX", () => {
  it("il corpus di espressioni è quello previsto", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(60);
  });

  it.each(CASES.map((c, i): [string, Case] => [`${String(i).padStart(2, "0")} ${c[0]} [${String(c[1])}]`, c]))(
    "%s",
    (_name, [expr, ruleset]) => {
      const ours = normTex(renderLatex(expr, { ruleset: ruleset, locale: "en" }));
      const theirs = normTex(oracle.oracleDisplay(expr, ruleset));
      const diffs = ours === theirs ? [] : [{ path: "-", field: `latex[${expr}|${String(ruleset)}]`, detail: `nostro «${ours}» vs oracolo «${theirs}»` }];
      checkDivergences("display", diffs);
    },
  );

  it("nessuna voce obsoleta in known-divergences.json", () => {
    checkNoStaleDivergences("display");
  });
});
