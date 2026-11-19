import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { jme, loadQuestion, math, variables, type NumbasQuestionJSON, type Question } from "@savint/engine";
import { esercizioFileSchema } from "../format/schema";
import { verificaSuSemi } from "../editor/verifica";
import { daNumbas } from "../editor/da-numbas";
import { versoFile } from "../editor/verso-numbas";
import { AMBITI_INVALSI } from "../ambiti-invalsi";
import { opzioniMotore } from "../opzioni-motore";
import { testoFile, type EsercizioPacchetto } from "../../../../scripts/invalsi/comune";

/** Le prove comuni a ogni prova INVALSI trascritta (scripts/genera-invalsi-AAAA.ts).
 *
 * Le soluzioni le scrive A PARTE il file di test della prova, non le legge
 * dal modello: se nel modello un indice di risposta o un valore fosse
 * sbagliato, lo studente che risponde come la soluzione prenderebbe zero, e
 * la prova lo direbbe.
 *
 * Domande a NUMERI VARIABILI (modello con `variabili` non vuote): la
 * soluzione non è un elenco fisso ma una FUNZIONE dai valori estratti per
 * quello studente (`Valori`, per nome di variabile) alle risposte giuste, e
 * lo stesso, se serve, per un errore tipico. La funzione rifà il calcolo per
 * conto suo, in JavaScript, con la formula scritta di nuovo: non legge le
 * variabili «risultato» del modello (leggerle renderebbe la prova un
 * timbro). Usa solo le variabili «dato», quelle che lo studente legge nel
 * testo. La prova gira su `SEMI_VARIABILI` semi diversi e controlla, per
 * ciascuno:
 * - le risposte giuste prendono tutti i punti, gli errori tipici no;
 * - le risposte di ogni parte a scelta, come le vede lo studente, sono a due
 *   a due diverse (un distrattore che coincide con la giusta, o con un altro
 *   distrattore, per qualche estrazione è un difetto);
 * - il testo mostrato (enunciato, suggerimento, consegne, risposte,
 *   affermazioni) non contiene `\var` rimasti, `NaN`, `undefined`,
 *   `Infinity`, né numeri brutti (sei o più cifre decimali, come
 *   `0,3333333333` o `3,0000000004`, o la notazione esponenziale).
 * Le domande a numeri fissi fanno gli stessi controlli sul solo seme
 * "invalsi", e la loro soluzione può restare un elenco. */

const DIR = path.resolve(process.cwd(), "content/esercizi");

/** Quanti semi per una domanda a numeri variabili. */
export const SEMI_VARIABILI = 40;
const SEMI = Array.from({ length: SEMI_VARIABILI }, (_, i) => `invalsi-${i}`);

/** Una risposta come la consegna il player: numero/formula come testo
 * (con la virgola, come la scrive uno studente), scelta singola come indice
 * nell'ordine del fascicolo (A = 0), scelta multipla come caselle, tabella
 * Vero/Falso come un valore per affermazione nell'ordine del fascicolo. */
export type Risposta = string | { scelta: number; testo?: string } | { caselle: boolean[] } | { vf: boolean[] };

/** I valori estratti per un seme, per nome di variabile (come nel modello). */
export type Valori = Record<string, number>;

/** Le risposte giuste di una domanda, una per parte: un elenco per una
 * domanda a numeri fissi, una funzione dei valori estratti per una a numeri
 * variabili. */
export type Soluzione = Risposta[] | ((v: Valori) => Risposta[]);

/** Una risposta sbagliata tipica: fissa, o calcolata dai valori estratti. */
export type RispostaErrata = Risposta | ((v: Valori) => Risposta);

/** La risposta a scelta di indice `scelta` (A = 0). Con `testo`, la prova
 * controlla anche che quella risposta, come la vede lo studente, dica
 * proprio `testo` (confronto senza spazi, con i numeri in forma canonica:
 * `s(3, "125")`, `s(1, "0,14%")`, `s(0, "circa 100 volte")`): per una domanda
 * a numeri variabili è ciò che verifica la FORMULA della risposta giusta,
 * non solo la sua posizione. */
