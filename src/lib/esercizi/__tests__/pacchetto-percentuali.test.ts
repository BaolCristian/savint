import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { jme, loadQuestion, math, type NumbasQuestionJSON, type Question } from "@savint/engine";
import { esercizioFileSchema } from "../format/schema";
import { verificaSuSemi } from "../editor/verifica";
import { daNumbas } from "../editor/da-numbas";
import { versoFile } from "../editor/verso-numbas";
import { PACCHETTO_PERCENTUALI, testoFile } from "../../../../scripts/genera-percentuali";

/** Il pacchetto di nove esercizi sulle percentuali (file da 09 a 17), scritti
 * come modelli dell'editor in `scripts/genera-percentuali.ts` e convertiti con
 * `versoFile`. Le prove qui sotto fissano le tre promesse del pacchetto:
 * reggono la stessa verifica a venti semi del salvataggio dall'editor, si
 * riaprono nell'editor senza perdere nulla, e correggono davvero (risposta
 * giusta: credito pieno; errore tipico: zero). */

const DIR = path.resolve(process.cwd(), "content/esercizi");
const NOMI = PACCHETTO_PERCENTUALI.map((e) => `${e.nome}.json`);

function testo(nome: string): string {
  return readFileSync(path.join(DIR, nome), "utf8");
}
function leggi(nome: string) {
  return esercizioFileSchema.parse(JSON.parse(testo(nome)));
}
function domanda(nome: string): NumbasQuestionJSON {
  return leggi(nome).question as NumbasQuestionJSON;
}

/** Il valore numerico di una variabile estratta per questo seme. Il motore
 * tiene i prodotti e i quozienti di interi come interi o razionali esatti
 * (`n*p/100` è un `math.Fraction`), non come numeri a virgola mobile. */
function num(q: Question, nome: string): number {
  const token = q.scope.getVariable(nome);
  if (token === undefined) throw new Error(`variabile ${nome} assente`);
  const valore = jme.unwrapValue(token);
  if (valore instanceof math.Fraction) return valore.toFloat();
  return Number(valore);
}

/** Il credito ottenuto inviando `risposta` alla parte `percorso`, su una
 * domanda appena caricata (ogni invio parte da zero). */
function credito(json: NumbasQuestionJSON, seme: string, percorso: string, risposta: string | number): number {
  const q = loadQuestion(json, { seed: seme, locale: "it" });
  const parte = q.getPart(percorso)!;
  parte.submit(risposta as never);
  return parte.credit;
}

const SEMI = Array.from({ length: 12 }, (_, i) => `percentuali-${i}`);

/** Un importo in euro come lo scriverebbe uno studente: due decimali, con la
 * virgola. */
const euro = (x: number) => x.toFixed(2).replace(".", ",");

describe("pacchetto percentuali: i file", () => {
  it("sono nove, nell'ordine 09..17", () => {
    expect(NOMI).toHaveLength(9);
    expect(NOMI[0]).toMatch(/^09-/);
    expect(NOMI[8]).toMatch(/^17-/);
  });

  it.each(NOMI)("%s coincide byte per byte con quello che produce lo script", (nome) => {
    const voce = PACCHETTO_PERCENTUALI.find((e) => `${e.nome}.json` === nome)!;
    expect(testo(nome)).toBe(testoFile(voce.modello));
  });

  it.each(NOMI)("%s ha l'involucro atteso (percentuali, anno 1 o 2, etichette)", (nome) => {
    const { savint } = leggi(nome);
    expect(savint.topic).toBe("percentuali");
    expect([1, 2]).toContain(savint.yearLevel);
    expect([1, 2]).toContain(savint.difficulty);
    expect(savint.tags).toEqual(expect.arrayContaining(["percentuali", "INVALSI", "Numeri"]));
  });

  it.each(NOMI)("%s passa la verifica a venti semi del salvataggio dall'editor", (nome) => {
    expect(verificaSuSemi(domanda(nome))).toEqual({ ok: true });
  });

  it.each(NOMI)("%s si riapre nell'editor e, riconvertito, dà gli stessi byte", (nome) => {
    const file = leggi(nome);
    const lettura = daNumbas(file);
    if (!lettura.ok) throw new Error(`${nome} rifiutato dall'editor: ${lettura.dettaglio}`);
    expect(`${JSON.stringify(versoFile(lettura.editor), null, 2)}\n`).toBe(testo(nome));
    // E il modello riaperto è lo stesso scritto nello script.
    const voce = PACCHETTO_PERCENTUALI.find((e) => `${e.nome}.json` === nome)!;
    expect(lettura.editor).toEqual(voce.modello);
  });

  it.each(NOMI)("%s non lascia \\var non sostituiti nel testo mostrato allo studente", (nome) => {
    for (const seme of SEMI.slice(0, 3)) {
      const q = loadQuestion(domanda(nome), { seed: seme, locale: "it" });
      const testi = [q.statementHtml, q.adviceHtml, ...q.allParts().map((p) => p.promptHtml)];
      for (const t of testi) {
        expect(t).not.toContain("\\var");
        expect(t).not.toContain("\\simplify");
      }
    }
  });
});

