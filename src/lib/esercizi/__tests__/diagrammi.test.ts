import { describe, it, expect } from "vitest";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import { leggiSpecificaDiagramma, valutaDiagramma, percentuali } from "../diagrammi";

const domanda = (variabili: Record<string, string>): NumbasQuestionJSON => ({
  name: "d",
  variables: Object.fromEntries(Object.entries(variabili).map(([n, d]) => [n, { name: n, definition: d }])),
  parts: [],
});

describe("leggiSpecificaDiagramma", () => {
  it("legge tipo, valori ed etichette", () => {
    expect(leggiSpecificaDiagramma("barre", "dati", "giorni")).toEqual({ tipo: "barre", valori: "dati", etichette: "giorni" });
    expect(leggiSpecificaDiagramma("torta", "voti", undefined)).toEqual({ tipo: "torta", valori: "voti", etichette: null });
  });

  it.each([
    ["linee", "dati", undefined],
    ["barre", "", undefined],
    ["barre", "[1,2,3]", undefined],
    ["barre", "{dati}", undefined],
    ["barre", "dati", "x|y"],
  ])("rifiuta %j %j %j", (tipo, valori, etichette) => {
    expect(leggiSpecificaDiagramma(tipo, valori, etichette)).toBeNull();
  });
});

describe("valutaDiagramma", () => {
  it("calcola valori ed etichette con le variabili dello studente", () => {
    const q = loadQuestion(domanda({ dati: "[3, 5, 2]", giorni: '["Lun", "Mar", "Mer"]' }), { seed: "1" });
    expect(valutaDiagramma(q.scope, { tipo: "barre", valori: "dati", etichette: "giorni" })).toEqual({
      valori: [3, 5, 2], etichette: ["Lun", "Mar", "Mer"],
    });
  });

  it("senza etichette usa 1, 2, 3…", () => {
    const q = loadQuestion(domanda({ dati: "[3, 5]" }), { seed: "1" });
    expect(valutaDiagramma(q.scope, { tipo: "barre", valori: "dati", etichette: null }).etichette).toEqual(["1", "2"]);
  });

  it("i valori casuali cambiano col seme, come per ogni variabile", () => {
    const d = domanda({ dati: "repeat(random(1..100), 6)" });
    const a = valutaDiagramma(loadQuestion(d, { seed: "1" }).scope, { tipo: "barre", valori: "dati", etichette: null });
    const b = valutaDiagramma(loadQuestion(d, { seed: "2" }).scope, { tipo: "barre", valori: "dati", etichette: null });
    expect(a.valori).toHaveLength(6);
    expect(a.valori).not.toEqual(b.valori);
  });

  // Ogni difetto è un messaggio da docente: la verifica dei venti sorteggi
  // lo riporta così com'è.
  it.each([
    [{ dati: "5" }, "dati", "una lista"],
    [{ dati: "[]" }, "dati", "vuota"],
    [{ dati: "[1, -2]" }, "dati", "negativ"],
    [{ dati: "[0, 0]" }, "dati", "zero"],
    [{ dati: "[1, 2]", nomi: '["a"]' }, "dati", "etichette"],
  ])("rifiuta dati non disegnabili (%j)", (variabili, valori, frammento) => {
    const q = loadQuestion(domanda(variabili), { seed: "1" });
    const etichette = "nomi" in variabili ? "nomi" : null;
    expect(() => valutaDiagramma(q.scope, { tipo: "torta", valori, etichette })).toThrow(frammento);
  });

  it("una variabile non dichiarata lancia", () => {
    const q = loadQuestion(domanda({}), { seed: "1" });
    expect(() => valutaDiagramma(q.scope, { tipo: "barre", valori: "dati", etichette: null })).toThrow();
  });
});

describe("percentuali", () => {
  it("le fette della torta sommano a 100", () => {
    const p = percentuali([1, 1, 2]);
    expect(p).toEqual([25, 25, 50]);
  });
});
