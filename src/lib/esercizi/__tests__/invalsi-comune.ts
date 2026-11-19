import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import { esercizioFileSchema } from "../format/schema";
import { verificaSuSemi } from "../editor/verifica";
import { daNumbas } from "../editor/da-numbas";
import { versoFile } from "../editor/verso-numbas";
import { AMBITI_INVALSI } from "../ambiti-invalsi";
import { testoFile, type EsercizioPacchetto } from "../../../../scripts/invalsi/comune";

/** Le prove comuni a ogni prova INVALSI trascritta (scripts/genera-invalsi-AAAA.ts).
 *
 * Le soluzioni le scrive A PARTE il file di test della prova, non le legge
 * dal modello: se nel modello un indice di risposta o un valore fosse
 * sbagliato, lo studente che risponde come la soluzione prenderebbe zero, e
 * la prova lo direbbe. */

const DIR = path.resolve(process.cwd(), "content/esercizi");

/** Una risposta come la consegna il player: numero/formula come testo
 * (con la virgola, come la scrive uno studente), scelta singola come indice
 * nell'ordine del fascicolo (A = 0), scelta multipla come caselle, tabella
 * Vero/Falso come un valore per affermazione nell'ordine del fascicolo. */
export type Risposta = string | { scelta: number } | { caselle: boolean[] } | { vf: boolean[] };

export const s = (scelta: number): Risposta => ({ scelta });
export const vf = (...v: boolean[]): Risposta => ({ vf: v });
export const caselle = (...c: boolean[]): Risposta => ({ caselle: c });
export const V = true;
export const F = false;

function invia(json: NumbasQuestionJSON, indiceParte: number, risposta: Risposta): number {
  const q = loadQuestion(json, { seed: "invalsi", locale: "it" });
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

export interface OpzioniProva {
  /** Il nome nei titoli dei test, es. "INVALSI 2015". */
  nome: string;
  pacchetto: EsercizioPacchetto[];
  /** Quante domande ha il fascicolo. */
  domande: number;
  /** Per ogni domanda, una risposta giusta per parte. */
  soluzioni: Record<number, Risposta[]>;
  /** [domanda, indice della parte, risposta sbagliata tipica]. */
  errori: [number, number, Risposta][];
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

  describe(`${nome}: le risposte giuste prendono tutti i punti`, () => {
    it.each(pacchetto.map((e) => [e.nome, e] as const))("%s", (n, e) => {
      const attese = soluzioni[e.domanda];
      expect(attese, `manca la soluzione della D${e.domanda}`).toBeDefined();
      expect(attese).toHaveLength(e.modello.parti.length);
      const json = domanda(n);
      attese!.forEach((risposta, i) => {
        expect(invia(json, i, risposta), `parte ${i + 1}`).toBeCloseTo(1);
      });
    });
  });

  describe(`${nome}: gli errori tipici non prendono tutti i punti`, () => {
    it.each(errori)("D%i, parte %i", (numero, parte, risposta) => {
      const e = pacchetto.find((x) => x.domanda === numero)!;
      expect(invia(domanda(e.nome), parte, risposta)).toBeLessThan(1);
    });
  });
}
