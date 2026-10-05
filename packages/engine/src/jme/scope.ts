/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// jme.js:2491-2557 (`FunctionSet`), 2576-3319 (`Scope`, senza
// `expandJuxtapositions`, che sta in juxtapositions.ts).

import seedrandom from "seedrandom";
import type { Rng } from "../math";
import type { Locale } from "../i18n";
import { JmeError } from "./errors";
import {
  TDict,
  TLambda,
  TList,
  TName,
  TString,
  getNameInfo,
  type Token,
  type Tree,
  type TokenConstructor,
} from "./tokens";
import {
  FuncObj,
  sig_remove_missing,
  type FuncObjOptions,
  type SignatureInput,
  type SignatureResult,
  type SignatureResultArgument,
} from "./funcobj";
import { Parser, standardParser } from "./parser";
// import di solo tipo: non crea un ciclo a runtime (il Task 3 importa scope.ts)
import type { Ruleset } from "./rules-ruleset";
import { funcSynonyms, normaliseName } from "./tokenizer";
import { castArgumentsToSignature, substituteTree, wrapValue } from "./evaluate";
import { eq } from "./equality";
import { mergeUnique, sortById } from "./util";
import { contentsubvars, displayHooks } from "./subvars";
import { expandJuxtapositions, type JuxtapositionOptions } from "./juxtapositions";

// jme.js:4471 — vuoto qui, riempito dai builtin (Task 4). L'array è condiviso
// per riferimento: chi aggiunge un nome muta questo stesso array.
/** I nomi delle operazioni che valutano i propri argomenti da sé. */
export const lazyOps: string[] = [];

/** Un generatore casuale deterministico a partire dal seme dato. */
export function makeRng(seed: string): Rng {
  const r = seedrandom(seed);
  return () => r();
}

/** Il seme del generatore casuale di uno scope radice: il motore non usa mai
 * `Math.random`, e senza un seme esplicito le valutazioni devono comunque
 * essere riproducibili. */
const DEFAULT_RNG_SEED = "savint";

/** La definizione di una costante (jme.js:54-60). */
export interface ConstantDefinition {
  name?: string;
  value: Token;
  tex?: string;
  enabled?: boolean;
}

/** Quel che si può aggiungere a uno scope oltre al genitore. */
export interface ScopeExtras {
  variables?: Record<string, Token>;
  constants?: Record<string, ConstantDefinition>;
  functions?: Record<string, FuncObj[]>;
  function_sets?: Record<string, FunctionSet>;
  rulesets?: Record<string, Ruleset>;
  caseSensitive?: boolean;
  rng?: Rng;
  locale?: Locale;
  numberStyle?: string;
  question?: unknown;
}

/**
 * Un insieme di funzioni, di solito legate a un argomento o a un uso
 * (jme.js:2491-2556).
 *
 * Il costruttore upstream si registra anche nel dizionario globale
 * `Numbas.jme.function_sets`; qui non c'è nessun registro globale (decisione 9
 * del brief): l'insieme finisce solo negli scope che lo assorbono.
 */
export class FunctionSet {
  /** Le funzioni dell'insieme. */
  functions: FuncObj[] = [];
  /** Il nome dell'insieme. */
  name: string;
  /** Una descrizione leggibile dell'insieme. */
  description: string | undefined;

  constructor(options: { name: string; description?: string }, callback?: (set: FunctionSet) => void) {
    this.name = options.name;
    this.description = options.description;
    this.functions = [];
    if (callback) {
      callback(this);
    }
  }

  // jme.js:2534-2540
  /** Aggiunge una funzione all'insieme. Se `random` non è indicato, la
   * funzione è dichiarata non casuale. */
  add_function(
    name: string,
    intype: SignatureInput[],
    outcons: TokenConstructor | "?",
    fn: ((...args: never[]) => unknown) | null,
    options?: FuncObjOptions,
  ): FuncObj {
    const opts: FuncObjOptions = { ...(options ?? {}) };
    opts.random = "random" in opts ? opts.random : false;
    const jme_fn = new FuncObj(name, intype, outcons, fn, opts);
    this.functions.push(jme_fn);
    return jme_fn;
  }

