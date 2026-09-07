import { describe, it, expect } from "vitest";
import { versoNumbas, versoFile } from "../verso-numbas";
import { esercizioEditorSchema } from "../modello";
import { esercizioFileSchema } from "../../format/schema";
import type { EsercizioEditor } from "../modello";

/** Forma minima del blocco `question` prodotto da `versoNumbas`, solo per
 * leggere i campi che i test controllano: `versoNumbas` dichiara `unknown`
 * perché il motore non ne vincola la forma qui, ma i test devono comunque
 * poter accedere ai campi senza `any`. */
type QuestioneNumbas = {
  parts: Array<Record<string, unknown>>;
  ungrouped_variables: string[];
};
const parte = (q: unknown, i = 0) => (q as QuestioneNumbas).parts[i];

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

describe("tolleranza -> minValue/maxValue", () => {
  it("esatta produce estremi uguali", () => {
    const p = parte(versoNumbas(base));
    expect(p.minValue).toBe("-b/a");
    expect(p.maxValue).toBe("-b/a");
  });

  it("il margine produce un intervallo centrato, con il valore fra parentesi", () => {
    const e = { ...base, parti: [{ ...base.parti[0], tipo: "numerica",
      valore: "(c-b)/a", tolleranza: { tipo: "margine", margine: "0.01" } }] };
    const p = parte(versoNumbas(e as EsercizioEditor));
    expect(p.minValue).toBe("((c-b)/a) - (0.01)");
    expect(p.maxValue).toBe("((c-b)/a) + (0.01)");
  });

  it("le cifre decimali non allargano l'intervallo ma impostano la precisione", () => {
    const e = { ...base, parti: [{ ...base.parti[0], tipo: "numerica",
      valore: "pi", tolleranza: { tipo: "decimali", cifre: 2 } }] };
    const p = parte(versoNumbas(e as EsercizioEditor));
    expect(p.minValue).toBe("pi");
    expect(p.maxValue).toBe("pi");
    expect(p.precision).toBe("2");
    expect(p.precisionType).toBe("dp");
  });
});

describe("scelta multipla", () => {
  it("mette i punti sulla riga giusta e zero sulle altre", () => {
    const e: EsercizioEditor = { ...base, parti: [{ tipo: "scelta",
      consegna: "Quale?", punti: 3,
      risposte: ["primo", "secondo", "terzo"], indiceGiusta: 1 }] };
    const p = parte(versoNumbas(e));
    expect(p.type).toBe("1_n_2");
    expect(p.matrix).toEqual(["0", "3", "0"]);
    expect(p.choices).toEqual(["<p>primo</p>", "<p>secondo</p>", "<p>terzo</p>"]);
    expect(p.shuffleChoices).toBe(true);
  });
});

describe("espressione", () => {
  it("porta la risposta come answer di una parte jme", () => {
    const e: EsercizioEditor = { ...base, parti: [{ tipo: "espressione",
      consegna: "Semplifica", punti: 4, risposta: "a*x+b" }] };
    const p = parte(versoNumbas(e));
    expect(p.type).toBe("jme");
    expect(p.marks).toBe(4);
    expect(p.answer).toBe("a*x+b");
    expect(p.checkingType).toBe("absdiff");
  });
});

describe("l'involucro", () => {
  it("versoFile produce un file che lo schema esistente accetta", () => {
    const file = versoFile(base);
    expect(() => esercizioFileSchema.parse(file)).not.toThrow();
    expect(file.savint.version).toBe(1);
    expect(file.savint.title).toBe("T");
  });

  it("dichiara ogni variabile in ungrouped_variables", () => {
    const q = versoNumbas(base) as QuestioneNumbas;
    expect(q.ungrouped_variables).toEqual(["a", "b"]);
  });
});

describe("esercizioEditorSchema - casi limite", () => {
  it("accetta l'esercizio base", () => {
    expect(esercizioEditorSchema.safeParse(base).success).toBe(true);
  });

  it("rifiuta un nome di variabile che non è un identificatore", () => {
    const e = { ...base, variabili: [{ nome: "1a", definizione: "1", descrizione: "" }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta parti vuoto", () => {
    const e = { ...base, parti: [] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta indiceGiusta fuori dall'intervallo delle risposte", () => {
    const e = { ...base, parti: [{ tipo: "scelta", consegna: "Q", punti: 1,
      risposte: ["a", "b"], indiceGiusta: 2 }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta meno di 2 risposte", () => {
    const e = { ...base, parti: [{ tipo: "scelta", consegna: "Q", punti: 1,
      risposte: ["a"], indiceGiusta: 0 }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta più di 6 risposte", () => {
    const e = { ...base, parti: [{ tipo: "scelta", consegna: "Q", punti: 1,
      risposte: ["a", "b", "c", "d", "e", "f", "g"], indiceGiusta: 0 }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta anno fuori da 1..5", () => {
    const e = { ...base, meta: { ...base.meta, anno: 6 } };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta anno sotto 1", () => {
    const e = { ...base, meta: { ...base.meta, anno: 0 } };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta difficolta' fuori da 1..3", () => {
    const e = { ...base, meta: { ...base.meta, difficolta: 4 } };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta difficolta' sotto 1", () => {
    const e = { ...base, meta: { ...base.meta, difficolta: 0 } };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta cifre fuori da 0..6", () => {
    const e = { ...base, parti: [{ ...base.parti[0],
      tolleranza: { tipo: "decimali", cifre: 7 } }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta cifre negative", () => {
    const e = { ...base, parti: [{ ...base.parti[0],
      tolleranza: { tipo: "decimali", cifre: -1 } }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });
});

describe("esercizioEditorSchema - rifiuta i marcatori nei campi di testo", () => {
  const payload = "<script>alert(1)</script>";

  it("rifiuta i marcatori nel testo (statement)", () => {
    const e = { ...base, testo: payload };
    const r = esercizioEditorSchema.safeParse(e);
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = JSON.stringify(r.error.issues);
      expect(msg).toMatch(/\\\(/);
    }
  });

  it("rifiuta i marcatori nel suggerimento (advice)", () => {
    const e = { ...base, suggerimento: payload };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta i marcatori nella descrizione della variabile", () => {
    const e = { ...base, variabili: [{ nome: "a", definizione: "1", descrizione: payload }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta i marcatori nella consegna di una parte numerica", () => {
    const e = { ...base, parti: [{ ...base.parti[0], consegna: payload }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta i marcatori nella consegna di una parte a scelta", () => {
    const e = { ...base, parti: [{ tipo: "scelta", consegna: payload, punti: 1,
      risposte: ["a", "b"], indiceGiusta: 0 }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta i marcatori nel testo di una risposta a scelta", () => {
    const e = { ...base, parti: [{ tipo: "scelta", consegna: "Q", punti: 1,
      risposte: [payload, "b"], indiceGiusta: 0 }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta i marcatori nella consegna di una parte espressione", () => {
    const e = { ...base, parti: [{ tipo: "espressione", consegna: payload, punti: 1,
      risposta: "x" }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("accetta le formule scritte fra \\( \\)", () => {
    const e = { ...base, testo: "Risolvi \\(x^2=4\\)" };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(true);
  });
});
