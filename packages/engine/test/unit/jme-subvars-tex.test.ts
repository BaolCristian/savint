// @vitest-environment node
/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Traduzione di `Subvars > subvars` (tests/jme/jme-tests.mjs:83-94), rimandata
// dal Task 2 perché `jme.subvars` passa dal gancio `displayHooks.treeToJME`,
// più la copertura di `contentsubvars` sui comandi `\var{}`/`\simplify{}`, che
// passano da `texify`/`exprToLaTeX`.
//
// `Subvars > findvars` (95-119) è già tradotto dal Task 4 in
// builtins-control-flow.test.ts (`Compiling > findvars`), compreso l'assert
// che cerca le variabili dentro `\var{}`/`\simplify{}`; l'ultimo assert
// (funzioni JME ricorsive) ha bisogno di `jme.variables.makeFunction`, che
// arriva col Task 6. `findvars in HTML` (120-128) usa `DOMcontentsubber`, che
// non si porta (vedi DIVERGENCES.md).

import { describe, expect, it } from "vitest";
import { builtinScope } from "../../src/jme/builtins";
import { Scope } from "../../src/jme/scope";
import { TNum } from "../../src/jme/tokens";
import { contentsubvars, displayHooks, subvars, texsplit } from "../../src/jme/subvars";
import { raisesJmeError } from "./jme-helpers";
// riempie `displayHooks`: senza questo import i rami di visualizzazione di
// `subvars`/`contentsubvars` lanciano `jme.subvars.display not available`.
import "../../src/jme/display";

describe("Subvars", () => {
  // Non c'è un test upstream corrispondente: verifica il meccanismo che
  // sostituisce la dipendenza in avanti `jme.js → jme-display.js`
  // (DIVERGENCES.md, riga "Dipendenza `jme → jme.display`").
  it("importare il modulo jme riempie tutti i ganci di visualizzazione", async () => {
    await import("../../src/jme");
    expect(Object.keys(displayHooks).sort()).toEqual([
      "collectRuleset",
      "exprToLaTeX",
      "subvars",
      "texify",
      "treeToJME",
    ]);
  });

  // jme-tests.mjs:83-93
  it("subvars", () => {
    expect(subvars("{1}a{", builtinScope, true), "lascia stare le graffe non chiuse").toBe("1a{");
    expect(subvars("e^{-{2}5}", builtinScope, true), "e^{-{2}5} - graffe annidate sostituite da parentesi").toBe(
      "e^-10",
    );
    expect(subvars("{\"hi'\"}", builtinScope), "{\"hi'\"} - fa l'escape delle stringhe").toBe("'hi\\''");
    const scope = new Scope([builtinScope, { variables: { x: new TNum(2) } }]);
    expect(subvars("e^{-{x}x}", scope, true), "e^{-{x}x} - graffe annidate sostituite da parentesi").toBe("e^-4");
    expect(subvars("{4/4}x", scope, true), "{4/4}x - riduce i razionali").toBe("1x");
    expect(subvars("x/{1/2}", scope), "x/{1/2} - parentesi attorno ai razionali").toBe("x/(1/2)");
    expect(
      subvars("{0.0048000000000000004}", scope),
      "{0.0048000000000000004} - niente notazione scientifica",
    ).toBe("(0.0048000000000000004)");
    expect(
      subvars('{split("02(x)02","{x}")}', scope),
      '{split("02(x)02","{x}")} - graffe dentro una stringa',
    ).toBe('[ "0", "(x)0", "" ]');
  });

  // jme.js:406-435 — i due comandi TeX di `contentsubvars`, che passano da
  // `texify` (`\var`) e `exprToLaTeX` (`\simplify`).
  it("contentsubvars sostituisce \\var e \\simplify dentro il TeX", () => {
    const scope = new Scope([builtinScope, { variables: { x: new TNum(2) } }]);
    expect(contentsubvars("valore: $\\var{x+1}$", scope, true), "\\var{}").toBe("valore: ${3}$");
    expect(contentsubvars("espressione: $\\simplify{1*x + 0}$", scope, true), "\\simplify{}").toBe(
      "espressione: ${x}$",
    );
    expect(contentsubvars("fuori {x} dalla matematica", scope, true), "sostituzione fuori dal TeX").toBe(
      "fuori 2 dalla matematica",
    );
  });

  // Divergenza dal comportamento upstream, registrata in DIVERGENCES.md:
  // `Scope.evaluate` dichiara `Token | null`, quindi `subvars` e
  // `contentsubvars` intercettano la sostituzione nulla invece di propagare un
  // `TypeError` da un `undefined` (upstream jme.js:420 non controlla nulla).
  it("una sostituzione nulla è un errore, non un undefined", () => {
    raisesJmeError(
      () => contentsubvars("$\\var{}$", builtinScope, true),
      "jme.subvars.null substitution",
      "\\var{} vuoto",
    );
  });

  // Divergenza dal comportamento upstream, registrata in DIVERGENCES.md:
  // `cmdre` upstream (jme.js:444) è `/^((?:.|[\n\r])*?)\\(var|simplify)/m`, che
  // riconosce `\var` come prefisso letterale — verificato sul runtime upstream
  // (`packages/engine/oracle`, commit 0f0ea33): `texsplit("\\varphi")` lancia
  // `jme.texsubvars.missing parameter` anche lì, perché `\varphi` (notazione
  // trigonometrica ordinaria) comincia con quelle quattro lettere. Qui `\var`
  // e `\simplify` sono riconosciuti solo quando non proseguono in altre
  // lettere (lookahead negativo `(?![a-zA-Z])`): `\varphi`, `\varepsilon`,
  // `\vartheta`, `\varsigma`, `\varrho`, `\varpi` passano intatti.
  it("\\varphi e le altre lettere greche \"var*\" non sono scambiate per \\var", () => {
    for (const greek of ["\\varphi", "\\varepsilon", "\\vartheta", "\\varsigma", "\\varrho", "\\varpi"]) {
      expect(texsplit(greek), `texsplit(${greek})`).toEqual([greek]);
    }
    const scope = new Scope([builtinScope, { variables: { x: new TNum(2) } }]);
    expect(
      contentsubvars("l'angolo $\\varphi$ e $\\vartheta$", scope, true),
      "\\varphi/\\vartheta passano intatti dentro il TeX",
    ).toBe("l'angolo $\\varphi$ e $\\vartheta$");
  });

  // Upstream non tollera spazi fra `\var`/`\simplify` e la graffa (o la
  // parentesi quadra) che apre l'argomento: verificato sul runtime upstream,
  // `texsplit("\\var {a}")` lancia `jme.texsubvars.missing parameter` anche
  // lì. Il lookahead della riga sopra non introduce questa tolleranza: uno
  // spazio non è una lettera, quindi `\var` è ancora riconosciuto come
  // comando, e la graffa mancante lancia come prima.
  it("uno spazio fra \\var e la graffa resta un errore, come upstream", () => {
    raisesJmeError(() => texsplit("\\var {a}"), "jme.texsubvars.missing parameter", "\\var {a}");
  });

  it("\\var{} e \\simplify{} continuano a funzionare dopo la correzione", () => {
    expect(texsplit("\\var{a}")).toEqual(["", "var", "all", "a", ""]);
    expect(texsplit("\\simplify{a}")).toEqual(["", "simplify", "all", "a", ""]);
  });
});