  // jme.js:2545-2549
  /** Assorbe le funzioni degli insiemi dati. */
  absorb(...sets: FunctionSet[]): void {
    for (const set of sets) {
      this.functions = this.functions.concat(set.functions);
    }
  }

  // jme.js:2551-2555
  /** Un nuovo insieme che unisce quelli dati. */
  static union(options: { name: string; description?: string }, sets: FunctionSet[]): FunctionSet {
    const set = new FunctionSet(options);
    set.absorb(...sets);
    return set;
  }
}

/** La firma scelta per una chiamata, con la definizione che la realizza
 * (jme.js:49-52). */
export interface CallSignature {
  fn: FuncObj;
  signature: SignatureResult;
}

/**
 * Un ambiente di valutazione JME: contiene variabili, funzioni, costanti e
 * ruleset (jme.js:2576-3319).
 *
 * Uno scope può avere un genitore: la ricerca di un nome risale la catena
 * finché non lo trova.
 */
export class Scope {
  /** Il parser con cui compilare le espressioni. */
  parser: Parser;
  /** Lo scope genitore, se c'è. */
  declare parent?: Scope;
  /** Le costanti definite a questo livello. */
  constants: Record<string, ConstantDefinition>;
  /** Le variabili definite a questo livello. */
  variables: Record<string, Token>;
  /** Gli insiemi di funzioni aggiunti a questo livello. */
  function_sets: Record<string, FunctionSet>;
  /** Le funzioni definite a questo livello: un nome può avere più definizioni. */
  functions: Record<string, FuncObj[]>;
  /** Cache di `getFunction`. */
  _resolved_functions: Record<string, FuncObj[]>;
  /** I ruleset definiti a questo livello. */
  rulesets: Record<string, Ruleset>;
  /** I nomi cancellati a questo livello, per collezione. */
  deleted: Record<string, Record<string, boolean>>;
  /** Lo scope distingue maiuscole e minuscole nei nomi? */
  declare caseSensitive?: boolean;
  /** Il generatore casuale usato dalle funzioni casuali. Valorizzato in ogni
   * ramo del costruttore: ereditato dal genitore, preso da `extras`, oppure
   * — solo per una radice che non ha né l'uno né l'altro — seminato con
   * `makeRng(DEFAULT_RNG_SEED)`. */
  rng!: Rng;
  /** La lingua dei messaggi prodotti valutando in questo scope: la leggono
   * `translate` (jme/builtins/strings.ts) e ogni `t()` che ha uno scope o una
   * parte sottomano.
   *
   * upstream: non esiste — la lingua è la globale di i18next impostata da
   * `localisation.js` e letta da `R()`.
   *
   * Viaggia come `rng`: ereditata dal genitore, sovrascrivibile da `extras`,
   * conservata da `clone()`. Lasciarla indefinita significa "usa la lingua
   * predefinita del processo" (`getLocale()`), che resta il comportamento per
   * chi non ne indica nessuna. Vedi DIVERGENCES.md. */
  declare locale?: Locale;
  /** Lo stile con cui MOSTRARE i numeri (es. `"plain-eu"`, la virgola
   * decimale), letto da `Texifier`, da `tokenToDisplayString` e da
   * `dpformat`/`sigformat` senza stile esplicito. Mai dal codice JME che il
   * motore rilegge. Viaggia come `locale`.
   *
   * upstream: non esiste — i numeri si mostrano sempre col punto. Vedi
   * DIVERGENCES.md, «Stile dei numeri mostrati». */
  declare numberStyle?: string;
  /** La domanda a cui appartiene lo scope: riferimento opaco, riempito dal
   * Task 9. */
  declare question?: unknown;

