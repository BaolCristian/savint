// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione del modulo QUnit `Display` (tests/jme/jme-tests.mjs:2234-2831),
// una `it` per ciascun `QUnit.test`, nello stesso ordine:
//   `tokens with precision`(2284) `subvars`(2432) `token to display
//   string`(2437) `tree to JME`(2458) `Simplify surds`(2600) `brackets
//   involving subtraction`(2610) `localisation doesn't affect
//   treeToJME`(2618) `Localise number representation`(2627) `large
//   product`(2650) `texName`(2657) `texify`(2693) `expression to
//   LaTeX`(2732) `Tree to LaTeX`(2826).
//
// I primi tre `QUnit.test` del modulo (`niceNumber`, `niceDecimal`,
// `niceComplexDecimal`, 2236-2282) e `Number notation styles` (2315)
// esercitano `math.js`/`util.js`, non `jme-display.js`: sono già tradotti nel
// Task 1 (math-pure.test.ts, math-direct.test.ts).
//
// DIVERGENZE DI TRADUZIONE (vedi DIVERGENCES.md):
//   - il motore non ha le globali di locale (`Numbas.locale.
//     default_number_notation`, `default_list_separator`): il separatore di
//     lista è sempre `,` e la notazione numerica sempre `plain`. Gli assert di
//     `localisation doesn't affect treeToJME` e `Localise number
//     representation` restano, ma con i valori della locale predefinita —
//     verificati contro il runtime upstream (`packages/engine/oracle`, commit
//     0f0ea33) con la locale `en-GB`.
//   - `THTML` conserva la sorgente HTML invece di un elemento del DOM, quindi
//     `treeToJME` di un `html(...)` non riporta l'attributo
//     `data-interactive="false"` che upstream legge dall'elemento.

import { afterEach, describe, expect, it } from "vitest";
import { setLocale, t } from "../../src/i18n";
import * as math from "../../src/math";
import { builtinScope } from "../../src/jme/builtins";
import { compile } from "../../src/jme/parser";
import { substituteTree } from "../../src/jme/evaluate";
import { Scope } from "../../src/jme/scope";
import { THTML, TNum, TName, type Token, type Tree } from "../../src/jme/tokens";
import { collectRuleset, Rule } from "../../src/jme/rules";
import { subvars, texsplit } from "../../src/jme/subvars";
import { tokenToDisplayString } from "../../src/jme/subvars";
import {
  exprToLaTeX,
  simplifyExpression,
  simplifyTree,
  texify,
  Texifier,
  treeToLaTeX,
  type DisplaySettings,
} from "../../src/jme/display";
import { JMEifier, treeToJME } from "../../src/jme/display-jme";
import { raisesJmeError } from "./jme-helpers";

/** `Numbas.jme.builtinScope.evaluate(expr)`, con l'asserzione che non sia nullo. */
function ev(expr: string, scope: Scope = builtinScope): Token {
  const v = scope.evaluate(expr);
  expect(v, `${expr} non deve valutare a null`).not.toBeNull();
  return v as Token;
}

/** L'helper `simplifyExpression(expr, rules)` dei test upstream (2459-2461). */
function simp(expr: string, rules?: unknown, scope: Scope = builtinScope): string {
  return simplifyExpression(expr, (rules ?? "") as never, scope);
}

/** L'helper `exprToLaTeX(expr, rules)` dei test upstream (2733-2735). */
function tex(expr: string, rules?: unknown, scope: Scope = builtinScope): string {
  return exprToLaTeX(expr, (rules ?? "") as never, scope);
}

