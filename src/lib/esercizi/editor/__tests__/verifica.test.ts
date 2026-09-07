import { describe, it, expect } from "vitest";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import { verificaSuSemi } from "../verifica";
import { versoNumbas } from "../verso-numbas";
import type { EsercizioEditor } from "../modello";

/** Stessa base minima di verso-numbas.test.ts (Task 1), duplicata qui: quel
 * file non va toccato in questo task. */
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

describe("verificaSuSemi", () => {
  it("un esercizio sano passa venti semi", () => {
    expect(verificaSuSemi(versoNumbas(base))).toEqual({ ok: true });
  });

  it("una definizione che divide per zero fallisce solo su alcuni semi, non su tutti", () => {
    // b e' definita come random(1..(1/a)): quando a vale 0 (semi 14 e 17,
    // con questo generatore) l'estremo 1/a e' infinito e generare un numero
    // casuale in quell'intervallo lancia. Sugli altri diciotto semi a e'
    // diverso da zero e l'esercizio carica senza problemi: e' proprio
    // l'intermittenza — non un fallimento su ogni seme — a dimostrare che
    // questo esercizio si rompe SOLO per certi valori della variabile,
    // come nella vita vera di un esercizio a variabili casuali.
    const e: EsercizioEditor = { ...base, variabili: [
      { nome: "a", definizione: "random(-3..3)", descrizione: "" },
      { nome: "b", definizione: "random(1..(1/a))", descrizione: "" }],
      parti: [{ tipo: "numerica", consegna: "\\(x=\\)", punti: 2,
                valore: "b", tolleranza: { tipo: "esatta" } }] };
    const question = versoNumbas(e);

    // verificaSuSemi si ferma al primo fallimento per costruzione: non puo'
    // dire da sola quali semi FALLISCONO dopo il primo. Per riportare
    // l'elenco completo (richiesto dal task) si richiama qui direttamente
    // il motore, seme per seme, indipendentemente dalla funzione sotto test.
    const passati: number[] = [];
    const falliti: number[] = [];
    for (let seme = 0; seme < 20; seme++) {
      try {
        loadQuestion(question as NumbasQuestionJSON, { seed: String(seme), locale: "it" });
        passati.push(seme);
      } catch {
        falliti.push(seme);
      }
    }
    expect(falliti).toEqual([14, 17]);
    expect(passati.length).toBe(18);

    // verificaSuSemi deve fermarsi al primo dei due: il seme 14.
    const esito = verificaSuSemi(question);
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("caricamento");
      expect(esito.seme).toBe(14);
    }
  });

  it("un \\var{} che nomina una variabile inesistente viene intercettato", () => {
    // "zeta" non e' fra le variabili dell'esercizio. Usata da sola dentro
    // \var{} il motore la tratterebbe come un simbolo libero (comportamento
    // di JME, non un baco) e non lancerebbe affatto — per questo qui e'
    // dentro un'espressione (2*zeta): un nome libero moltiplicato da un
    // numero forza davvero la ricerca della variabile, che fallisce.
    const e: EsercizioEditor = { ...base, testo: "Il valore e' \\(\\var{2*zeta}\\)" };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("caricamento");
      expect(esito.seme).toBe(0);
    }
  });

  it("una condizione impossibile viene intercettata, non attesa all'infinito", () => {
    // a e' random(2..9): non supera mai 100. variablesTest.maxRuns e' 10
    // (versoNumbas), quindi il motore esaurisce i tentativi e lancia invece
    // di rimanere in attesa.
    const e: EsercizioEditor = { ...base, condizione: "a > 100" };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("caricamento");
      expect(esito.seme).toBe(0);
    }
  });

  it("una risposta attesa che rende con 'undefined' viene intercettata (difetto noto del motore)", () => {
    // sqrt() senza argomento: renderLatex("sqrt()") restituisce
    // "\\sqrt{ undefined }" invece di lanciare (difetto registrato del
    // motore). correctAnswer() qui NON lancia: restituisce la stringa
    // "sqrt()" cosi' com'e', ed e' il rendering successivo a tradire la
    // risposta incompleta.
    const e: EsercizioEditor = { ...base, parti: [
      { tipo: "espressione", consegna: "x", punti: 2, risposta: "sqrt()" }] };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("risposta");
      expect(esito.seme).toBe(0);
    }
  });

  it("si ferma al primo seme che fallisce", () => {
    // un esercizio rotto per OGNI seme deve riportare il seme 0, non 20 su
    // 20: la funzione deve fermarsi al primo, non contare i falliti.
    const e: EsercizioEditor = { ...base, variabili: [
      { nome: "a", definizione: "random(2..9)", descrizione: "" }],
      parti: [{ tipo: "numerica", consegna: "x", punti: 2,
                valore: "sqrt(-a)", tolleranza: { tipo: "esatta" } }] };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.seme).toBe(0);
  });

  it("quanti e' opzionale e vale venti di default: con un solo seme sano non basta a dirsi passato", () => {
    // Se quanti fosse ignorato e si controllassero sempre venti semi, un
    // esercizio che fallisce solo al seme 14 risulterebbe comunque "ok"
    // quando gli si chiede di controllarne soli dieci.
    const e: EsercizioEditor = { ...base, variabili: [
      { nome: "a", definizione: "random(-3..3)", descrizione: "" },
      { nome: "b", definizione: "random(1..(1/a))", descrizione: "" }],
      parti: [{ tipo: "numerica", consegna: "\\(x=\\)", punti: 2,
                valore: "b", tolleranza: { tipo: "esatta" } }] };
    const question = versoNumbas(e);
    expect(verificaSuSemi(question, 10)).toEqual({ ok: true });
    const esito = verificaSuSemi(question, 15);
    expect(esito.ok).toBe(false);
  });
});