  // jme.js:2576-2636
  constructor(scopes?: Scope | ScopeExtras | Array<Scope | ScopeExtras | undefined>) {
    this.parser = standardParser;
    this.constants = {};
    this.variables = {};
    this.function_sets = {};
    this.functions = {};
    this._resolved_functions = {};
    this.rulesets = {};
    this.deleted = {};
    if (scopes === undefined) {
      this.rng = makeRng(DEFAULT_RNG_SEED);
      return;
    }
    const list: Array<Scope | ScopeExtras | undefined> = Array.isArray(scopes) ? scopes : [scopes, undefined];
    const first = list[0] as Scope & ScopeExtras;
    if (first.question) {
      this.question = first.question;
    }
    let extras: ScopeExtras;
    if (!(first as Scope).evaluate) {
      extras = first as ScopeExtras;
      // `makeRng` costruisce una key schedule di seedrandom (~2 µs, molto più
      // del resto del costruttore): si semina solo qui, cioè per una radice
      // che non eredita né riceve un generatore. `new Scope([parent])` è su
      // tutti i percorsi caldi (applicazione di lambda, `evaluate` con
      // variabili, campionamento di `compare`) e non deve pagarla.
      this.rng = extras.rng ?? makeRng(DEFAULT_RNG_SEED);
    } else {
      this.parent = first as Scope;
      this.parser = this.parent.parser;
      if (this.parent.caseSensitive !== undefined) {
        this.caseSensitive = this.parent.caseSensitive;
      }
      // il figlio eredita la lingua del genitore: i messaggi prodotti da uno
      // scope figlio (script di correzione, lambda, sostituzioni) restano
      // nella lingua della domanda.
      if (this.parent.locale !== undefined) {
        this.locale = this.parent.locale;
      }
      if (this.parent.numberStyle !== undefined) {
        this.numberStyle = this.parent.numberStyle;
      }
      // il figlio eredita il generatore casuale del genitore, per riferimento:
      // le estrazioni continuano la stessa sequenza.
      this.rng = this.parent.rng;
      extras = (list[1] as ScopeExtras) || {};
    }
    if (extras) {
      if (extras.constants) {
        for (const [k, v] of Object.entries(extras.constants)) {
          this.setConstant(k, v);
        }
      }
      if (extras.variables) {
        for (const [k, v] of Object.entries(extras.variables)) {
          this.setVariable(k, v);
        }
      }
      if (extras.rulesets) {
        for (const [k, v] of Object.entries(extras.rulesets)) {
          this.addRuleset(k, v);
        }
      }
      if (extras.functions) {
        for (const fns of Object.values(extras.functions)) {
          fns.forEach((fn) => {
            this.addFunction(fn);
          });
        }
      }
      if (extras.function_sets) {
        for (const set of Object.values(extras.function_sets)) {
          this.addFunctionSet(set);
        }
      }
      if (extras.caseSensitive !== undefined) {
        this.caseSensitive = extras.caseSensitive;
      }
      if (extras.rng !== undefined) {
        this.rng = extras.rng;
      }
      if (extras.locale !== undefined) {
        this.locale = extras.locale;
      }
      if (extras.numberStyle !== undefined) {
        this.numberStyle = extras.numberStyle;
      }
    }
  }

  // jme.js:2648-2659
  /** Una copia di questo scope. */
  clone(): Scope {
    // upstream: `new Scope(this.parent ? [this.parent] : undefined)`. Qui la
    // radice riceve subito il generatore, così il costruttore non ne semina
    // uno che verrebbe comunque sovrascritto qualche riga più sotto.
    const scope = new Scope(this.parent ? [this.parent] : { rng: this.rng });
    scope.parser = this.parser;
    scope.constants = Object.assign({}, this.constants);
    scope.variables = Object.assign({}, this.variables);
    scope.function_sets = Object.assign({}, this.function_sets);
    scope.functions = Object.assign({}, this.functions);
    scope.rulesets = Object.assign({}, this.rulesets);
    scope.deleted = structuredClone(this.deleted);
    if (this.caseSensitive !== undefined) {
      scope.caseSensitive = this.caseSensitive;
    }
    if (this.locale !== undefined) {
      scope.locale = this.locale;
    }
    if (this.numberStyle !== undefined) {
      scope.numberStyle = this.numberStyle;
    }
    scope.rng = this.rng;
    return scope;
  }

  // jme.js:2667-2674
  /** Marca (o smarca) un nome come cancellato in una collezione. */
  setDeleted(collection: string, name: string, deleted?: boolean): void {
    deleted = deleted !== false;
    if (this.deleted[collection] === undefined) {
      this.deleted[collection] = {};
    }
    (this.deleted[collection] as Record<string, boolean>)[name] = deleted;
  }

