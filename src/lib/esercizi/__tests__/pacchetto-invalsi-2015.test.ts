import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import { esercizioFileSchema } from "../format/schema";
import { verificaSuSemi } from "../editor/verifica";
import { daNumbas } from "../editor/da-numbas";
import { versoFile } from "../editor/verso-numbas";
import { AMBITI_INVALSI } from "../ambiti-invalsi";
import { PACCHETTO_INVALSI_2015, testoFile } from "../../../../scripts/genera-invalsi-2015";

/** La prova INVALSI 2014/15 trascritta in 31 esercizi (scripts/genera-invalsi-2015.ts).
 * Le risposte giuste qui sotto sono scritte A PARTE, non lette dal modello:
 * se nel modello un indice di risposta o un valore fosse sbagliato, lo
 * studente che risponde come la soluzione ufficiale prenderebbe zero, e
 * questa prova lo direbbe. */

const DIR = path.resolve(process.cwd(), "content/esercizi");

/** Una risposta come la consegna il player: numero/formula come testo,
 * scelta singola come indice nell'ordine del docente, scelta multipla come
 * caselle, tabella Vero/Falso come una scelta per riga. */
type Risposta = string | { scelta: number } | { caselle: boolean[] } | { vf: boolean[] };

const s = (scelta: number) => ({ scelta });
const vf = (...v: boolean[]) => ({ vf: v });
const V = true;
const F = false;

const SOLUZIONI: Record<number, Risposta[]> = {
  1: [vf(V, V, F, V)],
  2: [s(2)],
  3: [vf(F, V, V)],
  4: ["98", "96", "94", "92", "100-2t", s(1)],
  5: [s(0)],
  6: ["1/4", "7"],
  7: ["20"],
  8: ["1,11", "32"],
  9: ["10", s(3)],
  10: [vf(V, F, V, V)],
  11: [s(1), s(3)],
  12: ["11", "-5"],
  13: [s(3), "14,05"],
  14: ["49", "1", "2", "3", "4"],
  15: [s(3)],
  16: [s(3)],
  17: ["11"],
  18: ["93", s(1)],
  19: ["9"],
  20: [s(1)],
  21: [s(1)],
  22: ["15/38"],
  23: ["69"],
  24: [s(1)],
  25: [s(0)],
  26: [s(3)],
  27: [vf(V, F, V, F)],
  28: [s(0), s(0)],
  29: [s(3)],
  30: [s(2)],
  31: [{ caselle: [V, V, V, V, V, F, F, F] }],
};

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
  return esercizioFileSchema.parse(JSON.parse(readFileSync(path.join(DIR, `${nome}.json`), "utf8"))).question as NumbasQuestionJSON;
}

describe("pacchetto INVALSI 2015: i file", () => {
  it("sono 31, uno per domanda, in ordine", () => {
    expect(PACCHETTO_INVALSI_2015.map((e) => e.domanda)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });

  it.each(PACCHETTO_INVALSI_2015.map((e) => [e.nome, e] as const))("%s su disco coincide con lo script", (nome, e) => {
    expect(readFileSync(path.join(DIR, `${nome}.json`), "utf8")).toBe(testoFile(e.modello));
  });

  it("ogni argomento è uno dei quattro ambiti INVALSI, e ogni ambito ha delle domande", () => {
    const usati = new Set(PACCHETTO_INVALSI_2015.map((e) => e.modello.meta.argomento));
    for (const a of usati) expect(AMBITI_INVALSI).toContain(a);
    expect(usati.size).toBe(AMBITI_INVALSI.length);
  });

  it("ogni immagine nominata esiste accanto agli esercizi (il seed la copia da lì)", () => {
    for (const { nome } of PACCHETTO_INVALSI_2015) {
      const testo = readFileSync(path.join(DIR, `${nome}.json`), "utf8");
      for (const m of testo.matchAll(/data-savint-immagine=\\"([^"\\]+)\\"/g)) {
        expect(existsSync(path.join(DIR, "immagini", m[1]!)), `${nome}: ${m[1]}`).toBe(true);
      }
    }
  });
});

describe("pacchetto INVALSI 2015: verifica e riapertura nell'editor", () => {
  it.each(PACCHETTO_INVALSI_2015.map((e) => [e.nome, e] as const))("%s", (_nome, e) => {
    const file = versoFile(e.modello);
    expect(verificaSuSemi(file.question as NumbasQuestionJSON)).toEqual({ ok: true });
    const riletto = daNumbas(file);
    expect(riletto.ok).toBe(true);
    if (riletto.ok) expect(riletto.editor).toEqual(e.modello);
  });
});

describe("pacchetto INVALSI 2015: le risposte giuste prendono tutti i punti", () => {
  it.each(PACCHETTO_INVALSI_2015.map((e) => [e.nome, e] as const))("%s", (nome, e) => {
    const soluzioni = SOLUZIONI[e.domanda]!;
    expect(soluzioni).toHaveLength(e.modello.parti.length);
    const json = domanda(nome);
    soluzioni.forEach((risposta, i) => {
      expect(invia(json, i, risposta), `parte ${i + 1}`).toBeCloseTo(1);
    });
  });
});

describe("pacchetto INVALSI 2015: gli errori tipici prendono zero", () => {
  const ERRORI: [number, number, Risposta][] = [
    [1, 0, vf(V, V, V, V)], // la tabella non vale tutta se una riga è sbagliata
    [4, 4, "100-7t"], // dimentica l'acqua che entra
    [6, 0, "12/52"], // toglie l'asso di cuori ma non dal totale delle carte
    [8, 0, "1,01"], // paga 7 minuti invece di 8
    [8, 1, "33"], // arrotonda per eccesso
    [13, 1, "14,1"], // non arrotonda ai centesimi
    [14, 0, "25"], // il numero di studenti, non la percentuale
    [17, 0, "16"], // dimentica carico e svuotamento
    [22, 0, "17/40"], // non toglie le palline estratte
    [23, 0, "75"], // media semplice di 85 e 65
    [31, 0, { caselle: [V, V, V, F, F, F, F, F] }], // solo i lati del quadrato
  ];
  it.each(ERRORI)("D%i, parte %i", (numero, parte, risposta) => {
    const e = PACCHETTO_INVALSI_2015.find((x) => x.domanda === numero)!;
    expect(invia(domanda(e.nome), parte, risposta)).toBeLessThan(1);
  });
});