export const s = (scelta: number, testo?: string): Risposta => (testo === undefined ? { scelta } : { scelta, testo });
export const vf = (...v: boolean[]): Risposta => ({ vf: v });
export const caselle = (...c: boolean[]): Risposta => ({ caselle: c });
export const V = true;
export const F = false;

/** Un numero come lo scrive uno studente: con la virgola decimale. Con
 * `cifre` arrotonda a quel numero di decimali (e li scrive tutti). */
export const num = (x: number, cifre?: number): string =>
  (cifre === undefined ? String(x) : x.toFixed(cifre)).replace(".", ",");

/** `x`, se è intero; altrimenti la soluzione si ferma: l'estrazione non è
 * «pulita» come promette il modello. */
export function intero(x: number, cosa = "il risultato"): number {
  const arrotondato = Math.round(x);
  if (Math.abs(x - arrotondato) > 1e-9) throw new Error(`${cosa} non è intero: ${x}`);
  return arrotondato;
}

function carica(json: NumbasQuestionJSON, seme: string): Question {
  return loadQuestion(json, { seed: seme, ...opzioniMotore("it") });
}

function invia(json: NumbasQuestionJSON, seme: string, indiceParte: number, risposta: Risposta): number {
  const q = carica(json, seme);
  const parte = q.getPart(`p${indiceParte}`)!;
  if (typeof risposta === "string") parte.submit(risposta as never);
  else if ("scelta" in risposta) parte.submit(risposta.scelta as never);
  else if ("caselle" in risposta) parte.submit(risposta.caselle as never);
  else parte.submit([risposta.vf.map((x) => x), risposta.vf.map((x) => !x)] as never);
  return parte.credit;
}

function domanda(nome: string): NumbasQuestionJSON {
  return esercizioFileSchema.parse(JSON.parse(readFileSync(path.join(DIR, `${nome}.json`), "utf8")))
    .question as NumbasQuestionJSON;
}

/** Il valore numerico di una variabile estratta. Il motore tiene i prodotti
 * e i quozienti di interi come razionali esatti (`math.Fraction`), i
 * decimali come `math.ComplexDecimal`. */
function valoreNumerico(q: Question, nome: string): number {
  const token = q.scope.getVariable(nome);
  if (token === undefined) throw new Error(`variabile ${nome} assente`);
  const valore = jme.unwrapValue(token);
  if (typeof valore === "number") return valore;
  if (typeof valore === "bigint") return Number(valore);
  if (valore instanceof math.Fraction) return valore.toFloat();
  if (valore instanceof math.ComplexDecimal) return valore.re.toNumber();
  throw new Error(`variabile ${nome} non numerica (${token.type}): le soluzioni leggono solo numeri`);
}

/** I valori estratti. Chiedere un nome che il modello non ha è un errore
 * (un refuso nella soluzione non deve diventare `undefined` in silenzio). */
function valori(q: Question, e: EsercizioPacchetto): Valori {
  const v: Valori = Object.fromEntries(e.modello.variabili.map((x) => [x.nome, valoreNumerico(q, x.nome)]));
  return new Proxy(v, {
    get(oggetto, nome) {
      if (typeof nome === "string" && nome !== "toJSON" && !(nome in oggetto)) throw new Error(`${e.nome}: la variabile «${nome}» non esiste nel modello`);
      return Reflect.get(oggetto, nome);
    },
  });
}

/** I semi su cui si prova una domanda: molti se ha numeri variabili. */
function semiDi(e: EsercizioPacchetto): string[] {
  return e.modello.variabili.length > 0 ? SEMI : ["invalsi"];
}

/** Ogni testo che lo studente vede, già sostituito come lo sostituisce il
 * player (`costruisciParte` in risposta-attesa.tsx: il motore sostituisce da
 * sé enunciato, suggerimento e consegne, il player le risposte a scelta e le
 * affermazioni con `variables.substituteHtml`). */