  // jme.js:2681-2690
  /** Definisce una costante. */
  setConstant(name: string, data: ConstantDefinition): void {
    const def: ConstantDefinition = { name: name, value: data.value, tex: data.tex || name };
    name = normaliseName(name, this);
    this.constants[name] = def;
    this.setDeleted("constants", name, false);
  }

  // jme.js:2697-2701
  /** Definisce una variabile. */
  setVariable(name: string, value: Token): void {
    name = normaliseName(name, this);
    this.variables[name] = value;
    this.setDeleted("variables", name, false);
  }

  // jme.js:2707-2720
  /** Aggiunge una definizione di funzione allo scope. */
  addFunction(fn: FuncObj): FuncObj {
    const name = normaliseName(fn.name, this);
    if (!(name in this.functions)) {
      this.functions[name] = [fn];
    } else {
      const functions = this.functions[name] as FuncObj[];
      if (functions.indexOf(fn) === -1) {
        functions.push(fn);
      }
      delete this._resolved_functions[name];
    }
    this.setDeleted("functions", name, false);
    return fn;
  }

  // jme.js:2726-2731
  /** Aggiunge allo scope tutte le funzioni di un insieme. */
  addFunctionSet(set: FunctionSet): void {
    this.function_sets[set.name] = set;
    for (const fn of set.functions) {
      this.addFunction(fn);
    }
  }

  // jme.js:2738-2741
  /** Aggiunge un ruleset allo scope. */
  addRuleset(name: string, set: Ruleset): void {
    this.rulesets[name] = set;
    this.setDeleted("rulesets", name, false);
  }

  // jme.js:2746-2749
  /** Cancella una costante dallo scope. */
  deleteConstant(name: string): void {
    name = normaliseName(name, this);
    this.setDeleted("constants", name);
  }

  // jme.js:2755-2762 — per default cancella anche la costante omonima.
  /** Cancella una variabile dallo scope. */
  deleteVariable(name: string, options?: { delete_constant?: boolean }): void {
    options = options || {};
    name = normaliseName(name, this);
    this.setDeleted("variables", name);
    if (options.delete_constant !== false) {
      this.setDeleted("constants", name);
    }
  }

  // jme.js:2767-2770
  /** Cancella una funzione dallo scope. */
  deleteFunction(name: string): void {
    name = normaliseName(name, this);
    this.setDeleted("functions", name);
  }

  // jme.js:2775-2778
  /** Cancella un ruleset dallo scope. */
  deleteRuleset(name: string): void {
    name = normaliseName(name, this);
    this.setDeleted("rulesets", name);
  }

  // jme.js:2785-2798 — l'ordine conta: prima si controlla la cancellazione, e
  // se il nome è cancellato a questo livello la ricerca finisce lì, anche se
  // uno scope più in alto lo definisce ancora.
  /** Cerca un nome in una collezione, risalendo la catena degli scope. */
  resolve(collection: string, name: string): unknown {
    // si risale la catena degli scope partendo da questo
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let scope: Scope | undefined = this;
    while (scope) {
      const sname = normaliseName(name, scope);
      const deleted = scope.deleted[collection];
      if (deleted && deleted[sname]) {
        return undefined;
      }
      const values = (scope as unknown as Record<string, Record<string, unknown>>)[collection] as Record<
        string,
        unknown
      >;
      if (values[sname] !== undefined) {
        return values[sname];
      }
      scope = scope.parent;
    }
    return undefined;
  }

  // jme.js:2804-2806
  /** La definizione della costante con il nome dato. */
  getConstant(name: string): ConstantDefinition | undefined {
    return this.resolve("constants", name) as ConstantDefinition | undefined;
  }

  // jme.js:2813-2825
  /** Se il valore dato è uguale a una costante definita, ritorna la costante. */
  isConstant(value: Token): ConstantDefinition | undefined {
    for (const [k, v] of Object.entries(this.constants)) {
      if (!(this.deleted.constants && this.deleted.constants[k])) {
        if (eq(value, v.value, this)) {
          return v;
        }
      }
    }
    if (this.parent) {
      return this.parent.isConstant(value);
    }
    return undefined;
  }

