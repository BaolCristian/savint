import { describe, it, expect } from "vitest";
import { cosaManca } from "../completezza";
import type { EsercizioEditor } from "../modello";

const completo: EsercizioEditor = {
  meta: { titolo: "T", descrizione: "", anno: 1, argomento: "equazioni", tag: [], difficolta: 1 },
  testo: "Risolvi \\(\\simplify{ {a}x+{b} }=0\\)",
  suggerimento: "",
  variabili: [
    { nome: "a", definizione: "random(2..9)", descrizione: "" },
    { nome: "b", definizione: "random(-9..9 except 0)", descrizione: "" },
  ],
  condizione: "",
  parti: [{ tipo: "numerica", consegna: "\\(x=\\)", punti: 2, valore: "-b/a", tolleranza: { tipo: "esatta" } }],
};

describe("cosaManca", () => {
  it("un esercizio completo non manca di nulla", () => {
    expect(cosaManca(completo)).toEqual([]);
  });

  // Il caso del docente che ha scritto solo titolo e testo: il server
  // rispondeva "invalid_body" e la pagina diceva soltanto «Salvataggio non
  // riuscito», senza nominare nessuna delle due cose da fare.
  it("nomina l'argomento vuoto e l'assenza di parti", () => {
    const e = { ...completo, meta: { ...completo.meta, argomento: "" }, parti: [] };
    expect(cosaManca(e)).toEqual([{ chiave: "argomento" }, { chiave: "parti" }]);
  });

  it("nomina il titolo vuoto", () => {
    const e = { ...completo, meta: { ...completo.meta, titolo: "" } };
    expect(cosaManca(e)).toEqual([{ chiave: "titolo" }]);
  });

  it("indica quale parte è incompleta, contando da uno, una volta sola", () => {
    const e = {
      ...completo,
      parti: [completo.parti[0]!, { tipo: "numerica" as const, consegna: "", punti: 0, valore: "", tolleranza: { tipo: "esatta" as const } }],
    };
    expect(cosaManca(e)).toEqual([{ chiave: "parte", numero: 2 }]);
  });

  it("indica quale variabile è incompleta", () => {
    const e = { ...completo, variabili: [{ nome: "a", definizione: "", descrizione: "" }] };
    expect(cosaManca(e)).toEqual([{ chiave: "variabile", numero: 1 }]);
  });

  it("qualunque altro difetto diventa una voce generica, non un silenzio", () => {
    const e = { ...completo, meta: { ...completo.meta, difficolta: 9 } };
    expect(cosaManca(e)).toEqual([{ chiave: "altro" }]);
  });
});
