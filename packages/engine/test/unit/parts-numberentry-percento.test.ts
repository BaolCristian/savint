// @vitest-environment node

// Divergenza deliberata di SAVINT (vedi DIVERGENCES.md, «Simbolo di
// percentuale nelle risposte numeriche»): un «%» finale nella risposta dello
// studente si toglie prima di leggerla come numero. Numbas la rifiuterebbe
// come «non è un numero valido», e a un esercizio sugli sconti molti ragazzi
// rispondono «15%».

import { describe, it, expect } from "vitest";
import { createPart, markPart } from "./parts-helpers";

const STILI_EDITOR = ["plain", "en", "si-en", "plain-eu", "eu", "si-fr"];

describe("Number entry: il simbolo di percentuale", () => {
  const quindici = () =>
    createPart({ type: "numberentry", marks: 1, minValue: "15", maxValue: "15", notationStyles: STILI_EDITOR });

  it.each(["15%", "15 %", "15", " 15% "])("%j vale 15", (risposta) => {
    const res = markPart(quindici(), risposta);
    expect(res.valid).toBe(true);
    expect(res.credit).toBe(1);
  });

  it("anche con la virgola decimale: 12,5% vale 12,5", () => {
    const p = createPart({ type: "numberentry", marks: 1, minValue: "12.5", maxValue: "12.5", notationStyles: STILI_EDITOR });
    expect(markPart(p, "12,5%").credit).toBe(1);
  });

  it("una percentuale sbagliata resta sbagliata, ma valida", () => {
    const res = markPart(quindici(), "20%");
    expect(res.valid).toBe(true);
    expect(res.credit).toBe(0);
  });

  // Il simbolo si toglie, non diventa una divisione per cento: se la
  // risposta attesa è 0,15, «15%» è sbagliata. È la regola più prevedibile
  // da spiegare allo studente, ed è scritta qui perché nessuno la cambi
  // credendo di correggere un difetto.
  it("«15%» non vale 0,15", () => {
    const p = createPart({ type: "numberentry", marks: 1, minValue: "0.15", maxValue: "0.15", notationStyles: STILI_EDITOR });
    expect(markPart(p, "15%").credit).toBe(0);
  });

  it("un «%» da solo, o due, non è un numero", () => {
    expect(markPart(quindici(), "%").valid).toBe(false);
    expect(markPart(quindici(), "15%%").valid).toBe(false);
  });
});