describe("pacchetto percentuali: la correzione", () => {
  it("10-sconto: risparmio e prezzo finale giusti prendono credito pieno, quelli sbagliati zero", () => {
    const json = domanda("10-sconto.json");
    for (const seme of SEMI) {
      const q = loadQuestion(json, { seed: seme, locale: "it" });
      const prezzo = num(q, "prezzo");
      const s = num(q, "s");
      const risparmio = Math.round(prezzo * s) / 100;
      const finale = Math.round(prezzo * (100 - s)) / 100;

      expect(credito(json, seme, "p0", euro(risparmio)), `seme ${seme}`).toBe(1);
      expect(credito(json, seme, "p0", risparmio.toFixed(2)), `seme ${seme}`).toBe(1);
      expect(credito(json, seme, "p1", euro(finale)), `seme ${seme}`).toBe(1);
      // Errori tipici: dare il prezzo finale come risparmio, e lo sconto in
      // percentuale tolto dal prezzo come se fosse in euro.
      expect(credito(json, seme, "p0", euro(finale))).toBe(0);
      expect(credito(json, seme, "p1", euro(prezzo - s))).toBe(0);
    }
  });

  it("16-sconti-successivi: «no, è minore» e lo sconto effettivo sono giusti; la somma p+q prende zero", () => {
    const json = domanda("16-sconti-successivi.json");
    for (const seme of SEMI) {
      const q = loadQuestion(json, { seed: seme, locale: "it" });
      const p = num(q, "p");
      const qq = num(q, "q");
      // Resta (100-p)% e poi (100-q)% di quello: lo sconto effettivo è
      // 100 - (100-p)(100-q)/100 = p + q - pq/100.
      const effettivo = (100 * (p + qq) - p * qq) / 100;
      expect(effettivo).toBeLessThan(p + qq);

      // Parte a): la risposta giusta è la prima del modello («No, è minore»),
      // l'errore tipico la seconda («Sì, gli sconti si sommano»).
      expect(credito(json, seme, "p0", 0), `seme ${seme}`).toBe(1);
      expect(credito(json, seme, "p0", 1), `seme ${seme}`).toBe(0);
      expect(credito(json, seme, "p0", 2), `seme ${seme}`).toBe(0);

      // Parte b): lo sconto effettivo, con la virgola o col punto.
      expect(credito(json, seme, "p1", String(effettivo).replace(".", ",")), `seme ${seme}`).toBe(1);
      expect(credito(json, seme, "p1", String(effettivo)), `seme ${seme}`).toBe(1);
      expect(credito(json, seme, "p1", String(p + qq)), `seme ${seme}`).toBe(0);
    }
  });

  it("17-interesse-semplice: interesse e montante giusti prendono credito pieno, quelli sbagliati zero", () => {
    const json = domanda("17-interesse-semplice.json");
    for (const seme of SEMI) {
      const q = loadQuestion(json, { seed: seme, locale: "it" });
      const capitale = num(q, "capitale");
      const tasso = num(q, "tasso");
      const anni = num(q, "t");
      const interesse = (capitale * tasso * anni) / 100;
      expect(Number.isInteger(interesse)).toBe(true);

      expect(credito(json, seme, "p0", String(interesse)), `seme ${seme}`).toBe(1);
      expect(credito(json, seme, "p1", String(capitale + interesse)), `seme ${seme}`).toBe(1);
      // Errori tipici: l'interesse di un anno solo, e l'interesse dato come
      // montante.
      expect(credito(json, seme, "p0", String((capitale * tasso) / 100))).toBe(0);
      expect(credito(json, seme, "p1", String(interesse))).toBe(0);
    }
  });

  it("11-iva: il prezzo con IVA è il 122% del prezzo; dimenticare l'IVA prende zero", () => {
    const json = domanda("11-iva.json");
    for (const seme of SEMI) {
      const q = loadQuestion(json, { seed: seme, locale: "it" });
      const prezzo = num(q, "prezzo");
      const conIva = Math.round(prezzo * 122) / 100;
      expect(credito(json, seme, "p1", euro(conIva)), `seme ${seme}`).toBe(1);
      expect(credito(json, seme, "p1", euro(prezzo))).toBe(0);
    }
  });

  it("14-percentuali-frazioni-decimali: la prima risposta del modello è quella giusta", () => {
    const json = domanda("14-percentuali-frazioni-decimali.json");
    for (const seme of SEMI) {
      for (const percorso of ["p0", "p1"]) {
        expect(credito(json, seme, percorso, 0)).toBe(1);
        for (const sbagliata of [1, 2, 3]) expect(credito(json, seme, percorso, sbagliata)).toBe(0);
      }
    }
  });

  it("i numeri estratti producono risultati «puliti» (interi dove la risposta è esatta)", () => {
    const interi: [string, string][] = [
      ["09-percentuale-di-un-numero.json", "ris"],
      ["12-percentuale-da-trovare.json", "a"],
      ["13-totale-dalla-parte.json", "x"],
      ["15-variazione-percentuale.json", "v2"],
    ];
    for (const [nome, variabile] of interi) {
      for (const seme of SEMI) {
        const q = loadQuestion(domanda(nome), { seed: seme, locale: "it" });
        expect(Number.isInteger(num(q, variabile)), `${nome} ${variabile} seme ${seme}`).toBe(true);
      }
    }
  });
});