  // jme.js:2831-2833
  /** Il valore della variabile con il nome dato. */
  getVariable(name: string): Token | undefined {
    return this.resolve("variables", name) as Token | undefined;
  }

  // jme.js:2839-2859 — a differenza di `resolve`, la cancellazione interrompe
  // la risalita (`break`) e ritorna quel che si è accumulato finora.
  /** Tutte le definizioni della funzione con il nome dato. */
  getFunction(name: string): FuncObj[] {
    name = normaliseName(name, this);
    if (funcSynonyms[name]) {
      name = funcSynonyms[name] as string;
    }
    if (!this._resolved_functions[name]) {
      // si risale la catena degli scope partendo da questo
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      let scope: Scope | undefined = this;
      let o: FuncObj[] = [];
      while (scope) {
        if (scope.deleted.functions && scope.deleted.functions[name]) {
          break;
        }
        if (scope.functions[name] !== undefined) {
          o = mergeUnique(o, scope.functions[name] as FuncObj[], sortById);
        }
        scope = scope.parent;
      }
      this._resolved_functions[name] = o;
    }
    return this._resolved_functions[name] as FuncObj[];
  }

  // jme.js:2866-2868
  /** L'insieme di funzioni con il nome dato. */
  getFunctionSet(name: string): FunctionSet | undefined {
    return this.resolve("function_sets", name) as FunctionSet | undefined;
  }

  // jme.js:2876-3006 — risoluzione degli overload: prima un match esatto, poi
  // il candidato "più specifico" secondo l'ordine delle chiavi di `casts`.
  /** La definizione della funzione che accetta gli argomenti dati. */
  matchFunctionToArguments(tok: Token, args: Token[]): CallSignature | null {
    const op = normaliseName((tok as { name: string }).name, this);
    const fns = this.getFunction(op);
    if (fns.length === 0) {
      if (tok.type === "function") {
        // può darsi che l'utente abbia scritto `xtan(y)` intendendo `x*tan(y)`
        const possibleOp = op.slice(1);
        if (op.length > 1 && this.getFunction(possibleOp).length) {
          throw new JmeError("jme.typecheck.function maybe implicit multiplication", {
            name: op,
            first: op[0] as string,
            possibleOp: possibleOp,
          });
        } else {
          throw new JmeError("jme.typecheck.function not defined", { op: op, suggestion: op });
        }
      } else {
        throw new JmeError("jme.typecheck.op not defined", { op: op });
      }
    }

    /** La distanza fra un argomento e il tipo che la firma richiede. */
    function type_difference(tk: Token, typeDescription: SignatureResultArgument): Array<string | null> {
      if (tk.type !== typeDescription.type) {
        return [typeDescription.type as string];
      }
      let out: Array<string | null> = [typeDescription.nonspecific ? tk.type : null];
      switch (typeDescription.type) {
        case "list":
          if (typeDescription.items) {
            const items = sig_remove_missing(typeDescription.items as SignatureResult);
            const value = (tk as TList).value ?? [];
            for (let i = 0; i < value.length; i++) {
              out = out.concat(type_difference(value[i] as Token, items[i] as SignatureResultArgument));
            }
          }
      }
      return out;
    }

    /** Confronta due corrispondenze: viene prima quella che, argomento per
     * argomento, è più specifica sulle collezioni, combacia esattamente col
     * tipo, o converte a un tipo che l'argomento preferisce (cioè che compare
     * prima nella sua lista di cast). */
    function compare_matches(m1: SignatureResult, m2: SignatureResult): number {
      m1 = sig_remove_missing(m1);
      m2 = sig_remove_missing(m2);
      for (let i = 0; i < args.length; i++) {
        const arg = args[i] as Token;
        const d1 = type_difference(arg, m1[i] as SignatureResultArgument);
        const d2 = type_difference(arg, m2[i] as SignatureResultArgument);
        for (let j = 0; j < d1.length && j < d2.length; j++) {
          if (d1[j] === null) {
            if (d2[j] === null) {
              continue;
            } else {
              return -1;
            }
          } else {
            if (d2[j] === null) {
              return 1;
            } else {
              if (arg.casts) {
                const casts = Object.keys(arg.casts);
                let i1 = casts.indexOf(d1[j] as string);
                if (i1 === -1) {
                  i1 = Infinity;
                }
                let i2 = casts.indexOf(d2[j] as string);
                if (i2 === -1) {
                  i2 = Infinity;
                }
                if (i1 !== i2) {
                  return i1 < i2 ? -1 : 1;
                }
              }
              continue;
            }
          }
        }
      }
      return 0;
    }

    /** La corrispondenza descrive esattamente i tipi degli elementi dati? */
    function exactType(match: SignatureResult, items: Token[]): boolean {
      let k = 0;
      return match.every((m) => {
        if (m.missing) {
          return false;
        }
        const item = items[k];
        let ok = Boolean(item && item.type === m.type);
        if (ok) {
          if (m.items && (item as Token).type === "list") {
            ok = exactType(m.items as SignatureResult, ((item as TList).value ?? []) as Token[]);
          }
        }
        k += 1;
        return ok;
      });
    }

    let candidate: CallSignature | null = null;
    for (let j = 0; j < fns.length; j++) {
      const fn = fns[j] as FuncObj;
      if (fn.typecheck(args)) {
        const match = fn.intype(args) as SignatureResult;
        if (exactType(match, args)) {
          return { fn: fn, signature: match };
        }
        const pcandidate: CallSignature = { fn: fn, signature: match };
        if (candidate === null || compare_matches(pcandidate.signature, candidate.signature) === -1) {
          candidate = pcandidate;
        }
      }
    }
    return candidate;
  }

