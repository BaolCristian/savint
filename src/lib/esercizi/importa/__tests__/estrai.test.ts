import { describe, it, expect } from "vitest";
import { estraiEsercizi, normalizza } from "../estrai";

const es = { meta: { titolo: "T" }, testo: "x", parti: [] };

describe("estraiEsercizi", () => {
  it("involucro { esercizi }", () =>
    expect(estraiEsercizi(JSON.stringify({ esercizi: [es, es] }))).toEqual({ ok: true, elementi: [es, es] }));
  it("array nudo", () => expect(estraiEsercizi(JSON.stringify([es]))).toEqual({ ok: true, elementi: [es] }));
  it("oggetto singolo", () => expect(estraiEsercizi(JSON.stringify(es))).toEqual({ ok: true, elementi: [es] }));
  it("blocco ```json con testo attorno", () =>
    expect(estraiEsercizi("Ecco:\n```json\n" + JSON.stringify({ esercizi: [es] }) + "\n```\nBuon lavoro!")).toEqual({
      ok: true,
      elementi: [es],
    }));
  it("toglie il BOM", () => expect(estraiEsercizi("﻿" + JSON.stringify([es])).ok).toBe(true));
  it("vuoto", () => expect(estraiEsercizi("   ")).toMatchObject({ ok: false, motivo: "vuoto" }));
  it("virgolette tipografiche → non_json leggibile", () => {
    const r = estraiEsercizi("{“esercizi”: []}");
    expect(r).toMatchObject({ ok: false, motivo: "non_json" });
    expect((r as { messaggio: string }).messaggio).toMatch(/JSON/);
  });
  // Per il client, che traduce: il dettaglio grezzo di JSON.parse e se nel
  // JSON ci sono virgolette tipografiche, separati dalla frase italiana.
  it("non_json porta il dettaglio di JSON.parse e il segnale delle virgolette", () => {
    let atteso = "";
    try {
      JSON.parse("{“esercizi”: []}");
    } catch (e) {
      atteso = (e as Error).message;
    }
    expect(estraiEsercizi("{“esercizi”: []}")).toMatchObject({
      ok: false, motivo: "non_json", dettaglio: atteso, virgolette: true,
    });
  });
  it("non_json senza virgolette tipografiche nel JSON → virgolette: false", () => {
    // Le virgolette nella frase di cortesia fuori dal JSON non contano.
    expect(estraiEsercizi("Ecco “il file”: {\"a\": 1,}")).toMatchObject({
      ok: false, motivo: "non_json", virgolette: false,
    });
  });
  it("più di 30 → troppi", () =>
    expect(estraiEsercizi(JSON.stringify(Array(31).fill(es)))).toMatchObject({ ok: false, motivo: "troppi" }));
  it("array vuoto → vuoto", () => expect(estraiEsercizi("[]")).toMatchObject({ ok: false, motivo: "vuoto" }));
});

describe("normalizza", () => {
  it("normalizza aggiunge solo i vuoti mancanti", () =>
    expect(normalizza({ meta: { titolo: "T" }, testo: "x", parti: [] })).toEqual({
      meta: { titolo: "T", descrizione: "", tag: [] },
      testo: "x",
      parti: [],
      suggerimento: "",
      variabili: [],
      condizione: "",
    }));
  it("normalizza non sovrascrive i presenti", () => {
    const pieno = {
      meta: { titolo: "T", descrizione: "d", tag: ["a"] },
      testo: "x",
      suggerimento: "s",
      variabili: [],
      condizione: "c",
      parti: [],
    };
    expect(normalizza(pieno)).toEqual(pieno);
  });
  it("normalizza lascia stare i non-oggetti", () => {
    expect(normalizza(null)).toBeNull();
    expect(normalizza("x")).toBe("x");
  });
});
