import { describe, it, expect } from "vitest";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import { versoNumbas } from "../verso-numbas";
import { opzioniMotore } from "../../opzioni-motore";
import type { EsercizioEditor } from "../modello";

/** La correzione di una parte «scelta multipla con più risposte giuste»
 * provata sul motore vero, non sul JSON: è il motore che decide il voto
 * dello studente, e le impostazioni Numbas di m_n_2 hanno predefiniti
 * (`sum ticked cells`, `maxMarks` letto al posto di `marks`) che darebbero
 * punteggi parziali o sbagliati senza che il JSON lo lasci intuire. */
const esercizio: EsercizioEditor = {
  meta: { titolo: "T", descrizione: "", anno: 1, argomento: "numeri", tag: [], difficolta: 1 },
  testo: "Guarda i numeri",
  suggerimento: "",
  variabili: [],
  condizione: "",
  parti: [{
    tipo: "sceltaMultipla",
    consegna: "Quali sono pari?",
    punti: 3,
    risposte: ["2", "3", "4", "5"],
    corrette: [true, false, true, false],
    spiegazioni: ["", "3 è dispari", "", ""],
  }],
};

/** Carica l'esercizio col motore, come fanno il player e il server
 * (`ricalcola`, marking.ts), e consegna le spunte dello studente: una per
 * risposta, nell'ordine in cui il docente le ha scritte (il mescolamento è
 * solo di presentazione, la risposta resta indicizzata così). */
function correggi(spunte: boolean[], seed = "s1") {
  const q = loadQuestion(versoNumbas(esercizio) as NumbasQuestionJSON, { seed, ...opzioniMotore("it") });
  const parte = q.getPart("p0")!;
  parte.submit(spunte);
  q.updateScore();
  return { credito: parte.credit, punteggio: q.score(), parte };
}

describe("scelta multipla con più risposte giuste: tutto o niente", () => {
  it("tutte e sole le risposte giuste: credito pieno, tutti i punti", () => {
    const { credito, punteggio } = correggi([true, false, true, false]);
    expect(credito).toBe(1);
    expect(punteggio.score).toBe(3);
    expect(punteggio.marks).toBe(3);
  });

  it("una risposta giusta mancante: zero", () => {
    const { credito, punteggio } = correggi([true, false, false, false]);
    expect(credito).toBe(0);
    expect(punteggio.score).toBe(0);
    expect(punteggio.marks).toBe(3);
  });

  it("tutte le giuste più una sbagliata: zero", () => {
    const { credito, punteggio } = correggi([true, true, true, false]);
    expect(credito).toBe(0);
    expect(punteggio.score).toBe(0);
  });

  it("nessuna spunta: zero, senza errori", () => {
    expect(correggi([false, false, false, false]).credito).toBe(0);
  });

  it("tutte spuntate: zero", () => {
    expect(correggi([true, true, true, true]).credito).toBe(0);
  });

  it("la spiegazione scritta dal docente compare quando lo studente spunta quella risposta", () => {
    const { parte } = correggi([true, true, true, false]);
    const testi = (parte.result?.feedback ?? []).map((f) => JSON.stringify(f)).join(" ");
    expect(testi).toContain("3 è dispari");
  });

  it("la risposta corretta che il motore rivela è quella del docente", () => {
    const q = loadQuestion(versoNumbas(esercizio) as NumbasQuestionJSON, { seed: "s1", ...opzioniMotore("it") });
    expect(q.getPart("p0")!.correctAnswer()).toEqual([[true], [false], [true], [false]]);
  });

  it("le risposte sono mescolate per ogni studente, come per la scelta singola", () => {
    const ordini = new Set<string>();
    for (let seme = 0; seme < 20; seme++) {
      const q = loadQuestion(versoNumbas(esercizio) as NumbasQuestionJSON, { seed: String(seme), ...opzioniMotore("it") });
      ordini.add(JSON.stringify((q.getPart("p0") as unknown as { shuffleAnswers: number[] }).shuffleAnswers));
    }
    expect(ordini.size).toBeGreaterThan(1);
  });
});