  // jme.js:3013-3015
  /** Il ruleset con il nome dato. */
  getRuleset(name: string): Ruleset | undefined {
    return this.resolve("rulesets", name) as Ruleset | undefined;
  }

  // jme.js:3021-3025
  /** Definisce un ruleset. */
  setRuleset(name: string, rules: Ruleset): void {
    name = normaliseName(name, this);
    this.rulesets[name] = rules;
    this.setDeleted("rulesets", name, false);
  }

  // jme.js:3031-3050
  /** Raccoglie tutti gli elementi di una collezione lungo la catena, tenendo
   * conto delle cancellazioni. */
  collect(collection: string): Record<string, unknown> {
    // si risale la catena degli scope partendo da questo
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let scope: Scope | undefined = this;
    const deleted: Record<string, boolean> = {};
    const out: Record<string, unknown> = {};
    while (scope) {
      const del = scope.deleted[collection];
      if (del) {
        for (const name of Object.keys(del)) {
          deleted[name] = (del[name] as boolean) || (deleted[name] as boolean);
        }
      }
      const values = (scope as unknown as Record<string, Record<string, unknown>>)[collection] as Record<
        string,
        unknown
      >;
      for (const name in values) {
        if (!deleted[name]) {
          out[name] = out[name] ?? values[name];
        }
      }
      scope = scope.parent;
    }
    return out;
  }

  // jme.js:3055-3070
  /** Tutte le costanti visibili da questo scope. */
  allConstants(): Record<string, ConstantDefinition> {
    return this.collect("constants") as Record<string, ConstantDefinition>;
  }
  /** Tutte le variabili visibili da questo scope. */
  allVariables(): Record<string, Token> {
    return this.collect("variables") as Record<string, Token>;
  }
  /** Tutti i ruleset visibili da questo scope. */
  allRulesets(): Record<string, Ruleset> {
    return this.collect("rulesets") as Record<string, Ruleset>;
  }

  // jme.js:3076-3097
  /** Tutte le funzioni visibili da questo scope: ogni nome mappa alla lista di
   * tutte le sue definizioni. */
  allFunctions(): Record<string, FuncObj[]> {
    // si risale la catena degli scope partendo da questo
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let scope: Scope | undefined = this;
    const out: Record<string, FuncObj[]> = {};
    /** Fonde una lista di definizioni con quelle già trovate per quel nome. */
    function add(name: string, fns: FuncObj[]): void {
      if (!out[name]) {
        out[name] = [];
      }
      out[name] = mergeUnique(out[name] as FuncObj[], fns, sortById);
    }
    while (scope) {
      for (const [name, fns] of Object.entries(scope.functions)) {
        add(name, fns);
      }
      scope = scope.parent;
    }
    return out;
  }

