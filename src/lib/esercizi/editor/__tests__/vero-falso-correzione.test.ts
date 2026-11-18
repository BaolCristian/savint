import { describe, it, expect } from "vitest";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import { versoNumbas } from "../verso-numbas";
import { opzioniMotore } from "../../opzioni-motore";
import type { EsercizioEditor, ParteEditor } from "../modello";

/** La correzione di una tabella Vero/Falso provata sul motore vero: le
 * impostazioni di m_n_x hanno predefiniti (il radiogroup impone "sum ticked
 * cells", `maxMarks` letto al posto di `marks`, la matrice trasposta al
 * caricamento) che il JSON da solo non lascia intuire. */
function esercizio(parte: Partial<Extract<ParteEditor, { tipo: "veroFalso" }>> = {}): EsercizioEditor {
  return {
    meta: { titolo: "T", descrizione: "", anno: 2, argomento: "geometria", tag: [], difficolta: 1 },
    testo: "Indica se ciascuna affermazione è vera o falsa.",
    suggerimento: "",
    variabili: [],
    condizione: "",
    parti: [{
      tipo: "veroFalso",
      consegna: "",
      punti: 4,
      affermazioni: ["Un quadrato è un rombo", "Un rombo è un quadrato", "Un rettangolo è un parallelogramma", "Un trapezio ha 5 lati"],
      vere: [true, false, true, false],
      spiegazioni: ["", "Un rombo ha i lati uguali ma non per forza gli angoli retti", "", ""],
      ...parte,
    }],
  };
}

/** Le scelte dello studente, una per affermazione nell'ordine del docente
 * (`true` = Vero, `false` = Falso, `null` = nessuna), tradotte nella matrice
 * `ticks` `[colonna][affermazione]` che il player consegna (griglia.tsx). */
function correggi(scelte: (boolean | null)[], e = esercizio(), seed = "s1") {
  const q = loadQuestion(versoNumbas(e) as NumbasQuestionJSON, { seed, ...opzioniMotore("it") });
  const parte = q.getPart("p0")!;
  parte.submit([scelte.map((s) => s === true), scelte.map((s) => s === false)]);
  q.updateScore();
  return { credito: parte.credit, punteggio: q.score(), parte };
}

describe("tabella Vero/Falso: credito parziale riga per riga", () => {
  it("tutte giuste: credito pieno, tutti i punti", () => {
    const { credito, punteggio } = correggi([true, false, true, false]);
    expect(credito).toBe(1);
    expect(punteggio.score).toBe(4);
    expect(punteggio.marks).toBe(4);
  });

  it("tre giuste su quattro: tre quarti dei punti", () => {
    const { credito, punteggio } = correggi([true, true, true, false]);
    expect(credito).toBeCloseTo(0.75);
    expect(punteggio.score).toBeCloseTo(3);
  });

  it("tutte sbagliate: zero, mai sotto zero", () => {
    const { credito, punteggio } = correggi([false, true, false, true]);
    expect(credito).toBe(0);
    expect(punteggio.score).toBe(0);
  });

  it("righe lasciate vuote: valgono zero, le altre contano", () => {
    const { credito } = correggi([true, null, null, null]);
    expect(credito).toBeCloseTo(0.25);
  });

  it("punti non divisibili per il numero di affermazioni: la somma torna esatta", () => {
    const e = esercizio({ punti: 1, affermazioni: ["a", "b", "c"], vere: [true, true, false], spiegazioni: undefined });
    const { credito, punteggio } = correggi([true, true, false], e);
    expect(credito).toBeCloseTo(1);
    expect(punteggio.score).toBeCloseTo(1);
    expect(punteggio.marks).toBe(1);
  });

  it("due affermazioni (griglia quadrata 2×2): le colonne non si scambiano", () => {
    const e = esercizio({ punti: 2, affermazioni: ["vera", "falsa"], vere: [true, false], spiegazioni: undefined });
    expect(correggi([true, false], e).credito).toBe(1);
    expect(correggi([false, true], e).credito).toBe(0);
  });

  it("la spiegazione del docente compare quando lo studente sbaglia quell'affermazione", () => {
    const { parte } = correggi([true, true, true, false]);
    const testi = (parte.result?.feedback ?? []).map((f) => JSON.stringify(f)).join(" ");
    expect(testi).toContain("non per forza gli angoli retti");
  });

  it("la spiegazione non compare a chi risponde giusto", () => {
    const { parte } = correggi([true, false, true, false]);
    const testi = (parte.result?.feedback ?? []).map((f) => JSON.stringify(f)).join(" ");
    expect(testi).not.toContain("non per forza gli angoli retti");
  });

  it("la risposta corretta che il motore rivela è quella del docente", () => {
    const q = loadQuestion(versoNumbas(esercizio()) as NumbasQuestionJSON, { seed: "s1", ...opzioniMotore("it") });
    // [colonna][affermazione]: colonna 0 = Vero, colonna 1 = Falso.
    expect(q.getPart("p0")!.correctAnswer()).toEqual([
      [true, false, true, false],
      [false, true, false, true],
    ]);
  });

  it("le affermazioni sono mescolate per ogni studente, le colonne Vero/Falso mai", () => {
    const righe = new Set<string>();
    for (let seme = 0; seme < 20; seme++) {
      const q = loadQuestion(versoNumbas(esercizio()) as NumbasQuestionJSON, { seed: String(seme), ...opzioniMotore("it") });
      const p = q.getPart("p0") as unknown as { shuffleChoices: number[]; shuffleAnswers: number[] };
      righe.add(JSON.stringify(p.shuffleChoices));
      expect(p.shuffleAnswers).toEqual([0, 1]);
    }
    expect(righe.size).toBeGreaterThan(1);
  });
});
