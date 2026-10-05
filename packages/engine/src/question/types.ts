/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// La forma del JSON di una domanda (i 24 campi letti da `loadFromJSON`,
// question.js:495-645 — inventario 06 §2), le opzioni di caricamento e lo
// stato serializzabile.
//
// I campi di sola redazione (`metadata`, `ungrouped_variables`,
// `variable_groups`, e `group`/`description`/`templateType` dentro una
// definizione di variabile) sono dichiarati ma **mai letti**: stanno qui solo
// perché un export dell'editor li contiene e il tipo deve accettarlo.

import type { Complex } from "../math/types";
import type { Locale } from "../i18n";
import type { Answer, PartJSON } from "../parts/types";

/** Un valore JME "spacchettato" (`jme.unwrapValue`, jme.js:3390-3420): quel
 * che l'API pubblica restituisce per `Question#variables`. */
export type JMEValue =
  | number
  | bigint
  | string
  | boolean
  | Complex
  | JMEValue[]
  | { [k: string]: JMEValue }
  | null;

/** Le opzioni di `loadQuestion`. */
export interface LoadOptions {
  /** Il seme del generatore casuale: due caricamenti con lo stesso seme danno
   * le stesse variabili.
   *
   * upstream: non ha equivalente — `Math.random` non è seminato per domanda
   * (inventario 06 §3 punto 5). Vedi DIVERGENCES.md. */
  seed: string;
  /** La lingua dei messaggi della domanda. Se manca, si usa la lingua
   * predefinita del processo al momento del caricamento (`getLocale()`,
   * `"it"` finché nessuno chiama `setLocale`).
   *
   * La lingua resta poi legata alla domanda — viaggia sul suo `Scope` — e non
   * cambia più: caricare un'altra domanda in un'altra lingua, o cambiare la
   * predefinita, non tocca le correzioni di questa. */
  locale?: Locale | undefined;
  /** Lo stile dei numeri MOSTRATI dalla domanda (es. `"plain-eu"`: 48,5).
   * Se manca, il punto, come upstream. Non tocca la correzione: il codice
   * JME resta col punto. Vedi DIVERGENCES.md, «Stile dei numeri mostrati». */
  numberStyle?: string | undefined;
  /** Permettere le funzioni personalizzate scritte in JavaScript
   * (`language: "javascript"`)? Predefinito `true`. */
  allowJavascriptFunctions?: boolean | undefined;
  /** Caricare comunque una domanda con `preamble.js` non vuoto, ignorandolo
   * con un avviso? Predefinito `false` (il caricamento fallisce). */
  ignorePreamble?: boolean | undefined;
}

/** La definizione di una variabile di domanda (question.js:618-622).
 *
 * La chiave esterna dell'oggetto `variables` non è mai letta: conta solo
 * `.name` (question.js:621 fa `Object.values(variables)`). */
export interface QuestionVariableJSON {
  /** Il nome della variabile, o l'elenco `"a,b"` per l'assegnazione multipla. */
  name: string;
  /** L'espressione JME che la definisce. */
  definition: string;
  /** Solo per l'editor: il gruppo in cui mostrarla. Non letto. */
  group?: string;
  /** Solo per l'editor: la descrizione. Non letto. */
  description?: string;
  /** Solo per l'editor: il tipo del modello. Non letto. */
  templateType?: string;
  /** Solo per l'editor: la variabile può essere sovrascritta? Non letto. */
  can_override?: boolean;
}

/** La definizione di una funzione personalizzata (question.js:564-582).
 *
 * `parameters` è un array di coppie `[nome, tipo]`, tradotto in
 * `{name, type}` da `loadQuestion`. */
export interface QuestionFunctionJSON {
  /** I parametri, come coppie `[nome, tipo]`. */
  parameters: Array<[string, string]>;
  /** Il tipo del valore di ritorno. `"promise"` non è supportato. */
  type: string;
  /** Il linguaggio della definizione. */
  language: "jme" | "javascript";
  /** Il corpo della funzione. */
  definition: string;
}

/** La definizione di una costante personalizzata (question.js:561). */
export interface QuestionConstantJSON {
  /** Il nome (o i nomi, separati da virgola). */
  name: string;
  /** Il valore: un'espressione JME. */
  value: string;
  /** La resa LaTeX del nome. */
  tex?: string;
  /** La costante è attiva? Predefinito `true`. */
  enabled?: boolean;
}

