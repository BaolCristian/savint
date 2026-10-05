import { describe, it, expect } from "vitest";
import { formulaSciolta } from "../formula-sciolta";

describe("formulaSciolta", () => {
  it.each([
    ["Calcola la soluzione di questa equazione: 3*x^2-6=0", "3*x^2-6=0"],
    ["Risolvi x^2 = 9", "x^2"],
    ["Quanto vale sqrt(16)?", "sqrt(16)?"],
    ["Semplifica 2*a + 3", "2*a"],
    ["Calcola \\frac{1}{2} di 10", "\\frac{1}{2}"],
  ])("in %j trova %j", (testo, atteso) => {
    expect(formulaSciolta(testo)).toBe(atteso);
  });

  it.each([
    "Risolvi l'equazione \\(3x^2-6=0\\)",
    "Testo normale, con una domanda: quanto vale?",
    "[grafico: a*x+b | x: -5..5]",
    "[diagramma: barre | valori: dati]",
    "[figura: rettangolo | misure: b*2, h | unità: cm]",
    "![x^2 in figura](3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90.png)",
    "Il 15% di 240, con \\[ x^2 \\] in display",
    "",
  ])("in %j non trova niente", (testo) => {
    expect(formulaSciolta(testo)).toBeNull();
  });
});
