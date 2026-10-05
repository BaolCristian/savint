import { describe, it, expect } from "vitest";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import { leggiSpecificaFigura, valutaFigura, vertici } from "../figure";

const domanda = (variabili: Record<string, string>): NumbasQuestionJSON => ({
  name: "f",
  variables: Object.fromEntries(Object.entries(variabili).map(([n, d]) => [n, { name: n, definition: d }])),
  parts: [],
});

describe("leggiSpecificaFigura", () => {
  it("legge tipo, misure, unità e incognite", () => {
    expect(leggiSpecificaFigura("triangolo rettangolo", "a, b", "cm", "3")).toEqual({
      tipo: "triangolo rettangolo", misure: ["a", "b"], unita: "cm", incognite: [3],
    });
    expect(leggiSpecificaFigura("cerchio", "r", undefined, undefined)).toEqual({
      tipo: "cerchio", misure: ["r"], unita: null, incognite: [],
    });
  });

  it.each([
    ["esagono", "a", undefined, undefined],
    ["rettangolo", "a", undefined, undefined],
    ["triangolo", "a, b", undefined, undefined],
    ["quadrato", "{l}", undefined, undefined],
    ["quadrato", "l", "c|m", undefined],
    ["rettangolo", "b, h", undefined, "5"],
  ])("rifiuta %j %j %j %j", (tipo, misure, unita, incognite) => {
    expect(leggiSpecificaFigura(tipo, misure, unita, incognite)).toBeNull();
  });
});

describe("valutaFigura", () => {
  it("le misure dello studente, e l'ipotenusa calcolata", () => {
    const q = loadQuestion(domanda({ a: "3", b: "4" }), { seed: "1" });
    const s = leggiSpecificaFigura("triangolo rettangolo", "a, b", "cm", undefined)!;
    expect(valutaFigura(q.scope, s)).toEqual({ misure: [3, 4], etichette: [3, 4, 5] });
  });

  it.each([
    [{ l: "0" }, "quadrato", "l", "positiv"],
    [{ l: "-2" }, "quadrato", "l", "positiv"],
    [{ a: "1", b: "2", c: "5" }, "triangolo", "a, b, c", "triangolo"],
  ])("rifiuta misure impossibili (%j)", (variabili, tipo, misure, frammento) => {
    const q = loadQuestion(domanda(variabili), { seed: "1" });
    expect(() => valutaFigura(q.scope, leggiSpecificaFigura(tipo, misure, undefined, undefined)!)).toThrow(frammento);
  });
});

describe("vertici", () => {
  it("un triangolo dai tre lati ha davvero quei lati", () => {
    const [A, B, C] = vertici("triangolo", [5, 4, 3]);
    const d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
    expect(d(A!, B!)).toBeCloseTo(5);
    expect(d(B!, C!)).toBeCloseTo(4);
    expect(d(C!, A!)).toBeCloseTo(3);
  });

  it("il triangolo rettangolo ha l'angolo retto nel primo vertice", () => {
    const [A, B, C] = vertici("triangolo rettangolo", [3, 4]);
    expect((B!.x - A!.x) * (C!.x - A!.x) + (B!.y - A!.y) * (C!.y - A!.y)).toBeCloseTo(0);
  });
});