function testiMostrati(q: Question): { dove: string; testo: string }[] {
  const testi = [
    { dove: "enunciato", testo: q.statementHtml },
    { dove: "suggerimento", testo: q.adviceHtml },
  ];
  for (const p of q.allParts()) {
    testi.push({ dove: `consegna della parte ${p.index}`, testo: p.promptHtml });
    const scelte = (p.settings as Record<string, unknown>).choices;
    if (Array.isArray(scelte)) {
      scelte.forEach((c, i) => {
        if (typeof c === "string") testi.push({ dove: `parte ${p.index}, voce ${i}`, testo: variables.substituteHtml(c, p.getScope()) });
      });
    }
  }
  return testi;
}

/** Le risposte di ogni parte a scelta (singola o multipla), sostituite. */
function scelteMostrate(q: Question): { parte: number; scelte: string[] }[] {
  return q
    .allParts()
    .filter((p) => p.type === "1_n_2" || p.type === "m_n_2")
    .map((p) => ({
      parte: p.index,
      scelte: ((p.settings as Record<string, unknown>).choices as string[]).map((c) => variables.substituteHtml(c, p.getScope())),
    }));
}

/** La forma di confronto di una risposta: senza marcatori e spazi, senza
 * le graffe che la sostituzione mette attorno a un numero (`{0{,}60}`; le
 * altre graffe restano: `\sqrt{x} - 1` e `\sqrt{x - 1}` sono risposte
 * diverse), con ogni numero in forma canonica (così «0,60» e «0,6» risultano
 * la stessa risposta, come le leggerebbe lo studente). */
function formaCanonica(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\\textrm|\\\(|\\\)|\\,|\s/g, "")
    .replace(/\{,\}/g, ",")
    .replace(/\\%/g, "%")
    .replace(/\{(-?\d+(?:,\d+)?)\}/g, "$1")
    .replace(/\{(-?\d+(?:,\d+)?)\}/g, "$1")
    .replace(/\d+(?:,\d+)?/g, (n) => String(Number(n.replace(",", "."))));
}

/** Un numero brutto: sei o più cifre decimali, o la notazione esponenziale. */
const NUMERO_BRUTTO = /\d(?:\{,\}|,|\.)\d{6,}|\d[eE][-+]\d/;

/** I difetti del testo mostrato per una domanda caricata. */
function difettiTesto(q: Question): string[] {
  const difetti: string[] = [];
  for (const { dove, testo: html } of testiMostrati(q)) {
    // Senza marcatori: i nomi delle immagini (uuid) non sono numeri.
    const testo = html.replace(/<[^>]*>/g, " ");
    for (const vietato of ["\\var", "NaN", "undefined", "Infinity"]) {
      if (testo.includes(vietato)) difetti.push(`${dove}: contiene «${vietato}»`);
    }
    const brutto = testo.match(NUMERO_BRUTTO);
    if (brutto) difetti.push(`${dove}: numero brutto «${brutto[0]}…»`);
  }
  for (const { parte, scelte } of scelteMostrate(q)) {
    const forme = scelte.map(formaCanonica);
    forme.forEach((f, i) => {
      const j = forme.indexOf(f);
      if (j !== i) difetti.push(`parte ${parte}: le risposte ${j} e ${i} coincidono (${scelte[i]})`);
    });
  }
  return difetti;
}

export interface OpzioniProva {
  /** Il nome nei titoli dei test, es. "INVALSI 2015". */
  nome: string;
  pacchetto: EsercizioPacchetto[];
  /** Quante domande ha il fascicolo. */
  domande: number;
  /** Per ogni domanda, una risposta giusta per parte (funzione dei valori
   * estratti per una domanda a numeri variabili). */
  soluzioni: Record<number, Soluzione>;
  /** [domanda, indice della parte, risposta sbagliata tipica]. */
  errori: [number, number, RispostaErrata][];
}