  // jme.js:3103-3105
  /** Tutti gli insiemi di funzioni visibili da questo scope. */
  allFunctionSets(): Record<string, FunctionSet> {
    return this.collect("function_sets") as Record<string, FunctionSet>;
  }

  // jme.js:3111-3114 — retrocompatibilità per le domande che leggono
  // `question.scope.variables.x`: va usato solo sullo scope della domanda.
  /** Appiattisce in questo scope tutte le variabili e i ruleset della catena. */
  flatten(): void {
    this.variables = this.allVariables();
    this.rulesets = this.allRulesets();
  }

  // jme.js:3121-3139
  /** Uno scope figlio in cui i nomi indicati risultano non definiti. */
  unset(defs: { variables?: string[]; functions?: string[]; rulesets?: string[] }): Scope {
    const s = new Scope([this]);
    if (defs.variables) {
      defs.variables.forEach((v) => {
        s.deleteVariable(v, { delete_constant: false });
      });
    }
    if (defs.functions) {
      defs.functions.forEach((f) => {
        s.deleteFunction(f);
      });
    }
    if (defs.rulesets) {
      defs.rulesets.forEach((r) => {
        s.deleteRuleset(r);
      });
    }
    return s;
  }

  // jme.js:3148-3283
  /** Valuta un'espressione (o un albero già compilato) in questo scope.
   * Ritorna `null` se l'espressione è vuota (`compile` di una stringa vuota),
   * come upstream: `subvars` lo riconosce per segnalare una sostituzione
   * vuota. */
  evaluate(expr: string | Tree, variables?: Record<string, unknown>, noSubstitution?: boolean): Token | null {
    // con `variables` si valuta in uno scope figlio, altrimenti in questo
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let scope: Scope = this;
    if (variables) {
      scope = new Scope([this]);
      for (const [name, v] of Object.entries(variables)) {
        scope.setVariable(name, wrapValue(v));
      }
    }
    let tree: Tree | null;
    if (typeof expr === "string") {
      tree = this.parser.compile(expr);
    } else {
      tree = expr;
    }
    if (!tree) {
      return null;
    }
    if (!noSubstitution) {
      // `tree` non è nullo qui, quindi nemmeno il risultato
      tree = substituteTree(tree, scope, true) as Tree;
    }
    let tok = tree.tok;
    const eargs: Token[] = [];
    const args = tree.args ?? [];

    switch (tok.type) {
      case "number":
      case "boolean":
      case "range":
        return tok;
      case "list":
        if (tok.value === undefined) {
          const value: Token[] = [];
          for (let i = 0; i < args.length; i++) {
            // un argomento è sempre un albero, quindi il risultato non è nullo
            value[i] = scope.evaluate(args[i] as Tree, undefined, noSubstitution) as Token;
          }
          tok = new TList(value);
        }
        return tok;
      case "dict":
        if (tok.value === undefined) {
          const value: Record<string, Token> = {};
          for (let i = 0; i < args.length; i++) {
            const kp = args[i] as Tree;
            value[(kp.tok as { key: string }).key] = scope.evaluate(
              (kp.args as Tree[])[0] as Tree,
              undefined,
              noSubstitution,
            ) as Token;
          }
          tok = new TDict(value);
        }
        return tok;
      case "string": {
        const value = tok.value;
        if (!tok.safe && value.includes("{")) {
          let nvalue: string;
          if (tok.subjme) {
            if (!displayHooks.treeToJME || !displayHooks.subvars) {
              throw new JmeError("jme.subvars.display not available", { op: "subjme" });
            }
            nvalue = displayHooks.treeToJME(displayHooks.subvars(value, scope), {}, scope);
          } else {
            nvalue = contentsubvars(value, scope);
          }
          const t = new TString(nvalue);
          if (tok.latex !== undefined) {
            t.latex = tok.latex;
            if (tok.display_latex !== undefined) {
              t.display_latex = tok.display_latex;
            }
          }
          return t;
        }
        return tok;
      }
      case "name": {
        const v = scope.getVariable(tok.name);
        if (v && !noSubstitution) {
          return v;
        }
        const c = scope.getConstant(tok.name);
        if (c) {
          return c.value;
        }
        const ntok = new TName(tok.name);
        ntok.unboundName = true;
        return ntok;
      }
      case "op":
      case "function": {
        const op = normaliseName(tok.name, scope);

        // le operazioni pigre ricevono gli ALBERI, non i valori: decidono loro
        // quali rami valutare.
        if (lazyOps.indexOf(op) >= 0) {
          const fn = scope.getFunction(op)[0];
          if (!fn) {
            throw new JmeError("jme.typecheck.function not defined", { op: op, suggestion: op });
          }
          return fn.evaluate(args, scope);
        } else {
          for (let i = 0; i < args.length; i++) {
            eargs.push(scope.evaluate(args[i] as Tree, undefined, noSubstitution) as Token);
          }

          const op_variable = scope.getVariable(op);
          if (op_variable && op_variable.type === "lambda") {
            return op_variable.evaluate(eargs, this);
          }

          const matchedFunction = scope.matchFunctionToArguments(tok, eargs);
          if (matchedFunction) {
            const castargs = castArgumentsToSignature(matchedFunction.signature, eargs);
            return matchedFunction.fn.evaluate(castargs, scope);
          } else {
            for (let i = 0; i <= eargs.length; i++) {
              const e = eargs[i];
              if (e && (e as TName).unboundName) {
                throw new JmeError("jme.typecheck.no right type unbound name", { name: (e as TName).name });
              }
            }
            throw new JmeError("jme.typecheck.no right type definition", { op: op });
          }
        }
      }
      case "lambda":
        if (tree.args) {
          for (let i = 0; i < args.length; i++) {
            eargs.push(scope.evaluate(args[i] as Tree, undefined, noSubstitution) as Token);
          }
          return tok.evaluate(eargs, scope);
        } else {
          // una lambda letterale non ancora applicata: si ricostruisce con il
          // corpo in cui sono già sostituite le variabili libere, lasciando
          // libere quelle legate dagli argomenti.
          const nlambda = new TLambda();
          nlambda.names = tok.names as Tree[];
          nlambda.make_signature();
          const nscope = new Scope([scope]);
          (nlambda.all_names ?? []).forEach((name: string) => {
            nscope.deleteVariable(name);
          });
          // il corpo di una lambda esiste sempre: la sostituzione non è nulla
          nlambda.set_expr(substituteTree(tok.expr, nscope, true, false) as Tree);
          return nlambda;
        }

      default:
        return tok;
    }
  }

