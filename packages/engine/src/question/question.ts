/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// question.js:61-105 (costruttore), 241-260 (`error`), 772-918
// (`finaliseLoad`, senza display/storage), 1202-1213 (`getPart`), 1237-1290
// (`getAdvice`, `lock`, `revealAnswer`), 1409-1447 (`submit`, `updateScore`).
//
// upstream: l'orchestrazione passa da `Numbas.schedule.SignalBox`, un grafo di
// Promise cablato in `finaliseLoad`. Qui è una sequenza sincrona nello stesso
// ordine di dipendenza — inventario 06 §8: preambolo → costanti → funzioni →
// ruleset → `variablesTodo` → generazione → scope finale → parti → punteggio.
// Vedi DIVERGENCES.md.
//
// upstream: `regenerate(seed)` non ha un equivalente (inventario 06 §3 punto 5)
// — si ricrea la domanda da zero, perché `Math.random` non è seminato per
// domanda. Qui è la stessa cosa, ma con un seme esplicito.

import { JmeError } from "../jme/errors";
import { engineErrorKeys } from "../errors";
import { getLocale, t, type Locale } from "../i18n";
import type { Scope } from "../jme/scope";
import { contentsubvars } from "../jme/subvars";
import { substituteHtml } from "../variables";
import type { PartBase, PartContext } from "../parts";
import { buildQuestionScope, parseQuestionJSON, type ParsedQuestion } from "./load";
import { allParts, assignPartNames, createParts, setErrorCarriedForwardBackReferences, substitutePartPrompts } from "./parts";
import { calculateScore, isDirty, submitAllParts, validate, type QuestionScore } from "./scoring";
import { applyQuestionState, questionToState } from "./state";
import type { JMEValue, LoadOptions, LocalDefinitions, NumbasQuestionJSON, QuestionState } from "./types";
import { buildVariablesTodo, finaliseVariableScope, generateVariables, type VariablesTodo } from "./variables";

/**
 * Una domanda Numbas caricata da JSON: variabili generate, parti costruite,
 * punteggio aggiornato.
 *
 * Costruirla esegue tutto il caricamento (upstream: `new Question(...)` +
 * `loadFromJSON` + `finaliseLoad` + `generateVariables` + l'attesa del signal
 * `ready`). Non c'è nessuna fase asincrona.
 */
export class Question {
  /** Il seme con cui le variabili sono state generate. */
  readonly seed: string;
  /** Il numero della domanda dentro l'esame. Il motore non compone esami: è
   * sempre 0, ma entra in `full_path` delle parti e nel messaggio d'errore. */
  readonly number = 0;
  /** Il nome della domanda, con le variabili già sostituite. */
  readonly name: string;
  /** Il nome scelto dall'autore, grezzo. */
  readonly customName: string;
  /** L'autore ha dato un nome proprio alla domanda, invece di lasciare quello
   * generato? (decisione 10)
   *
   * Il motore non la usa: serve a chi mostra la domanda, per decidere se
   * stampare `name` o un'etichetta propria ("Domanda 3"). È `customName !== ""`
   * — upstream il percorso JSON non la calcola mai (question.js:280-283 è solo
   * il percorso XML). */
  readonly hasCustomName: boolean;
  /** L'enunciato, con le variabili già sostituite. */
  readonly statementHtml: string;
  /** Il testo di aiuto, con le variabili già sostituite. */
  readonly adviceHtml: string;
  /** Le etichette libere del JSON. */
  readonly tags: string[];
  /** I valori delle variabili generate, "spacchettati". */
  readonly variables: Record<string, JMEValue>;
  /** Le parti di primo livello. */
  readonly parts: PartBase[];
  /** Lo scope JME della domanda: builtin → costanti/funzioni/ruleset →
   * variabili generate. */
  readonly scope: Scope;
  /** Il grafo delle variabili: lo legge `remakeVariables` per la correzione
   * adattiva. */
  readonly variablesTodo: VariablesTodo;
  /** I nomi definiti dalla domanda (question.js:871-879). */
  readonly local_definitions: LocalDefinitions;
  /** Le parti per percorso (`"p0"`, `"p0g1"`): la riempiono le parti stesse
   * mentre si costruiscono (part.js:174-176). */
  readonly partDictionary: Record<string, PartBase> = {};

  /** Tutte le parti sono state risposte (o non valgono punti)? */
  answered = false;
  /** Quante volte la domanda è stata inviata per intero. */
  submitted = 0;
  /** Il testo di aiuto è stato mostrato? */
  adviceDisplayed = false;
  /** Le risposte corrette sono state rivelate? */
  revealed = false;
  /** La domanda è bloccata (nessuna risposta ulteriore è accettata)? */
  locked = false;

  /** La lingua dei messaggi di questa domanda: quella indicata a
   * `loadQuestion`, o la predefinita del processo al momento del caricamento.
   * È la stessa che porta `this.scope` e ogni scope che ne discende. */
  readonly locale: Locale;

