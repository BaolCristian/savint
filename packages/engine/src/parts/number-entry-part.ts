/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// parts/numberentry.js:29-295 — la parte "inserisci un numero". Non portati:
// `loadFromXML` (33-52), `initDisplay`/`resume` (79-88), `input_widget`/
// `input_options` (142-158).

import { t } from "../i18n";
import { JmeError, errorMessageIn } from "../jme/errors";
import { castToType, isType, unwrapValue } from "../jme/evaluate";
import type { Scope } from "../jme/scope";
import { subvars } from "../jme/subvars";
import { TNum, TString, type Token } from "../jme/tokens";
import {
  ComplexDecimal,
  Decimal,
  Fraction,
  niceNumber,
  rationalApproximation,
  type NiceNumberOptions,
  type NumbasNumber,
} from "../math";
import { MarkingScript } from "../marking/marking-script";
import { markingScripts } from "../marking/scripts";
import { registerPartType } from "./create-part";
import { PartBase, tryLoad } from "./part-base";
import type { Answer, BasePartSettings, PartJSON } from "./types";

/** Le impostazioni di una parte `numberentry` (numberentry.js:118-141). */
export type NumberEntrySettings = BasePartSettings & {
  /** Il minimo accettato, prima della sostituzione delle variabili. */
  minvalueString: string;
  /** Il massimo accettato, prima della sostituzione delle variabili. */
  maxvalueString: string;
  /** Il minimo accettato, valutato. */
  minvalue: ComplexDecimal;
  /** Il massimo accettato, valutato. */
  maxvalue: ComplexDecimal;
  /** Mostrare la risposta corretta come frazione? */
  correctAnswerFraction: boolean;
  /** Lo stile di formattazione della risposta corretta. */
  correctAnswerStyle: string | undefined;
  /** Lo studente può rispondere con una frazione? */
  allowFractions: boolean;
  /** Gli stili di notazione numerica accettati. */
  notationStyles: string[];
  /** La definizione della risposta mostrata al reveal. */
  displayAnswerString: string;
  /** La risposta mostrata al reveal. */
  displayAnswer: string;
  /** Il tipo di precisione richiesta. */
  precisionType: "none" | "dp" | "sigfig";
  /** La precisione richiesta, prima della sostituzione delle variabili. */
  precisionString: string;
  /** Gli zeri finali sono obbligatori? */
  strictPrecision: boolean;
  /** La precisione richiesta, valutata. */
  precision: number;
  /** Il credito parziale se la precisione è sbagliata. */
  precisionPC: number;
  /** Il messaggio mostrato se la precisione è sbagliata. */
  precisionMessage: string;
  /** La frazione deve essere ridotta ai minimi termini? */
  mustBeReduced: boolean;
  /** Il credito parziale se la frazione non è ridotta. */
  mustBeReducedPC: number;
  /** Mostrare il suggerimento sulla precisione? (solo UI) */
  showPrecisionHint: boolean;
  /** Mostrare il suggerimento sulle frazioni? (solo UI) */
  showFractionHint: boolean;
};

/** La parte in cui lo studente inserisce un numero (numberentry.js:29). */
export class NumberEntryPart extends PartBase {
  /** L'ultima risposta inviata dallo studente. */
  studentAnswer = "";
  declare settings: NumberEntrySettings & Record<string, unknown>;

  constructor(...args: ConstructorParameters<typeof PartBase>) {
    super(...args);
    // numberentry.js:29-32 (`util.copyinto`)
    Object.assign(this.settings, {
      minvalueString: "0",
      maxvalueString: "0",
      minvalue: new ComplexDecimal(new Decimal(0)),
      maxvalue: new ComplexDecimal(new Decimal(0)),
      correctAnswerFraction: false,
      correctAnswerStyle: undefined,
      allowFractions: false,
      notationStyles: ["plain", "en", "si-en"],
      displayAnswerString: "",
      displayAnswer: "",
      precisionType: "none",
      precisionString: "0",
      strictPrecision: false,
      precision: 0,
      precisionPC: 0,
      mustBeReduced: false,
      mustBeReducedPC: 0,
      precisionMessage: t("You have not given your answer to the correct precision.", undefined, this.locale),
      showPrecisionHint: true,
      showFractionHint: true,
    });
  }

  // numberentry.js:89-97
  override baseMarkingScript(): MarkingScript {
    return new MarkingScript(markingScripts.numberentry, undefined, this.getScope());
  }