export function provaPacchettoInvalsi({ nome, pacchetto, domande, soluzioni, errori }: OpzioniProva): void {
  describe(`${nome}: i file`, () => {
    it(`sono ${domande}, uno per domanda, in ordine`, () => {
      expect(pacchetto.map((e) => e.domanda)).toEqual(Array.from({ length: domande }, (_, i) => i + 1));
    });

    it.each(pacchetto.map((e) => [e.nome, e] as const))("%s su disco coincide con lo script", (n, e) => {
      expect(readFileSync(path.join(DIR, `${n}.json`), "utf8")).toBe(testoFile(e.modello));
    });

    it("ogni argomento è uno dei quattro ambiti INVALSI", () => {
      for (const e of pacchetto) expect(AMBITI_INVALSI).toContain(e.modello.meta.argomento);
    });

    it("ogni immagine nominata esiste accanto agli esercizi (il seed la copia da lì)", () => {
      for (const { nome: n } of pacchetto) {
        const testo = readFileSync(path.join(DIR, `${n}.json`), "utf8");
        for (const m of testo.matchAll(/data-savint-immagine=\\"([^"\\]+)\\"/g)) {
          expect(existsSync(path.join(DIR, "immagini", m[1]!)), `${n}: ${m[1]}`).toBe(true);
        }
      }
    });

    it("le domande a numeri variabili lo dicono nella descrizione, e hanno la soluzione come funzione", () => {
      for (const e of pacchetto.filter((x) => x.modello.variabili.length > 0)) {
        expect(e.modello.meta.descrizione, e.nome).toContain("Numeri variabili");
        expect(typeof soluzioni[e.domanda], `${e.nome}: la soluzione deve essere una funzione dei valori`).toBe("function");
      }
    });
  });

  describe(`${nome}: verifica e riapertura nell'editor`, () => {
    it.each(pacchetto.map((e) => [e.nome, e] as const))("%s", (_n, e) => {
      const file = versoFile(e.modello);
      expect(verificaSuSemi(file.question as NumbasQuestionJSON)).toEqual({ ok: true });
      const riletto = daNumbas(file);
      expect(riletto.ok).toBe(true);
      if (riletto.ok) expect(riletto.editor).toEqual(e.modello);
    });
  });

  describe(`${nome}: il testo mostrato è pulito e le risposte a scelta sono tutte diverse`, () => {
    it.each(pacchetto.map((e) => [e.nome, e] as const))("%s", (n, e) => {
      const json = domanda(n);
      for (const seme of semiDi(e)) {
        expect(difettiTesto(carica(json, seme)), `seme ${seme}`).toEqual([]);
      }
    });
  });

  describe(`${nome}: le risposte giuste prendono tutti i punti`, () => {
    it.each(pacchetto.map((e) => [e.nome, e] as const))("%s", (n, e) => {
      const soluzione = soluzioni[e.domanda];
      expect(soluzione, `manca la soluzione della D${e.domanda}`).toBeDefined();
      const json = domanda(n);
      for (const seme of semiDi(e)) {
        const v = valori(carica(json, seme), e);
        const attese = typeof soluzione === "function" ? soluzione(v) : soluzione!;
        expect(attese).toHaveLength(e.modello.parti.length);
        const q = carica(json, seme);
        attese.forEach((risposta, i) => {
          expect(invia(json, seme, i, risposta), `seme ${seme}, parte ${i + 1}, ${JSON.stringify(v)}`).toBeCloseTo(1);
          if (typeof risposta === "object" && "scelta" in risposta && risposta.testo !== undefined) {
            const scelte = scelteMostrate(q).find((x) => x.parte === i)!.scelte;
            expect(formaCanonica(scelte[risposta.scelta]!), `seme ${seme}, parte ${i + 1}: il testo della risposta giusta`).toBe(
              formaCanonica(risposta.testo),
            );
          }
        });
      }
    });
  });

  describe(`${nome}: gli errori tipici non prendono tutti i punti`, () => {
    it.each(errori)("D%i, parte %i", (numero, parte, errata) => {
      const e = pacchetto.find((x) => x.domanda === numero)!;
      const json = domanda(e.nome);
      for (const seme of semiDi(e)) {
        const v = valori(carica(json, seme), e);
        const risposta = typeof errata === "function" ? errata(v) : errata;
        expect(invia(json, seme, parte, risposta), `seme ${seme}, ${JSON.stringify(v)}`).toBeLessThan(1);
      }
    });
  });
}
