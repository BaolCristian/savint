import { describe, it, expect } from "vitest";
import { esercizioEditorSchema } from "../modello";
import type { EsercizioEditor } from "../modello";

/** Stessa base minima di verso-numbas.test.ts, duplicata qui perche' questo
 * file non va toccato in questo task (vedi task-2-brief.md). */
const base: EsercizioEditor = {
  meta: { titolo: "T", descrizione: "", anno: 1, argomento: "equazioni",
          tag: [], difficolta: 1 },
  testo: "Risolvi \\(\\simplify{ {a}x+{b} }=0\\)",
  suggerimento: "",
  variabili: [
    { nome: "a", definizione: "random(2..9)", descrizione: "" },
    { nome: "b", definizione: "random(-9..9 except 0)", descrizione: "" },
  ],
  condizione: "",
  parti: [{ tipo: "numerica", consegna: "\\(x=\\)", punti: 2,
            valore: "-b/a", tolleranza: { tipo: "esatta" } }],
};

/** Un difetto del piano di Task 1: lo schema permetteva una parte da zero
 * punti. Per una parte a scelta multipla questo produce una matrice di
 * marcatura tutta a zero, e la posizione della risposta giusta smette di
 * essere ricostruibile dal file. Ogni parte deve valere almeno un punto. */
describe("esercizioEditorSchema - almeno un punto per parte", () => {
  it("rifiuta una parte numerica da zero punti", () => {
    const e = { ...base, parti: [{ ...base.parti[0], punti: 0 }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta una parte a scelta da zero punti", () => {
    const e = { ...base, parti: [{ tipo: "scelta" as const, consegna: "Q", punti: 0,
      risposte: ["a", "b"], indiceGiusta: 0 }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta una parte a espressione da zero punti", () => {
    const e = { ...base, parti: [{ tipo: "espressione" as const, consegna: "Q", punti: 0,
      risposta: "x" }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("accetta una parte da un punto", () => {
    const e = { ...base, parti: [{ ...base.parti[0], punti: 1 }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(true);
  });

  it("rifiuta punti negativi", () => {
    const e = { ...base, parti: [{ ...base.parti[0], punti: -1 }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });
});
