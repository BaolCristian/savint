import { describe, it, expect } from "vitest";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import { esercizioEditorSchema, type EsercizioEditor } from "@/lib/esercizi/editor/modello";
import { versoNumbas } from "@/lib/esercizi/editor/verso-numbas";
import { verificaEsercizio } from "@/lib/esercizi/redazione";
import { ESEMPIO_IMPORT, promptEsercizi } from "../prompt";

describe("ESEMPIO_IMPORT", () => {
  it("ogni esempio passa schema e verifica su semi", () => {
    for (const e of ESEMPIO_IMPORT.esercizi) {
      expect(esercizioEditorSchema.safeParse(e).success).toBe(true);
      expect(verificaEsercizio(e)).toEqual({ ok: true });
    }
  });

  it("due esercizi: distanza (con condizione, decimali 2) e punto medio (due parti numeriche)", () => {
    const [distanza, medio] = ESEMPIO_IMPORT.esercizi;
    expect(distanza!.condizione).not.toBe("");
    expect(distanza!.parti).toEqual([expect.objectContaining({ tipo: "numerica", tolleranza: { tipo: "decimali", cifre: 2 } })]);
    expect(medio!.parti).toHaveLength(2);
    expect(medio!.parti.every((p) => p.tipo === "numerica")).toBe(true);
  });
});

describe("promptEsercizi", () => {
  it("il prompt contiene l'esempio, l'argomento, la classe e il numero", () => {
    const p = promptEsercizi({ argomento: "piano cartesiano", classe: 2, quanti: 7 }, "it");
    expect(p).toContain(JSON.stringify(ESEMPIO_IMPORT, null, 2));
    expect(p).toContain("piano cartesiano");
    expect(p).toMatch(/"anno": 2|anno.*2/);
    expect(p).toContain("7");
  });

  it("il prompt vieta grafici e figure", () =>
    expect(promptEsercizi({ argomento: "x", classe: 1, quanti: 1 }, "it")).toMatch(/grafic/i));

  it("esiste la versione inglese", () =>
    expect(promptEsercizi({ argomento: "x", classe: 1, quanti: 1 }, "en")).toMatch(/JSON/));

  it("in entrambe le lingue: esempio, classe, quanti, e i vincoli che lo schema impone", () => {
    for (const locale of ["it", "en"] as const) {
      const p = promptEsercizi({ argomento: "equazioni di primo grado", classe: 3, quanti: 12 }, locale);
      expect(p).toContain(JSON.stringify(ESEMPIO_IMPORT, null, 2));
      expect(p).toContain("equazioni di primo grado");
      expect(p).toContain('"anno": 3');
      expect(p).toContain("12");
      for (const chiave of ["indiceGiusta", "corrette", "sceltaMultipla", "espressione", "decimali", "margine", "esatta", "condizione", "\\var{", "\\(", "random(", "{ \"esercizi\""]) {
        expect(p, `${locale}: ${chiave}`).toContain(chiave);
      }
    }
  });
});

// Il prompt cita `\simplify{}` per i coefficienti dentro una formula: si
// verifica qui che la forma esatta mostrata all'IA passi davvero la verifica.
describe("la forma \\simplify citata nel prompt", () => {
  it("passa schema e verifica", () => {
    const e: EsercizioEditor = {
      meta: { titolo: "Equazione", descrizione: "", anno: 1, argomento: "equazioni", tag: [], difficolta: 1 },
      testo: "Risolvi l'equazione \\(\\simplify{ {a}x + {b} } = 0\\).",
      suggerimento: "",
      variabili: [
        { nome: "a", definizione: "random(2..9)", descrizione: "" },
        { nome: "b", definizione: "random(-9..9 except 0)", descrizione: "" },
      ],
      condizione: "",
      parti: [{ tipo: "numerica", consegna: "\\(x =\\)", punti: 1, valore: "-b/a", tolleranza: { tipo: "decimali", cifre: 2 } }],
    };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(true);
    expect(verificaEsercizio(e)).toEqual({ ok: true });
    expect(promptEsercizi({ argomento: "x", classe: 1, quanti: 1 }, "it")).toContain("\\(\\simplify{ {a}x + {b} } = 0\\)");
  });
});

// Il prompt chiede le variabili tra graffe nella "risposta" di una parte
// "espressione". Senza graffe la verifica passa lo stesso (la risposta
// attesa coincide con sé stessa) ma il motore confronta con "a*x + b" a
// lettere libere: lo studente che scrive "2x - 3" prende zero. Qui si prova
// sul motore che la forma con le graffe dà i punti pieni alla risposta giusta.
describe("la «risposta» di una parte espressione con le variabili tra graffe", () => {
  function conRisposta(risposta: string): EsercizioEditor {
    return {
      meta: { titolo: "Retta", descrizione: "", anno: 2, argomento: "funzioni", tag: [], difficolta: 1 },
      testo: "Scrivi l'espressione \\(\\var{a}x + \\var{b}\\).",
      suggerimento: "",
      variabili: [
        { nome: "a", definizione: "2", descrizione: "" },
        { nome: "b", definizione: "-3", descrizione: "" },
      ],
      condizione: "",
      parti: [{ tipo: "espressione", consegna: "\\(y =\\)", punti: 1, risposta }],
    };
  }

  function punteggio(e: EsercizioEditor, studente: string): number {
    const q = loadQuestion(versoNumbas(e) as NumbasQuestionJSON, { seed: "graffe", locale: "it" });
    q.getPart("p0")!.submit(studente);
    q.updateScore();
    return q.score().score;
  }

  it("con le graffe: passa schema e verifica, e la risposta giusta prende i punti pieni", () => {
    const e = conRisposta("{a}*x + {b}");
    expect(esercizioEditorSchema.safeParse(e).success).toBe(true);
    expect(verificaEsercizio(e)).toEqual({ ok: true });
    expect(punteggio(e, "2x - 3")).toBe(1);
    expect(punteggio(e, "2x + 3")).toBe(0);
  });

  it("senza graffe la verifica non se ne accorge, ma lo studente che risponde giusto prende zero", () => {
    const e = conRisposta("a*x + b");
    expect(verificaEsercizio(e)).toEqual({ ok: true });
    expect(punteggio(e, "2x - 3")).toBe(0);
  });

  it("il prompt lo dice in entrambe le lingue", () => {
    for (const locale of ["it", "en"] as const) {
      expect(promptEsercizi({ argomento: "x", classe: 1, quanti: 1 }, locale)).toContain('"{a}*x + {b}"');
    }
  });
});