  // jme.js:3291-3304
  /** Ricostruisce il nome canonico di un token nome, normalizzando i pedici. */
  normaliseSubscripts(tok: TName): TName {
    if (this.getConstant(tok.name)) {
      return tok;
    }
    const info = getNameInfo(tok.nameWithoutAnnotation);
    let name = info.root;
    if (info.subscript) {
      name += "_" + info.subscript;
    }
    if (info.primes) {
      name += info.primes;
    }
    return new TName(name, tok.annotation);
  }

  // jme.js:3320-3621, implementato in juxtapositions.ts.
  /** Riscrive le giustapposizioni di nomi in prodotti o composizioni. */
  expandJuxtapositions(tree: Tree, options?: JuxtapositionOptions | null): Tree {
    return expandJuxtapositions(this, tree, options);
  }
}

// jme.js:4836 — upstream `findvars` usa `jme.builtinScope` come default. Qui i
// builtin arrivano col Task 4: fino ad allora il default è uno scope vuoto, e
// il Task 4 registra il proprio con `setBuiltinScope`.
let builtinScope: Scope | undefined;

/** Imposta lo scope usato come default da `findvars` quando non ne riceve uno. */
export function setBuiltinScope(scope: Scope): void {
  builtinScope = scope;
}

/** Lo scope di default: quello registrato con `setBuiltinScope`, o uno vuoto. */
export function getBuiltinScope(): Scope {
  if (!builtinScope) {
    builtinScope = new Scope();
  }
  return builtinScope;
}
