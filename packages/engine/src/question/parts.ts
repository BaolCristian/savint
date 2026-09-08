/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// question.js:628-644 (istanziazione delle parti), 689-723 (`addPart`,
// `allParts`, `setErrorCarriedForwardBackReferences`), 893-899 (assegnazione
// dei nomi), 1202-1213 (`getPart`).
//
// Il ramo `partsMode: 'explore'` (`addExtraPart`, question.js:426-458 e
// 673-687) non è portato: decisione 1 del brief.

import { createPartFromJSON, type PartBase, type PartContext, type PartJSON } from "../parts";
import { substituteHtml } from "../variables";

// question.js:628-643, ramo `case 'all'`
/** Costruisce le parti di primo livello dalla loro definizione JSON. */
export function createParts(definitions: PartJSON[], ctx: PartContext): PartBase[] {
  return definitions.map((pd, i) => createPartFromJSON(i, pd, "p" + i, ctx));
}

// question.js:701-710
/** Tutte le parti a cui lo studente può rispondere: quelle di primo livello e
 * i loro gap. (Upstream include anche gli `steps`, che non sono portati; le
 * alternative sono escluse anche upstream.) */
export function allParts(parts: PartBase[]): PartBase[] {
  return parts.reduce<PartBase[]>((out, p) => out.concat([p], p.gaps, p.steps), []);
}

// question.js:893-898
/** Assegna i nomi visibili alle parti, ricorsivamente su gap e alternative. */
export function assignPartNames(parts: PartBase[]): void {
  let i = 0;
  parts.forEach((p) => {
    const hasName = p.assignName(i, parts.length - 1);
    i += hasName ? 1 : 0;
  });
}

// question.js:689-698
/** Per ogni parte, registra sulle parti da cui dipende (per sostituzione di
 * variabile) che questa va rinviata quando cambiano. */
export function setErrorCarriedForwardBackReferences(
  parts: PartBase[],
  getPart: (path: string) => PartBase | undefined,
): void {
  allParts(parts).forEach((p) => {
    p.settings.errorCarriedForwardReplacements.forEach((r) => {
      // upstream: question.js:695 fa `q.getPart(r.part)`, che LANCIA
      // `question.no such part` se la parte non esiste: caricare una domanda
      // con un riferimento sbagliato fallirebbe. Qui `getPart` ritorna
      // `undefined` (contratto del Task 8) e il riferimento è ignorato:
      // l'errore arriva comunque, ma alla correzione, come
      // `part.marking.variable replacement part not found`. Vedi
      // DIVERGENCES.md.
      const p2 = getPart(r.part);
      if (p2) {
        p2.errorCarriedForwardBackReferences[p.path] = true;
      }
    });
  });
}

/** Sostituisce le variabili nel `prompt` di ogni parte (gap e alternative
 * comprese).
 *
 * upstream: non ha un equivalente in `question.js` — il `prompt` è sostituito
 * dal tema al momento di costruire l'HTML (`display/part.js`), con
 * `jme.contentsubvars` sullo scope della parte. Qui la sostituzione avviene
 * una volta sola al caricamento, perché il motore non ha un display.
 * Vedi DIVERGENCES.md.
 *
 * `error` è `Question#error` del chiamante (giro di correzioni 1): senza
 * avvolgere `substituteHtml` con esso, un difetto di sostituzione nella
 * consegna di una parte arriva senza dire QUALE parte — qui la chiave
 * `question.error in part prompt` nomina il suo percorso (`p.path`), e la
 * catena resta intera (la causa vera è ancora raggiungibile da
 * `engineErrorKeys`). */
export function substitutePartPrompts(
  parts: PartBase[],
  error: (message: string, args?: Record<string, string | number>, originalError?: unknown) => never,
): void {
  const visit = (p: PartBase): void => {
    if (p.promptHtml) {
      try {
        p.promptHtml = substituteHtml(p.promptHtml, p.getScope());
      } catch (e) {
        error("question.error in part prompt", { path: p.path }, e);
      }
    }
    p.gaps.forEach(visit);
    p.alternatives.forEach(visit);
  };
  parts.forEach(visit);
}