  /** Il JSON da cui la domanda è stata caricata: serve a `regenerate`. */
  private readonly json: NumbasQuestionJSON;
  /** Le opzioni di caricamento: servono a `regenerate`. */
  private readonly options: LoadOptions;
  /** Il punteggio corrente, ricalcolato da `updateScore`. */
  private currentScore: QuestionScore = { score: 0, marks: 0 };

  constructor(json: NumbasQuestionJSON, opts: LoadOptions) {
    // upstream: la lingua è quella globale di `Numbas.locale`, scelta
    // dall'esame. Decisione 11 del brief: la sceglie chi carica la domanda.
    // Qui viene fissata una volta sola e portata dallo scope della domanda
    // (`Scope.locale`), non da una globale del modulo: due domande caricate in
    // lingue diverse restano ciascuna nella propria, e `setLocale` resta solo
    // la predefinita per chi non ne indica nessuna. Vedi DIVERGENCES.md.
    this.locale = opts.locale ?? getLocale();
    this.json = json;
    // le opzioni memorizzate portano la lingua già risolta, così `regenerate`
    // ricostruisce la domanda nella stessa lingua anche se nel frattempo la
    // predefinita del processo è cambiata.
    this.options = { ...opts, locale: this.locale };
    this.seed = opts.seed;

    const parsed: ParsedQuestion = parseQuestionJSON(json, this.options);
    this.customName = parsed.customName;
    this.hasCustomName = parsed.hasCustomName;
    this.tags = parsed.tags;

    // question.js:789-808 — costanti, funzioni, ruleset, in quest'ordine.
    const questionScope = buildQuestionScope(parsed, this.options, this);

    // question.js:809-842
    this.variablesTodo = buildVariablesTodo(parsed.variableDefinitions, questionScope, (m, a, c) => this.error(m, a, c));
    // question.js:844-867
    const generated = generateVariables(this.variablesTodo, questionScope, parsed.variablesTest, (m, a, c) =>
      this.error(m, a, c),
    );
    // question.js:868-886
    const finalised = finaliseVariableScope(generated.scope);
    this.scope = finalised.scope;
    this.variables = finalised.unwrappedVariables;
    this.local_definitions = {
      variables: parsed.variableDefinitions.map((d) => d.name).filter((n) => n.trim() !== ""),
      // upstream: `functions: Object.keys(q.functionsTodo)` (question.js:877).
      // `functionsTodo` è un ARRAY (question.js:566), quindi `Object.keys` dà
      // gli indici `"0"`, `"1"`, ... — nomi che non esistono. Chi legge
      // `local_definitions.functions` se ne accorge: `scope.unset(...)`
      // (parts/jme-part.ts) cancella per nome e quindi upstream non cancella
      // NIENTE, e il valore `question_definitions` passato agli algoritmi di
      // correzione personalizzati (parts/mark.ts) elenca indici. Qui ci vanno i
      // nomi veri. Vedi DIVERGENCES.md.
      functions: parsed.functionsTodo.map((f) => f.name),
      rulesets: Object.keys(parsed.rulesets),
    };

    // question.js:887-889 — il nome passa per la sostituzione delle variabili
    // (testo semplice: upstream chiama `contentsubvars` senza `sub_tex`).
    this.name = contentsubvars(parsed.name, this.scope);
    // upstream: enunciato e aiuto restano grezzi sulla domanda e li sostituisce
    // il tema mentre costruisce l'HTML. Decisione 8 del brief: qui passano per
    // `substituteHtml` una volta sola, e le formule restano LaTeX dentro
    // `\(...\)`/`\[...\]`, senza MathJax. Vedi DIVERGENCES.md.
    //
    // Giro di correzioni 1: `substituteHtml` può lanciare (un `\simplify{}`
    // che non compila, o — dal fix di `jme.display.wrong number of
    // arguments` — un'arità sbagliata dentro un blocco matematico). Senza
    // l'avvolgimento in `this.error(...)`, come già fa `buildVariablesTodo`
    // due righe sopra per le definizioni di variabile (`variable.error in
    // variable definition`), l'errore arriva senza dire in quale campo si
    // trova: qui lo dice, mantenendo la catena intera (`this.error` non
    // sostituisce la causa, la avvolge — la chiave originale resta
    // raggiungibile da `engineErrorKeys`).
    try {
      this.statementHtml = substituteHtml(parsed.statement, this.scope);
    } catch (e) {
      this.error("question.error in statement", undefined, e);
    }
    try {
      this.adviceHtml = substituteHtml(parsed.advice, this.scope);
    } catch (e) {
      this.error("question.error in advice", undefined, e);
    }

    // question.js:628-644 (il ramo `case 'all'`), poi 893-898 e 690-698.
    this.parts = createParts(parsed.parts, this.partContext());
    assignPartNames(this.parts);
    substitutePartPrompts(this.parts, (m, a, c) => this.error(m, a, c));
    setErrorCarriedForwardBackReferences(this.parts, (path) => this.getPart(path));

    // question.js:912-914 — il signal `ready` chiama `updateScore`.
    this.updateScore();
  }

  /** Il contesto da passare alle parti: lo scope della domanda e la domanda
   * stessa (`PartContext.questionRef`, Task 8).
   *
   * La lingua non compare qui: la porta lo scope. */
  private partContext(): PartContext {
    return { scope: this.scope, questionRef: this };
  }