describe("Display", () => {
  // il Task 9 introduce una lingua corrente globale: i test che la cambiano
  // la riportano all'italiano predefinito.
  afterEach(() => {
    setLocale("it");
  });

  // jme-tests.mjs:2284-2313
  it("tokens with precision", () => {
    /** `test_expression` upstream (2285-2288). */
    function testExpression(expr: string, jme: string, tx: string): void {
      expect(treeToJME({ tok: ev(expr) }), `${expr} to JME`).toBe(jme);
      expect(texify({ tok: ev(expr) }), `${expr} to TeX`).toBe(tx);
    }
    const tests: Array<[string, string, string]> = [
      ["21.0", "21.0", "21.0"],
      ['dec("21.0")', 'dec("21.0")', "21.0"],
      [
        "dec(0.123456789012345678901234567890123)",
        'dec("1.23456789012345678901234567890123e-1")',
        "1.23456789012345678901234567890123 \\times 10^{-1}",
      ],
      [
        "matrix([1.0,2.0],[0.0,3.0])",
        "matrix([1.0,2.0],[0.0,3.0])",
        "\\left ( \\begin{matrix} 1.0 & 2.0 \\\\ 0.0 & 3.0 \\end{matrix} \\right )",
      ],
      [
        "matrix(vector(1.0,2.0),vector(0.0,3.0))",
        "matrix([1.0,2.0],[0.0,3.0])",
        "\\left ( \\begin{matrix} 1.0 & 2.0 \\\\ 0.0 & 3.0 \\end{matrix} \\right )",
      ],
      [
        "matrix([vector(1.0,2.0),vector(0.0,3.0)])",
        "matrix([1.0,2.0],[0.0,3.0])",
        "\\left ( \\begin{matrix} 1.0 & 2.0 \\\\ 0.0 & 3.0 \\end{matrix} \\right )",
      ],
      ["vector(1.0)", "vector(1.0)", "\\left ( \\begin{matrix} 1.0 \\end{matrix} \\right )"],
      ["rowvector(1.0, 2.0)", "matrix([1.0,2.0])", "\\left ( \\begin{matrix} 1.0, & 2.0 \\end{matrix} \\right )"],
    ];
    tests.forEach((t) => testExpression(t[0], t[1], t[2]));

    /** `test_with_precision` upstream (2303-2305). */
    function testWithPrecision(expr: string, jme: string): void {
      expect(
        treeToJME({ tok: ev(expr) }, { store_precision: true, nicenumber: false }),
        `${expr} to JME with store_precision: true`,
      ).toBe(jme);
    }
    (
      [
        ["5.4", 'with_precision(5.4, 1, "dp")'],
        ["5", "5"],
        ["8/3", "8/3"],
        ["siground(7.245,2)", 'with_precision(7.2, 2, "sigfig")'],
        ["dec(500.1)", 'dec("500.1")'],
      ] as Array<[string, string]>
    ).forEach((t) => testWithPrecision(t[0], t[1]));
  });

  // jme-tests.mjs:2432-2435
  it("subvars", () => {
    expect(texsplit("boo\r\\simplify{}"), "texsplit regge i caratteri \\r").toBeTruthy();
    expect(subvars("{1-0.9-0.1}", builtinScope), "numeri vicinissimi a zero arrotondati a zero").toBe("(0)");
  });

  // jme-tests.mjs:2437-2456 — gli ultimi quattro assert cambiano la locale:
  // qui restano solo quelli con la locale predefinita.
  it("token to display string", () => {
    const scope = builtinScope;
    expect(tokenToDisplayString(ev("3-9*(11*(1/33))"), scope), "quasi quasi 0").toBe("0");
    expect(tokenToDisplayString(ev("vector(3)-9*(11*vector(1/33))"), scope), "vettore quasi nullo").toBe("vector(0)");
    expect(tokenToDisplayString(ev("vector(pi)"), scope), "vettore di pi").toBe("vector(pi)");
    expect(tokenToDisplayString(ev("vector(pi/7)"), scope), "vector(pi/7)").toBe("vector(0.4487989505)");
    expect(tokenToDisplayString(ev("vector(5pi)"), scope), "vector(5pi)").toBe("vector(5 pi)");
    expect(tokenToDisplayString(ev("precround(2,3)"), scope), "precround(2,3)").toBe("2.000");
    expect(tokenToDisplayString(ev("siground(21,3)"), scope), "siground(21,3)").toBe("21.0");
    expect(tokenToDisplayString(ev("1.2"), scope), "1.2").toBe("1.2");
    expect(tokenToDisplayString(ev("dec(1.2)"), scope), "dec(1.2)").toBe("1.2");
  });

  // jme-tests.mjs:2458-2598
  it("tree to JME", () => {
    const jmeifier = new JMEifier();
    expect(jmeifier.number(math.complex(1, -Math.PI)), "1 - pi*i con l'asterisco").toBe("1 - pi*i");
    expect(jmeifier.number(math.complex(0, -Math.PI)), "-pi*i con l'asterisco").toBe("-pi*i");
    expect(jmeifier.number(math.complex(1, Math.PI)), "1 + pi*i con l'asterisco").toBe("1 + pi*i");
    expect(jmeifier.number(math.complex(0, Math.PI)), "pi*i con l'asterisco").toBe("pi*i");
    expect(jmeifier.decimal(new math.ComplexDecimal(new math.Decimal(1.2))), "dec(1.2)").toBe('dec("1.2")');
    expect(
      jmeifier.decimal(new math.ComplexDecimal(new math.Decimal(1.2), new math.Decimal(-3.4))),
      "dec(1.2) - dec(3.4)*i",
    ).toBe('dec("1.2") - dec("3.4")*i');
    expect(
      jmeifier.decimal(new math.ComplexDecimal(new math.Decimal(1.2)), { style: "plain-eu" }),
      "dec(1.2) anche forzando style: plain-eu",
    ).toBe('dec("1.2")');
    expect(
      treeToJME({ tok: ev('dec(1)+dec("-15.460910528400001612")*i') }),
      "parti immaginarie negative",
    ).toBe('dec("1") - dec("1.5460910528400001612e+1")*i');
    expect(simp("-1*x*3"), "porta il meno a sinistra del prodotto").toBe("-1x*3");
    expect(simp("2*pi*i", "basic"), "2*pi*i invariato dalle regole basic").toBe("2pi*i");
    expect(simp("(a/b)*(c/d)"), "(a/b)*(c/d) - le frazioni restano separate").toBe("(a/b)(c/d)");
    expect(simp("(-7)/(-4+5i)", "all"), "(-7)/(-4+5i)").toBe("7/(4 - 5i)");
    expect(simp("-4+5i", "all"), "-4+5i").toBe("-4 + 5i");
    expect(simp("(1-i)+(-2+2i)", "collectComplex"), "(1-i)+(-2+2i)").toBe("1 - i - 2 + 2i");
    expect(simp("(1-i)-(-2+2i)", "collectComplex"), "(1-i)-(-2+2i)").toBe("1 - i + 2 - 2i");
    expect(simp("10000000000000000000000000.0", { flags: { noscientificnumbers: false } }), "1*10^25").toBe(
      "1*10^(25)",
    );
    expect(simp("47652000000000000000000000.0", { flags: { noscientificnumbers: false } }), "4.7652*10^25").toBe(
      "4.7652*10^(25)",
    );
    expect(simp("x+(-10+2)", "all,collectNumbers"), "x+(-10+2)").toBe("x - 8");
    expect(simp("4-(x^2+x+1)", []), "4-(x^2+x+1) - parentesi a destra della sottrazione").toBe("4 - (x^2 + x + 1)");
    expect(simp("(x^2+x)-4", []), "(x^2+x)-4 - parentesi a sinistra eliminabili").toBe("x^2 + x - 4");
    expect(simp("pi*i", ["all"]), "pi*i - non perde il simbolo di moltiplicazione").toBe("pi*i");
    expect(
      ((compile(treeToJME(compile('"\\\\textrm{hi}\\nso"') as Tree)) as Tree).tok as { value: string }).value,
      "treeToJME fa l'escape delle barre rovesce",
    ).toBe("\\textrm{hi}\nso");
    expect(simp("-3x-4", ["all"]), "-3x-4 non diventa -(3x+4)").toBe("-3x - 4");
    expect(simp("x-(5-p)", []), "x-(5-p) tiene le parentesi a destra").toBe("x - (5 - p)");
    expect(simp("3i/5", "basic,collectComplex"), "niente parentesi su un numeratore immaginario").toBe("3i/5");
    expect(simp("-3/5", "basic"), "niente parentesi su un numeratore di un solo numero").toBe("-3/5");
    expect(simp("3/4i", "basic,collectComplex"), "parentesi attorno a una frazione prima di i").toBe("(3/4)i");
    expect(simp("(e^t)^2"), "parentesi attorno a una potenza elevata a potenza").toBe("(e^t)^2");
    expect(simp("3!", []), "3!").toBe("3!");
    expect(simp("(3+1)!", []), "(3+1)! è fra parentesi").toBe("(3 + 1)!");
    expect(simp("pi*x", ["all"]), "pi*x non omette il *").toBe("pi*x");
    expect(simp("e*x", ["all"]), "e*x non omette il *").toBe("e*x");
    expect(simp("1*pi/4", ["all"]), "1*pi/4 cancella l'1").toBe("pi/4");
    expect(simp("2*pi/4", ["all"]), "2*pi/4 cancella il fattore intero").toBe("pi/2");
    expect(simp("2*pi*x/4", ["all"]), "2*pi*x/4 cancella il fattore intero").toBe("pi*x/2");
    expect(simp("x/(2 pi^2)", ["all"]), "x/(2 pi^2) mette fra parentesi il multiplo di pi").toBe("x/(2 pi^2)");
    expect(simp("2*x/(4*pi^2)", ["all"]), "2*x/(4*pi^2) cancella il fattore intero").toBe("x/(2 pi^2)");
    expect(simp("2i/4", ["all"]), "2*i/4 cancella il fattore intero").toBe("i/2");
    expect(simp("2/(4i)", ["all"]), "2/(4i) cancella il fattore intero").toBe("1/(2i)");
    expect(simp("2i/(4i)", ["all"]), "2i/(4i) cancella la i").toBe("1/2");
    expect(simp("(2+i)/3", ["all"]), "(2+i)/3 mette fra parentesi il numeratore complesso").toBe("(2 + i)/3");
    expect(simp("-0", ["noLeadingMinus"]), "-0 riscritto come 0 con noLeadingMinus").toBe("0");
    expect(simp("-0", ["all", "!noLeadingMinus"]), "-0 non riscritto senza noLeadingMinus").toBe("-0");
    expect(simp("y+(1-2)x", "all"), "numeri raccolti in un negativo").toBe("y - x");
    expect(simp("x+(1-2)/x", "all"), "numeri raccolti in un negativo").toBe("x - 1/x");
    expect(simp("x^0.5", { flags: { fractionnumbers: true } }), "x^0.5 con fractionNumbers").toBe("x^(1/2)");
    expect(
      simp("(x+2)(x+3)", "all,canonicalOrder,expandBrackets,!noLeadingMinus"),
      "prodotto piccolo espanso e raccolto",
    ).toBe("x^2 + 5x + 6");
    expect(
      simp("(x+1)(x+2)(x+3)(x+4)", "all,canonicalOrder,expandBrackets,!noLeadingMinus"),
      "prodotto grande espanso e raccolto",
    ).toBe("x^4 + 10*x^3 + 35*x^2 + 50x + 24");
    expect(
      simp("(x+1)(x-2)(x+3)(x+4)", "all,canonicalOrder,expandBrackets,!noLeadingMinus"),
      "prodotto grande con un termine negativo",
    ).toBe("x^4 + 6*x^3 + 3*x^2 - 26x - 24");
    expect(simp("(x^2+4x+1)(x^2+2x+1)", "all"), "cancelFactors su polinomi diversi").toBe(
      "(x^2 + 4x + 1)(x^2 + 2x + 1)",
    );
    expect(simp("(x^2+4x+1)(x^2+4x+1)", "all"), "cancelFactors su polinomi uguali").toBe("(x^2 + 4x + 1)^2");
    expect(simp("(49)/(130)-(63)/(130)*i", "all,!collectNumbers"), "(49)/(130)-(63)/(130)*i").toBe("(49 - 63i)/130");
    expect(
      simp("(49)/(130)-(63)/(130)*i", "all,!collectNumbers,!collectLikeFractions"),
      "(49)/(130)-(63)/(130)*i senza collectLikeFractions",
    ).toBe("49/130 - (63/130)i");
    expect(simp("(1/10/10)*9", "collectNumbers"), "(1/10/10)*9 non entra in ciclo").toBe("9/100");
    expect(simp("4*(1/3/x)", "all"), "4*(1/3/x) non entra in ciclo").toBe("4/(3x)");
    expect(simp("0(1/(9x))", "all"), "0(1/(9x)) non entra in ciclo").toBe("0");
    expect(simp("2*(x*(-1/2))", "all"), "2*(x*(-1/2)) non entra in ciclo").toBe("-x");
    expect(simp("(-2)^3", "all"), "(-2)^3").toBe("-8");
    expect(treeToJME({ tok: ev("6-48i") }, { fractionnumbers: true }), "6-48i").toBe("6 - 48i");
    expect(treeToJME({ tok: ev("dec(2)+dec(sqrt(-1))") }), "dec(2) + dec(sqrt(-1))").toBe('dec("2") + i');
    expect(treeToJME(compile("not (p and q)") as Tree), "not (p and q)").toBe("not (p and q)");
    expect(treeToJME(compile("not (p + q)") as Tree), "not (p + q)").toBe("not (p + q)");
    expect(treeToJME(compile("not p") as Tree), "not p").toBe("not p");
    expect(simp("i*omega", "all"), "i*omega").toBe("i*omega");
    expect(simp("e^(i*omega*t)", "all"), "e^(i*omega*t)").toBe("e^(i*omega*t)");

    // upstream valuta `html("<div class=\"thing\">this</div>")`: la funzione
    // JME `html` costruisce nodi del DOM e non è portata (DIVERGENCES.md),
    // quindi qui il token si costruisce a mano. Upstream il risultato riporta
    // anche `data-interactive="false"`, che `DOMcontentsubber` scrive
    // sull'elemento; il nostro `THTML` conserva la sorgente com'è.
    const html = new THTML('<div class="thing">this</div>');
    expect(treeToJME({ tok: html }), "treeToJME serializza l'HTML").toBe(
      'html(safe("<div class=\\"thing\\">this</div>"))',
    );

    const r = new Rule("$n;m*?;n", "eval(m*n)");
    const s = new Scope([builtinScope, { variables: { x: new TNum(2) } }]);
    expect(
      r.match(compile("x*2") as Tree, s),
      "le variabili dello scope non si sostituiscono nelle condizioni delle regole",
    ).toBe(false);
    expect(simplifyExpression("4x+2", "all", s), "x è definita nello scope come numero").toBe("4x + 2");
    expect(simp("3x^(-5)+6x^4", ["all"]), "canonical_compare confronta bene le potenze negative").toBe(
      "3*x^(-5) + 6*x^4",
    );
    expect(simp("-6x - 20x", ["all"]), "raccoglie due negativi").toBe("-26x");
    expect(simp("2x*(3/5)", ["all"]), "2x*(3/5) non entra in ciclo").toBe("6(x/5)");
    expect(simp("sin(315/180*pi)", ["all"]), "niente divisione unaria, e tutto raccolto").toBe("sin(7 pi/4)");
    expect(simp("-1/2", [""]), "niente parentesi attorno al meno unario in una divisione").toBe("-1/2");
    expect(
      simp("(5)^(1)+ (-0.096)*((1)/(2))*(5)^(-1)", "all,!collectNumbers"),
      "porta il meno fuori da una moltiplicazione grande",
    ).toBe("5 - 0.096(1/2)*5^(-1)");
    expect(treeToJME({ tok: ev("dec(-4)") }), 'dec(-4) reso come dec("-4")').toBe('dec("-4")');
    expect(treeToJME({ tok: ev("dec(4.56)*dec(10)^1000") }), "dec(4.56)*dec(10)^1000").toBe('dec("4.56e+1000")');
    expect(treeToJME({ tok: ev("dec(10)^1000") }), "dec(10)^1000").toBe('dec("1e+1000")');
    expect(treeToJME({ tok: ev("10^3") }), "10^3").toBe("1000");
    expect(simp("dot:x + x", "all"), "dot:x + x non raccoglie i termini in x").toBe("dot:x + x");
    expect(simp("(5k)!", "all"), "(5k)! - parentesi attorno all'argomento del fattoriale").toBe("(5k)!");
    expect(simp("x + (-2)*y + z + 0*u", "zeroFactor,zeroTerm"), "x+(-2)*y+z+0*u").toBe("x - 2y + z");
    expect(simp("x/(1/2)", "basic"), "x/(1/2) - tiene le parentesi in una sequenza di divisioni").toBe("x/(1/2)");
    expect(simp("2*(-3*4)", "basic"), "2*(-3*4) - parentesi prima di un meno unario").toBe("-3*4*2");
    expect(treeToJME(compile("2*(3*-4)") as Tree), "2*(3*-4)").toBe("2*3*(-4)");
    expect(treeToJME(compile("2*(-3*4)") as Tree), "2*(-3*4)").toBe("2*(-3)*4");
    expect(simplifyExpression("(1/x)*x^2", "all", builtinScope), "(1/x)*x^2 - cancella le potenze").toBe("x");
    expect(simp("2/(3/x)", "all"), "2/(3/x) - denida le frazioni").toBe("2x/3");
    expect(simp("e^(100*500)", "all"), "non raccoglie i numeri se produrrebbe infinito").toBe("e^50000");
    expect(simp("9/sqrt(27)", "all,rationalDenominators,reduceSurds"), "razionalizza e riduce i radicali").toBe(
      "sqrt(3)",
    );
    expect(simp("sqrt(9x)", "all,reduceSurds"), "estrae il quadrato dal radicale").toBe("3*sqrt(x)");
    expect(simp("a/(b*sqrt(c))", "all,rationalDenominators"), "razionalizza i denominatori").toBe("a*sqrt(c)/(c*b)");

    const s2 = new Scope([builtinScope, { variables: { a: ev("1+8i") } }]);
    expect(treeToJME(substituteTree(compile("-a*3") as Tree, s2) as Tree), "meno unario di un complesso").toBe(
      "(-1 - 8i)*3",
    );

    expect(simp("1+(-i)*a", "basic"), "1+(-i)*a").toBe("1 - i*a");
    expect(simp("1+(-1/2*a*i)", "basic"), "1+(-1/2*a*i) con basic").toBe("1 - (1/2)a*i");
    expect(simp("1+(-1/2*a*i)", "all"), "1+(-1/2*a*i) con all").toBe("1 - (i/2)a");
    expect(simp("a - (-2i)*z", "all"), "a - (-2i)*z").toBe("a + 2i*z");
    let t = compile("a - w*conj(z)") as Tree;
    t = substituteTree(t, new Scope([{ variables: { w: ev("-2i") } }]), true) as Tree;
    const ruleset = collectRuleset("basic", builtinScope.allRulesets());
    expect(treeToJME(simplifyTree(t, ruleset, builtinScope))).toBe("a + 2i*conj(z)");
    expect(treeToJME({ tok: ev('dec("21131.33132")') }), 'dec("21131.33132")').toBe('dec("21131.33132")');

    const tree = compile("z^x") as Tree;
    (tree.args as Tree[])[1] = { tok: ev('(dec(e+pi)*10^-5) as "number"') };
    expect(treeToJME(tree, { nicenumber: false }), "parentesi attorno a un numero scientifico").toBe(
      "z^(5.8598744820488384*10^(-5))",
    );

    expect(treeToJME({ tok: ev("random_integer_partition(6,3)") }), "random_integer_partition").toBeTruthy();

    const subtree = (ev('expression("+{-5}*{4}*x^({-5})")') as { tree: Tree }).tree;
    const basic = collectRuleset("basic", builtinScope.allRulesets());
    expect(
      treeToJME(simplifyTree(subtree, basic, builtinScope)),
      "il bracketing dopo la sostituzione non persiste fra chiamate",
    ).toBe("-5*4*x^(-5)");

    expect(simp("V/(1/3)", "simplifyfractions"), "V/(1/3) con simplifyFractions").toBe("V*3/1");
    expect(simp("V/(1/3 * pi)", "simplifyfractions"), "V/(1/3 * pi) con simplifyFractions").toBe("V*3/(1pi)");
    expect(simp("a/(b/c*d)", "all"), "a/(b/c*d)").toBe("a*c/(b*d)");
    expect(simp('latex(safe("a + {x}"))'), "le stringhe con latex e safe restano tali").toBe('latex(safe("a + {x}"))');
  });

  // jme-tests.mjs:2600-2608
  it("Simplify surds", () => {
    expect(simp("sqrt(a)*x*sqrt(b)", "all")).toBe("sqrt(a*b)*x");
    expect(simp("sqrt(a)*(x*sqrt(b))", "all")).toBe("sqrt(a*b)*x");
    expect(simp("x/sqrt(a)*sqrt(b)", "all")).toBe("x*sqrt(b/a)");
  });

  // jme-tests.mjs:2610-2616
  it("brackets involving subtraction", () => {
    expect(simp("1 + (-a - 2b)")).toBe("1 - a - 2b");
  });

  // jme-tests.mjs:2618-2625 — upstream forza la notazione `plain-eu`; qui la
  // notazione è sempre `plain`, quindi il terzo assert dà `1.2y = 1.2y`
  // invece di `1,2y = 1.2y` (la parte che il test verifica — che
  // `string(expression(...))` NON sia localizzato — resta identica).
  it("localisation doesn't affect treeToJME", () => {
    expect(treeToJME(compile("1.234") as Tree), "1.234").toBe("1.234");
    expect(treeToJME({ tok: ev("3.1+2.3i") }), "3.1 + 2.3i").toBe("3.1 + 2.3i");
    expect(
      (ev('let(x,1.2, "{x}y = "+string(expression("{x}y")))') as { value: string }).value,
      "sostituisce un numero in un token expression",
    ).toBe("1.2y = 1.2y");
  });

  // jme-tests.mjs:2627-2648 — upstream forza notazione `eu` e separatore `;`.
  // Il motore non ha le globali di locale: i valori attesi sono quelli della
  // locale predefinita (separatore `,`, notazione `plain`).
  it("Localise number representation", () => {
    expect(tex("f(1,2,3)")).toBe("f \\left ( 1, 2, 3 \\right )");
    expect(tex("[1,2,3]")).toBe("\\left[ 1, 2, 3 \\right]");
    expect(tex("set(1,2,3)")).toBe("\\left\\{ 1, 2, 3 \\right\\}");
    expect(tex("set([1,2,3])")).toBe("\\left\\{ 1, 2, 3 \\right\\}");
    expect(tex("12345.6789")).toBe("12345.6789");
    expect((ev("scientificnumberlatex(12345)") as { value: string }).value).toBe("1.2345 \\times 10^{4}");
  });

  // Estensione del Task 9: adesso che il motore HA una macchina di
  // localizzazione (`setLocale`/`t`, usata da `loadQuestion`), si verifica che
  // NON tocchi la resa dei numeri — upstream sarebbe `Numbas.locale
  // .default_number_notation`/`default_list_separator` a cambiarla, e quelle
  // globali non sono portate (DIVERGENCES.md). La lingua sposta i messaggi,
  // non il LaTeX.
  it("cambiare lingua non cambia la resa dei numeri", () => {
    const renderings = () => [
      tex("f(1,2,3)"),
      tex("[1,2,3]"),
      tex("set(1,2,3)"),
      tex("12345.6789"),
      (ev("scientificnumberlatex(12345)") as { value: string }).value,
      treeToJME(compile("1.234") as Tree),
      (ev('let(x,1.2, "{x}y = "+string(expression("{x}y")))') as { value: string }).value,
    ];
    setLocale("it");
    const italian = renderings();
    const italianMessage = t("part.marking.correct");
    setLocale("en");
    expect(renderings(), "la resa LaTeX/JME non dipende dalla lingua").toEqual(italian);
    expect(t("part.marking.correct"), "i messaggi invece sì").not.toBe(italianMessage);
    expect(italian[3], "il separatore decimale resta il punto").toBe("12345.6789");
    expect(italian[0], "il separatore di lista resta la virgola").toContain(", ");
  });

  // jme-tests.mjs:2650-2655
  it("large product", () => {
    expect(
      simp("(x+1)(x-2)(x+3)(x+4)", "all,canonicalOrder,expandBrackets,!noLeadingMinus"),
      "prodotto grande con un termine negativo",
    ).toBe("x^4 + 6*x^3 + 3*x^2 - 26x - 24");
  });

  // jme-tests.mjs:2657-2691
  it("texName", () => {
    const names: Array<{ name: string; tex: string; annotations?: string[]; description?: string }> = [
      { name: "x", tex: "x" },
      { name: "x", annotations: ["op"], tex: "\\operatorname{x}" },
      { name: "xy", tex: "\\texttt{xy}" },
      { name: "xyz", tex: "\\texttt{xyz}" },
      { name: "x1", tex: "x_{1}" },
      { name: "x1234", tex: "x_{1234}" },
      { name: "x1'", tex: "x_{1}'" },
      { name: "x_1", tex: "x_{1}" },
      { name: "x_12345", tex: "x_{12345}" },
      { name: "x_123''", tex: "x_{123}''" },
      { name: "longname", tex: "\\texttt{longname}" },
      { name: "ab_cd_ef", tex: "\\texttt{ab\\_cd\\_ef}" },
      { name: "x_abc", tex: "\\texttt{x\\_abc}" },
      { name: "x_abc'", tex: "\\texttt{x\\_abc'}" },
      { name: "lambda", tex: "\\lambda" },
      { name: "lambda1", tex: "\\lambda_{1}" },
      { name: "lambda'", tex: "\\lambda'" },
      { name: "x_y'", tex: "x_{y}'" },
      { name: "x_lambda'", tex: "x_{\\lambda}'" },
      {
        name: "x_1",
        tex: "\\dot{x}_{1}",
        annotations: ["dot"],
        description: "le annotazioni valgono solo per la radice, non per i pedici",
      },
      { name: "ä_1", tex: "ä_{1}" },
      { name: "phi_ß", tex: "\\phi_{ß}" },
      { name: "_", tex: "\\texttt{\\_}" },
      { name: "_a", tex: "\\texttt{\\_a}" },
    ];

    const texifier = new Texifier();
    names.forEach((n) => {
      const tok = new TName(n.name, n.annotations);
      expect(texifier.texName(tok), n.description ?? `texName ${n.name}`).toBe(n.tex);
    });
  });

  // jme-tests.mjs:2693-2730
  it("texify", () => {
    /** `mixedfrac` upstream (2694-2696). */
    function mixedfrac(expr: string): string {
      return texify({ tok: ev(expr) }, { mixedfractions: true, fractionnumbers: true }, builtinScope);
    }
    /** `texify(tree, settings)` upstream (2697-2699). */
    function tx(tree: Tree, settings?: DisplaySettings): string {
      return texify(tree, settings, builtinScope);
    }
    expect(mixedfrac("1/2"), "1/2").toBe("\\frac{1}{2}");
    expect(mixedfrac("3/2"), "3/2").toBe("1 \\frac{1}{2}");
    expect(mixedfrac("-76/11"), "-76/11").toBe("-6 \\frac{10}{11}");
    expect(mixedfrac("1234567/123"), "1234567/123").toBe("10037 \\frac{16}{123}");
    expect(mixedfrac("3i/2"), "3i/2").toBe("1 \\frac{1}{2} i");

    const subexpr = ev('substitute(["c":expression("x+1")],expression("1/c"))');
    expect(tx((subexpr as { tree: Tree }).tree), "texify di un'espressione sostituita").toBe("\\frac{ 1 }{ x + 1 }");
    expect(tx({ tok: subexpr }), "texify funziona sulle TExpression").toBe("\\frac{ 1 }{ x + 1 }");

    expect(tx({ tok: ev("3-9*(11*(1/33))") }, { fractionnumbers: true }), "non meno zero").toBe("0");
    expect(tx(compile("-2x") as Tree), "-2x").toBe("-2 x");
    expect(tx(compile("-(x-2)e^x") as Tree), "-(x-2)e^x").toBe("-\\left ( x - 2 \\right ) e^{ x }");
    expect(tx(compile("+(x-2)e^x") as Tree), "+(x-2)e^x").toBe("+\\left ( x - 2 \\right ) e^{ x }");
    expect(tx({ tok: ev('latex("\\\\{"+1+"\\\\}")') }), "barre tolte prima delle graffe nel latex grezzo").toBe("{1}");
    expect(tx({ tok: ev('latex(safe("\\\\{"+1+"\\\\}"))') }), "barre mantenute nel latex safe").toBe("\\{1\\}");
    expect(tx({ tok: ev("set(1,2)") }), "texify di un insieme").toBe("\\left\\{ 1, 2 \\right\\}");
    expect(tx({ tok: ev("id(2)") }, { matrixcommas: true }), "id(2) con le virgole").toBe(
      "\\left ( \\begin{matrix} 1, & 0 \\\\ 0, & 1 \\end{matrix} \\right )",
    );
    expect(tx({ tok: ev("matrix([1,2])") }), "una matrice di una riga ha le virgole").toBe(
      "\\left ( \\begin{matrix} 1, & 2 \\end{matrix} \\right )",
    );
    expect(tx({ tok: ev("matrix([1,2])") }, { matrixcommas: false }), "matrixcommas: false").toBe(
      "\\left ( \\begin{matrix} 1 & 2 \\end{matrix} \\right )",
    );
    expect(tx({ tok: ev("vector(1,2)") }, { rowvector: true }), "vettore riga con le virgole").toBe(
      "\\left ( 1 , 2 \\right )",
    );
    expect(
      tx({ tok: ev("vector(1,2)") }, { rowvector: true, matrixcommas: false }),
      "vettore riga senza virgole",
    ).toBe("\\left ( 1 \\quad 2 \\right )");

    const tree = compile("a*b") as Tree;
    const scope = new Scope([builtinScope, { variables: { a: ev("-2"), b: ev("-3") } }]);
    const t2 = substituteTree(tree, scope) as Tree;
    expect(texify(t2, "", scope), "simbolo di moltiplicazione quando il destro è negativo").toBe("-2 \\times -3");
    expect(treeToJME(t2, "", scope), "simbolo di moltiplicazione quando il destro è negativo").toBe("-2(-3)");
  });

  // jme-tests.mjs:2732-2824
  it("expression to LaTeX", () => {
    expect(tex("-2+i"), "-2+i").toBe("-2 + i");
    expect(tex("1+i +(-2+2i)", "collectComplex"), "1+i +(-2+2i)").toBe("1 + i - 2 + 2 i");
    expect(tex("1-i +(-2+2i)", "collectComplex"), "1-i +(-2+2i)").toBe("1 - i - 2 + 2 i");
    expect(tex("10000000000000000000000000"), "notazione scientifica 1*10^25").toBe("1 \\times 10^{25}");
    expect(tex("47652000000000000000000000"), "notazione scientifica 4.7652*10^25").toBe("4.7652 \\times 10^{25}");
    expect(tex("ln(abs(x))"), "ln del valore assoluto senza parentesi").toBe("\\ln \\left | x \\right |");
    expect(tex("ln(x)"), "ln di altro con le parentesi").toBe("\\ln \\left ( x \\right )");
    expect(tex("4-(x^2+x+1)", []), "4-(x^2+x+1)").toBe("4 - \\left ( x^{ 2 } + x + 1 \\right )");
    expect(tex("(x^2+x+1)-4", []), "(x^2+x+1)-4").toBe("x^{ 2 } + x + 1 - 4");
    expect(tex("x-(-1.5)", "fractionNumbers,all"), "x-(-1.5) con [fractionNumbers,all]").toBe("x + \\frac{3}{2}");
    expect(tex("x-(5-p)", []), "x-(5-p)").toBe("x - \\left ( 5 - p \\right )");
    expect(tex("3*5^2*19", ["basic"]), "3*5^2*19 con basic").toBe("3 \\times 5^{ 2 } \\times 19");
    expect(tex("exp(x)^2"), "exp(x)^2").toBe("\\left ( e^{ x } \\right )^{ 2 }");
    expect(tex("-(-x)", []), "-(-x)").toBe("-\\left ( -x \\right )");
    expect(tex("+(-x)", []), "+(-x)").toBe("+\\left ( -x \\right )");
    expect(tex("3+(-2)", []), "3+(-2)").toBe("3 + \\left ( -2 \\right )");
    expect(tex("3-(-2)", []), "3-(-2)").toBe("3 - \\left ( -2 \\right )");
    expect(tex("2+(3+2)+(4-5)", []), "niente parentesi su somme e sottrazioni annidate").toBe("2 + 3 + 2 + 4 - 5");
    expect(tex("lambda1'(x)"), "texName funziona sui nomi di funzione").toBe("\\lambda_{1}' \\left ( x \\right )");
    expect(tex("lambda * theta"), "niente simbolo di moltiplicazione fra lettere greche").toBe("\\lambda \\theta");
    expect(tex("x * xy"), "simbolo di moltiplicazione con un nome lungo").toBe("x \\times \\texttt{xy}");
    expect(tex("long_function_name(x)"), "i nomi lunghi di funzione vanno in \\operatorname").toBe(
      "\\operatorname{long\\_function\\_name} \\left ( x \\right )",
    );
    expect(tex("fact(3)*fact(2)"), "simbolo per fra due fattoriali").toBe("3! \\times 2!");
    expect(tex("not a"), "NOT logico").toBe("\\neg a");
    expect(tex("7*(5x+y)"), "niente simbolo per quando c'è una parentesi").toBe("7 \\left ( 5 x + y \\right )");
    expect(tex("(5 + 9i)*(2 + 7)"), "parentesi attorno ai complessi in un prodotto").toBe(
      "\\left ( 5 + 9 i \\right ) \\left ( 2 + 7 \\right )",
    );
    expect(tex("(-7+9i)*(x+1)"), "non estrae il meno unario da un complesso").toBe(
      "\\left ( -7 + 9 i \\right ) \\left ( x + 1 \\right )",
    );
    expect(tex("(0.5)^3", "fractionNumbers"), "frazioni fra parentesi se elevate a potenza").toBe(
      "\\left ( \\frac{1}{2} \\right )^{ 3 }",
    );
    expect(tex("(5)^3", "fractionNumbers"), "niente parentesi sugli interi elevati a potenza").toBe("5^{ 3 }");
    expect(tex("(1+i)^3", "fractionNumbers"), "complessi fra parentesi se elevati a potenza").toBe(
      "\\left ( 1 + i \\right )^{ 3 }",
    );
    expect(tex("2*e^2")).toBe("2 e^{ 2 }");
    expect(tex("2 * pi")).toBe("2 \\pi");
    expect(tex("2 * e")).toBe("2 e");
    expect(tex("2*(i^3)")).toBe("2 i^{ 3 }");
    expect(tex("x*i")).toBe("x i");
    expect(tex("x*i", "alwaystimes")).toBe("x \\times i");
    expect(tex("2^3 * 2^3 * 2^3", "basic"), "moltiplicazioni consecutive").toBe(
      "2^{ 3 } \\times 2^{ 3 } \\times 2^{ 3 }",
    );
    expect(tex("sin(x)^5"), "funzione trigonometrica a potenza intera positiva").toBe("\\sin^{5}\\left( x \\right)");
    expect(tex("sin(x)^(-1)"), "funzione trigonometrica a potenza negativa").toBe("\\sin \\left ( x \\right )^{ -1 }");
    expect(tex("infinity", ""), "infinity").toBe("\\infty");
    expect(tex("infinity", "fractionNumbers"), "infinity con fractionNumbers").toBe("\\infty");
    expect(tex("e", "fractionNumbers"), "e con fractionNumbers").toBe("e");
    expect(tex("pi", "fractionNumbers"), "pi con fractionNumbers").toBe("\\pi");
    expect(tex("e^(3x)", "fractionNumbers"), "e^(3x) con fractionNumbers").toBe("e^{ 3 x }");
    expect(tex("e*i", ""), "e*i").toBe("e i");
    expect(tex("2/4", "flatFractions")).toBe("\\left. 2 \\middle/ 4 \\right.");
    expect(tex("(2 + 3)/(a + b)", "flatFractions")).toBe(
      "\\left. \\left ( 2 + 3 \\right ) \\middle/ \\left ( a + b \\right ) \\right.",
    );
    expect(tex("matrix([1,1]) + matrix([1]) + (-5)matrix([1])", "all")).toBe(
      "\\begin{pmatrix} 1, & 1 \\end{pmatrix} - 4 \\begin{pmatrix} 1 \\end{pmatrix}",
    );
    expect(tex("x*(x+1)", ""), "x*(x+1)").toBe("x \\times \\left ( x + 1 \\right )");
    expect(tex("-2x", "all"), "-2x").toBe("-2 x");
    expect(tex("Gamma gamma", ""), "Gamma gamma").toBe("\\Gamma \\gamma");
    expect(tex("1.2 pi", "fractionNumbers"), "1.2 pi con fractionNumbers").toBe("\\frac{6}{5} \\pi");
    expect(tex("set()"), "set()").toBe("\\left\\{  \\right\\}");
    expect(tex("set(1,2)"), "set(1,2)").toBe("\\left\\{ 1, 2 \\right\\}");
    expect(tex("set([1,2])"), "set([1,2])").toBe("\\left\\{ 1, 2 \\right\\}");
    expect(tex("set([[1,2]])"), "set([[1,2]])").toBe("\\left\\{ \\left[ 1, 2 \\right] \\right\\}");

    const s = new Scope([builtinScope, { variables: { a: ev("1+8i"), b: ev("6+11i") } }]);
    expect(texify(substituteTree(compile("-a") as Tree, s) as Tree), "meno unario di un complesso").toBe("-1 -8 i");
    expect(
      texify(substituteTree(compile("(-a)*(-b)") as Tree, s) as Tree),
      "meno unario di un complesso e parentesi",
    ).toBe("\\left ( -1 -8 i \\right ) \\left ( -6 -11 i \\right )");
    expect(texify(substituteTree(compile("a*b") as Tree, s) as Tree), "complesso e parentesi").toBe(
      "\\left ( 1 + 8 i \\right ) \\left ( 6 + 11 i \\right )",
    );

    const sd = new Scope([builtinScope, { variables: { a: ev("1+dec(8)i"), b: ev("6+dec(11)i") } }]);
    expect(texify(substituteTree(compile("-a") as Tree, sd) as Tree), "meno unario di un complesso decimale").toBe(
      "-1 -8 i",
    );
    expect(
      texify(substituteTree(compile("(-a)*(-b)") as Tree, sd) as Tree),
      "meno unario di un complesso decimale e parentesi",
    ).toBe("\\left ( -1 -8 i \\right ) \\left ( -6 -11 i \\right )");
    expect(texify(substituteTree(compile("a*b") as Tree, sd) as Tree), "complesso decimale e parentesi").toBe(
      "\\left ( 1 + 8 i \\right ) \\left ( 6 + 11 i \\right )",
    );

    expect(tex("root(x,2)"), "root(x,2) equivale a sqrt(x)").toBe(tex("sqrt(x)"));
    expect(tex("root(x,3)"), "root(x,3)").toBe("\\sqrt[3]{ x }");
    expect(tex("root(x,z)"), "root(x,z)").toBe("\\sqrt[z]{ x }");
  });

  // Divergenza dal comportamento upstream, registrata in DIVERGENCES.md:
  // verificato sul runtime upstream (`packages/engine/oracle`, commit
  // 0f0ea33) che `exprToLaTeX("sqrt()", ...)` rende anche lì
  // `"\\sqrt{ undefined }"` invece di lanciare — `texOps.sqrt` (jme-display.js
  // e qui `display-tex.ts`) indicizza `texArgs[0]` senza controllare che ci
  // sia davvero un argomento. Qui `texFunction` verifica prima che almeno un
  // overload registrato di quel nome accetti il numero di argomenti dato.
  it("una funzione chiamata con troppi pochi argomenti lancia invece di rendere \"undefined\"", () => {
    raisesJmeError(() => tex("sqrt()"), "jme.display.wrong number of arguments", "sqrt()");
    raisesJmeError(() => tex("abs()"), "jme.display.wrong number of arguments", "abs()");
    raisesJmeError(() => tex("mod(1)"), "jme.display.wrong number of arguments", "mod(1)");
    // gli usi validi non sono toccati: `set()` è variadico (0 o più elementi).
    expect(tex("sqrt(4)"), "sqrt(4) continua a rendere").toBe("\\sqrt{ 4 }");
    expect(tex("set()"), "set() resta valido (variadico)").toBe("\\left\\{  \\right\\}");
  });

  // jme-tests.mjs:2826-2830
  it("Tree to LaTeX", () => {
    const tree = compile("2*x") as Tree;
    (tree.args as Tree[])[1] = { tok: ev('expression("x+2")') };
    expect(treeToLaTeX(tree, "", builtinScope), "treeToLaTeX con un argomento sotto-espressione").toBe(
      "2 \\left ( x + 2 \\right )",
    );
  });
});
