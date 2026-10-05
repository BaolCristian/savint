import { describe, it, expect } from "vitest";
import { testoVersoHtml, htmlVersoTesto, tokenImmagine, tokenGrafico } from "../immagini-testo";
import { versoFile, versoNumbas } from "../verso-numbas";
import { daNumbas } from "../da-numbas";
import { verificaSuSemi } from "../verifica";
import type { EsercizioEditor } from "../modello";

const FILE = "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90.png";

describe("immagini nel testo del docente", () => {
  it("il segnaposto diventa un <img> col solo nome del file e la descrizione", () => {
    expect(testoVersoHtml(`Guarda ![triangolo rettangolo](${FILE}) e rispondi`)).toBe(
      `Guarda <img data-savint-immagine="${FILE}" alt="triangolo rettangolo"> e rispondi`,
    );
  });

  it("la descrizione è scappata come il resto del testo, virgolette comprese", () => {
    expect(testoVersoHtml(`![lati "a" & b < 3](${FILE})`)).toBe(
      `<img data-savint-immagine="${FILE}" alt="lati &quot;a&quot; &amp; b &lt; 3">`,
    );
  });

  it("andata e ritorno restituiscono il testo del docente, byte per byte", () => {
    for (const testo of [
      `Guarda ![triangolo](${FILE}) e rispondi`,
      `![lati "a" & b < 3](${FILE})`,
      `due ![a](${FILE}) ![b](${FILE})`,
      "x < 3 & niente immagini",
    ]) {
      expect(htmlVersoTesto(testoVersoHtml(testo))).toBe(testo);
    }
  });

  // Solo i nomi che genera la piattaforma: un indirizzo esterno, o un nome
  // qualsiasi, resta testo — non diventa mai un <img> che il browser
  // andrebbe a caricare.
  it("un nome di file che non è della piattaforma resta testo", () => {
    for (const testo of [
      "![x](https://esempio.it/a.png)",
      "![x](../segreto.png)",
      "![x](immagine.png)",
      `![x](${FILE.replace(".png", ".svg")})`,
    ]) {
      expect(testoVersoHtml(testo)).not.toContain("<img");
    }
  });

  it("tokenImmagine toglie dalla descrizione ciò che romperebbe il segnaposto", () => {
    expect(tokenImmagine("figura [1]\ncon a capo", FILE)).toBe(`![figura 1 con a capo](${FILE})`);
  });
});

describe("un esercizio con immagini si salva e si riapre nell'editor", () => {
  const e: EsercizioEditor = {
    meta: { titolo: "Figura", descrizione: "", anno: 1, argomento: "geometria", tag: [], difficolta: 1 },
    testo: `Il triangolo ![triangolo con i cateti](${FILE}) ha i cateti di \\(\\var{a}\\) e \\(\\var{b}\\).`,
    suggerimento: `Usa Pitagora: ![schema](${FILE})`,
    variabili: [
      { nome: "a", definizione: "3", descrizione: "" },
      { nome: "b", definizione: "4", descrizione: "" },
    ],
    condizione: "",
    parti: [{ tipo: "numerica", consegna: `Ipotenusa? ![figura](${FILE})`, punti: 1, valore: "5", tolleranza: { tipo: "esatta" } }],
  };

  it("nel file l'immagine è un <img>, e riaprendolo torna il segnaposto", () => {
    const file = versoFile(e);
    const q = file.question as { statement: string; advice: string; parts: { prompt: string }[] };
    expect(q.statement).toContain(`<img data-savint-immagine="${FILE}"`);
    expect(q.advice).toContain("<img ");
    expect(q.parts[0]!.prompt).toContain("<img ");

    const riaperto = daNumbas(file);
    expect(riaperto.ok).toBe(true);
    if (!riaperto.ok) return;
    expect(riaperto.editor.testo).toBe(e.testo);
    expect(riaperto.editor.suggerimento).toBe(e.suggerimento);
    expect(riaperto.editor.parti[0]!.consegna).toBe(e.parti[0]!.consegna);
  });

  it("passa la verifica dei venti sorteggi", () => {
    expect(verificaSuSemi(versoNumbas(e))).toEqual({ ok: true });
  });

  // Un <img> con un attributo in più (scritto a mano, o da un altro
  // programma) non è nella forma che l'editor produce: l'esercizio si apre
  // in sola lettura invece di perdere quell'attributo al salvataggio.
  it("un <img> fuori forma rende l'esercizio non rappresentabile", () => {
    const file = versoFile(e);
    const q = file.question as { statement: string };
    const alterato = { ...file, question: { ...q, statement: q.statement.replace("<img ", '<img width="200" ') } };
    expect(daNumbas(alterato).ok).toBe(false);
  });
});

describe("grafici nel testo del docente", () => {
  it("il segnaposto diventa uno <span> con espressione e intervalli", () => {
    expect(testoVersoHtml("Guarda [grafico: a*x+b | x: -5..5] qui")).toBe(
      'Guarda <span data-savint-grafico="a*x+b" data-x="-5..5"></span> qui',
    );
    expect(testoVersoHtml("[grafico: x^2 | x: -3..3 | y: -1..9]")).toBe(
      '<span data-savint-grafico="x^2" data-x="-3..3" data-y="-1..9"></span>',
    );
  });

  it("andata e ritorno restituiscono il testo, anche con immagini insieme", () => {
    for (const testo of [
      "[grafico: a*x+b | x: -5..5]",
      "[grafico: x^2 - c | x: -3..3 | y: -1..9]",
      `prima ![figura](${FILE}) poi [grafico: 1/x | x: -4..4 | y: -5..5]`,
    ]) {
      expect(htmlVersoTesto(testoVersoHtml(testo))).toBe(testo);
    }
  });

  it("un segnaposto non valido resta testo", () => {
    for (const testo of ["[grafico: {a}*x | x: -5..5]", "[grafico: x | x: 5..-5]", "[grafico: x]"]) {
      expect(testoVersoHtml(testo)).not.toContain("<span");
    }
  });

  it("tokenGrafico scrive il segnaposto nella forma canonica", () => {
    expect(tokenGrafico({ espressione: "a*x+b", x: [-5, 5], y: null })).toBe("[grafico: a*x+b | x: -5..5]");
    expect(tokenGrafico({ espressione: "x^2", x: [-0.5, 2], y: [0, 4] })).toBe("[grafico: x^2 | x: -0.5..2 | y: 0..4]");
  });
});