  // numberentry.js:53-66
  override loadFromJSON(data: PartJSON): void {
    super.loadFromJSON(data);
    const settings = this.settings as unknown as Record<string, unknown>;
    if ("answer" in data) {
      settings["minvalueString"] = settings["maxvalueString"] = String(data["answer"]);
    }
    tryLoad(data, ["minValue", "maxValue"], settings, ["minvalueString", "maxvalueString"]);
    tryLoad(data, ["correctAnswerFraction", "correctAnswerStyle", "allowFractions"], settings);
    tryLoad(data, ["mustBeReduced", "mustBeReducedPC"], settings);
    this.settings.mustBeReducedPC /= 100;
    tryLoad(data, ["notationStyles"], settings);
    tryLoad(
      data,
      [
        "precisionPartialCredit",
        "strictPrecision",
        "showPrecisionHint",
        "showFractionHint",
        "precision",
        "precisionType",
        "precisionMessage",
      ],
      settings,
      [
        "precisionPC",
        "strictPrecision",
        "showPrecisionHint",
        "showFractionHint",
        "precisionString",
        "precisionType",
        "precisionMessage",
      ],
    );
    this.settings.precisionPC /= 100;
  }

  // numberentry.js:67-78
  override finaliseLoad(): void {
    super.finaliseLoad();
    const settings = this.settings;
    if (settings.precisionType !== "none") {
      settings.allowFractions = false;
    }
    try {
      this.getCorrectAnswer(this.getScope());
    } catch (e) {
      this.error(errorMessageIn(e, this.locale), {}, e);
    }
    // numberentry.js:77 — una parte appena caricata ha già una risposta in
    // attesa (la stringa vuota): senza questo, inviare senza rispondere darebbe
    // "non hai risposto" invece di "non hai inserito un numero valido".
    this.stagedAnswer = "";
  }

  // numberentry.js:164-263
  override getCorrectAnswer(scope: Scope): Answer {
    const settings = this.settings;
    const precision = subvars(String(settings.precisionString), scope);
    settings.precision = Number(toNumber(scope.evaluate(precision)));
    if (settings.precisionType === "sigfig" && settings.precision <= 0) {
      throw new JmeError("part.numberentry.zero sig fig");
    }
    if (settings.precisionType === "dp" && settings.precision < 0) {
      throw new JmeError("part.numberentry.negative decimal places");
    }

    let minvalue = scope.evaluate(subvars(String(settings.minvalueString), scope));
    const ominvalue = minvalue;
    if (!minvalue) {
      this.error("part.setting not present", { property: t("minimum value", undefined, this.locale) });
    }
    let maxvalue = scope.evaluate(subvars(String(settings.maxvalueString), scope));
    const omaxvalue = maxvalue;
    if (!maxvalue) {
      this.error("part.setting not present", { property: t("maximum value", undefined, this.locale) });
    }

    const dmin = (castToType(minvalue, "decimal") as { value: ComplexDecimal }).value;
    const dmax = (castToType(maxvalue, "decimal") as { value: ComplexDecimal }).value;
    if (dmax.lessThan(dmin)) {
      const tmp = minvalue;
      minvalue = maxvalue;
      maxvalue = tmp;
    }

    const isNumber = ominvalue?.type === "number" || omaxvalue?.type === "number";

    // numberentry.js:196-213 — "wiggle room" di 12 cifre, per assorbire gli
    // errori di virgola mobile nella generazione della variante.
    const dminvalue = withWiggleRoom(minvalue, -1);
    settings.minvalue = dminvalue;
    const dmaxvalue = withWiggleRoom(maxvalue, +1);
    settings.maxvalue = dmaxvalue;

    let displayAnswer: ComplexDecimal;
    if (settings.displayAnswerString) {
      const v = scope.evaluate(subvars(String(settings.displayAnswerString), scope));
      if (!v) {
        this.error("part.setting not present", { property: "displayAnswer" });
      }
      if (settings.allowFractions && settings.correctAnswerFraction && isType(v, "rational")) {
        settings.displayAnswer = String(unwrapValue(castToType(v, "rational")));
      } else if (isType(v, "decimal")) {
        const d = unwrapValue(castToType(v, "decimal")) as ComplexDecimal;
        settings.displayAnswer = niceNumber(d.toNumber(), niceOptions(settings));
      } else if (isType(v, "number")) {
        const n = unwrapValue(castToType(v, "number")) as NumbasNumber;
        settings.displayAnswer = niceNumber(n, niceOptions(settings));
      } else if (isType(v, "string")) {
        settings.displayAnswer = String(unwrapValue(castToType(v, "string")));
      } else {
        this.error("part.numberentry.display answer wrong type", {
          want_type: "string",
          got_type: v.type,
        });
      }
      return settings.displayAnswer;
    }

    if (dminvalue.re.isFinite()) {
      if (dmaxvalue.re.isFinite()) {
        displayAnswer = dminvalue.plus(dmaxvalue).dividedBy(2);
      } else {
        displayAnswer = dminvalue;
      }
    } else {
      if (dmaxvalue.re.isFinite()) {
        displayAnswer = dmaxvalue;
      } else if (dmaxvalue.equals(dminvalue)) {
        displayAnswer = dmaxvalue;
      } else {
        displayAnswer = new ComplexDecimal(new Decimal(0));
      }
    }
    if (settings.allowFractions && settings.correctAnswerFraction) {
      let frac: Fraction;
      if (isNumber) {
        const approx = rationalApproximation(displayAnswer.re.toNumber(), 35);
        frac = new Fraction(approx[0], approx[1]);
      } else {
        frac = Fraction.fromDecimal(displayAnswer.re);
      }
      settings.displayAnswer = frac.toString();
    } else {
      settings.displayAnswer = niceNumber(displayAnswer.toNumber(), niceOptions(settings));
    }
    return settings.displayAnswer;
  }