  // question.js:241-260
  /** Lancia un errore attribuito a questa domanda.
   *
   * Come upstream, l'errore esterno ha sempre la chiave `question.error` e
   * quello originale resta nella catena (`engineErrorKeys`). */
  error(message: string, args?: Record<string, string | number>, originalError?: unknown): never {
    if (originalError && engineErrorKeys(originalError)[0] === "question.error") {
      throw originalError;
    }
    const nmessage = t(message, args, this.locale);
    // upstream: question.js:255-258 vorrebbe conservare la catena
    // (`[message].concat(originalError.originalMessages || [])`) ma riassegna
    // `originalError` a un `Error` nuovo la riga prima, quindi la catena si
    // ferma sempre a due chiavi. Qui la catena è conservata davvero: la chiave
    // `message` è inserita fra `question.error` e l'errore originale.
    throw new JmeError(
      "question.error",
      { number: this.number + 1, message: nmessage },
      new JmeError(message, args, originalError),
    );
  }

  // question.js:1202-1213
  /** La parte al percorso dato, o `undefined`.
   *
   * upstream: lancia `question.no such part` (question.js:1209-1211). Il
   * contratto delle parti (Task 8) vuole invece `undefined`, perché i rami di
   * errore della correzione adattiva ci contano. Vedi DIVERGENCES.md. */
  getPart(path: string): PartBase | undefined {
    return this.partDictionary[path];
  }

  // question.js:701-710
  /** Tutte le parti a cui lo studente può rispondere: quelle di primo livello
   * e i loro gap. */
  allParts(): PartBase[] {
    return allParts(this.parts);
  }

  /** Il punteggio corrente della domanda. */
  score(): QuestionScore {
    return { score: this.currentScore.score, marks: this.currentScore.marks };
  }

  // question.js:1297-1316, solo il ramo `case 'all'`
  /** Tutte le parti sono state risposte (o non valgono punti)? */
  validate(): boolean {
    return validate(this.parts);
  }

  // question.js:1321-1331
  /** Qualcosa è cambiato dall'ultimo invio? */
  isDirty(): boolean {
    return isDirty(this.parts, this.revealed);
  }

  // question.js:1350-1408, solo il ramo `case 'all'`
  /** Ricalcola punteggio e stato "risposta". */
  calculateScore(): void {
    this.currentScore = calculateScore(this.parts);
    this.answered = this.validate();
  }

  // question.js:1437-1447, senza gli agganci a esame, display e storage
  /** Ricalcola il punteggio. La chiamano le parti dopo ogni `submit`. */
  updateScore(): void {
    this.calculateScore();
  }

  // question.js:1413-1431, senza `store`
  /** Invia tutte le parti. */
  submit(): void {
    this.answered = submitAllParts(this.parts);
    if (this.answered) {
      this.submitted += 1;
    }
    this.updateScore();
  }

  // question.js:1243-1252, senza `store` e senza il controllo su `exam`
  /** Segna il testo di aiuto come mostrato. */
  getAdvice(): void {
    this.adviceDisplayed = true;
  }

  // question.js:1258-1265, senza display
  /** Blocca la domanda: le parti non accettano più risposte. */
  lock(): void {
    this.locked = true;
    this.allParts().forEach((part) => {
      part.lock();
    });
  }

  // question.js:1271-1290, senza display e storage
  /** Rivela le risposte corrette e mostra il testo di aiuto. */
  revealAnswer(): void {
    this.lock();
    this.revealed = true;
    this.getAdvice();
    for (const part of this.parts) {
      part.revealAnswer();
    }
  }

  /** Rigenera la domanda con un altro seme. Non modifica questa istanza. */
  regenerate(seed: string): Question {
    return new Question(this.json, { ...this.options, seed: seed });
  }

  /** Lo stato serializzabile della domanda. */
  toState(): QuestionState {
    return questionToState(this);
  }
}

/** Carica una domanda dal suo JSON. */
export function loadQuestion(json: NumbasQuestionJSON, opts: LoadOptions): Question {
  return new Question(json, opts);
}

/** Ricarica una domanda da uno stato salvato: rigenera le variabili dal seme
 * dello stato, poi rimette le risposte e rinvia le parti già risposte. */
export function restoreQuestion(
  json: NumbasQuestionJSON,
  state: QuestionState,
  opts?: { locale?: LoadOptions["locale"]; allowJavascriptFunctions?: boolean; ignorePreamble?: boolean },
): Question {
  const loadOptions: LoadOptions = { seed: state.seed };
  if (opts?.locale !== undefined) {
    loadOptions.locale = opts.locale;
  }
  if (opts?.allowJavascriptFunctions !== undefined) {
    loadOptions.allowJavascriptFunctions = opts.allowJavascriptFunctions;
  }
  if (opts?.ignorePreamble !== undefined) {
    loadOptions.ignorePreamble = opts.ignorePreamble;
  }
  const q = new Question(json, loadOptions);
  applyQuestionState(q, state);
  return q;
}