/** Il JSON di una domanda Numbas, percorso JSON (inventario 06 §2). */
export interface NumbasQuestionJSON {
  /** Il nome della domanda. Le `{variabili}` sono sostituite dopo la
   * generazione (question.js:888). */
  name?: string;
  /** Un nome alternativo scelto dall'autore. */
  customName?: string;
  /** Come si generano le parti. Solo `"all"` è supportato (decisione 1). */
  partsMode?: "all" | "explore";
  /** Punteggio massimo esplicito in modalità explore. Ignorato. */
  maxMarks?: number | string;
  /** Quando mostrare gli obiettivi. Ignorato. */
  objectiveVisibility?: "always" | "when-active";
  /** Quando mostrare le penalità. Ignorato. */
  penaltyVisibility?: "always" | "when-active";
  /** Mostrare tutte le parti insieme in modalità explore. Ignorato. */
  showAllParts?: boolean;
  /** L'enunciato, in HTML. */
  statement?: string;
  /** Il testo di aiuto, in HTML. */
  advice?: string;
  /** Etichette libere: conservate, mai lette dal motore. */
  tags?: string[];
  /** Le estensioni JavaScript richieste. Non supportate (decisione 3). */
  extensions?: string[];
  /** Quali costanti builtin abilitare o disabilitare. */
  builtin_constants?: Record<string, boolean>;
  /** Le costanti personalizzate. */
  constants?: QuestionConstantJSON[];
  /** Le funzioni personalizzate, per nome. */
  functions?: Record<string, QuestionFunctionJSON>;
  /** I ruleset di semplificazione, per nome. */
  rulesets?: Record<string, string[]>;
  /** Gli obiettivi della modalità explore. Ignorati. */
  objectives?: Array<{ name?: string; limit?: number | string; mode?: string }>;
  /** Le penalità della modalità explore. Ignorate. */
  penalties?: Array<{ name?: string; limit?: number | string; mode?: string }>;
  /** Le definizioni delle variabili. L'ordine di inserimento delle chiavi
   * determina l'ordine dei sorteggi casuali (inventario 06 §8). */
  variables?: Record<string, QuestionVariableJSON>;
  /** La condizione che le variabili generate devono soddisfare. */
  variablesTest?: { condition?: string; maxRuns?: number | string };
  /** Le definizioni delle parti. */
  parts?: PartJSON[];
  /** Il preambolo. `js` non è supportato (decisione 2), `css` è ignorato. */
  preamble?: { js?: string; css?: string };
  /** Solo per l'editor: descrizione e licenza. Non letto. */
  metadata?: Record<string, unknown>;
  /** Solo per l'editor: le variabili non raggruppate. Non letto. */
  ungrouped_variables?: string[];
  /** Solo per l'editor: i gruppi di variabili. Non letto. */
  variable_groups?: unknown[];
  /** Gli altri campi di un export dell'editor, ignorati. */
  [k: string]: unknown;
}

/** Lo stato di una parte, dentro `QuestionState`.
 *
 * Deriva da `part_suspend_data` (storage.js:463-530), semplificato: il port
 * rigenera le variabili dal seme, quindi non deve salvare né i valori delle
 * variabili né la risposta corretta. */
export interface PartState {
  /** Il percorso della parte, es. `"p0"` o `"p0g1"`. */
  path: string;
  /** La parte ha ricevuto una risposta correggibile? */
  answered: boolean;
  /** Il punteggio ottenuto. */
  score: number;
  /** Il punteggio massimo disponibile. */
  marks: number;
  /** L'ultima risposta registrata, nella forma che `storeAnswer` ha prodotto
   * (per le scelte multiple, sempre la matrice `ticks`). */
  answer?: Answer;
  /** Lo stato dei gap, se la parte è un `gapfill`. */
  gaps?: PartState[];
}

/** Lo stato serializzabile di una domanda.
 *
 * Deriva da `question_suspend_data` (storage.js:405-461) **senza** il
 * dizionario `variables`: le variabili si rigenerano dal seme (inventario 06
 * §9). Tutto è JSON-serializzabile. */
export interface QuestionState {
  /** Il seme con cui rigenerare le variabili. */
  seed: string;
  /** Tutte le parti sono state risposte? */
  answered: boolean;
  /** Quante volte la domanda è stata inviata per intero. */
  submitted: number;
  /** Il testo di aiuto è stato mostrato? */
  adviceDisplayed: boolean;
  /** Le risposte corrette sono state rivelate? */
  revealed: boolean;
  /** Il punteggio totale. */
  score: number;
  /** Il punteggio massimo totale. */
  marks: number;
  /** Lo stato delle parti di primo livello. */
  parts: PartState[];
}

/** I nomi definiti dalla domanda (question.js:871-879): li legge il tipo di
 * parte `jme` per non far usare allo studente le variabili della domanda. */
export interface LocalDefinitions {
  /** I nomi delle variabili definite dalla domanda. */
  variables: string[];
  /** I nomi delle funzioni personalizzate. */
  functions: string[];
  /** I nomi dei ruleset personalizzati. */
  rulesets: string[];
}