  // numberentry.js:270-276
  /** Ripulisce la risposta dello studente: gli spazi ai bordi e, divergenza
   * di SAVINT, un solo «%» finale (vedi DIVERGENCES.md, «Simbolo di
   * percentuale nelle risposte numeriche»). «15%» si legge 15, non 0,15: il
   * simbolo si toglie, non diventa una divisione. Un «%» da solo, o un
   * secondo «%», restano e rendono la risposta non valida. */
  cleanAnswer(answer: unknown): string {
    if (answer === undefined) {
      return "";
    }
    const pulita = String(answer).trim();
    const senzaPercento = /^([^%]*\S)\s*%$/.exec(pulita);
    return senzaPercento ? (senzaPercento[1] as string) : pulita;
  }

  // numberentry.js:279-281
  override setStudentAnswer(): void {
    this.studentAnswer = this.cleanAnswer(this.stagedAnswer);
  }

  // numberentry.js:288-290
  override rawStudentAnswerAsJME(): Token | undefined {
    return new TString(this.studentAnswer);
  }
}

// numberentry.js:196-213
/** Allarga di 10^(ordine-12) un estremo dell'intervallo espresso come numero
 * finito, e lo converte in `decimal`. Un estremo che non è un `number` (una
 * frazione, un `decimal`) è convertito e basta. */
function withWiggleRoom(value: Token, direction: -1 | 1): ComplexDecimal {
  let v = value;
  if (v.type === "number" && isFinite(Number(v.value))) {
    const n = Number(v.value);
    const size = Math.floor(Math.log10(Math.abs(n)));
    const widened = new TNum(n + direction * Math.pow(10, size - 12));
    widened.precisionType = "dp";
    widened.precision = 12 - size;
    v = widened;
  }
  return (castToType(v, "decimal") as { value: ComplexDecimal }).value;
}

/** Le opzioni di formattazione della risposta corretta.
 *
 * `niceNumber` non conosce il tipo di precisione `"none"`: upstream lo passa
 * comunque e il `switch` di `math.niceNumber` cade nel ramo predefinito; con
 * `exactOptionalPropertyTypes` la chiave va semplicemente omessa. */
function niceOptions(settings: NumberEntrySettings): NiceNumberOptions {
  const options: NiceNumberOptions = { precision: settings.precision };
  if (settings.precisionType !== "none") {
    options.precisionType = settings.precisionType;
  }
  if (settings.correctAnswerStyle !== undefined) {
    options.style = settings.correctAnswerStyle;
  }
  return options;
}

/** Il valore numerico di un token, o `NaN`. */
function toNumber(v: Token | null): number {
  if (!v) {
    return NaN;
  }
  const n = (v as { value?: unknown }).value;
  return typeof n === "number" ? n : Number(n);
}

// numberentry.js:291-295
registerPartType("numberentry", NumberEntryPart);
