// @vitest-environment node

// Divergenza di SAVINT (vedi DIVERGENCES.md, «Stile dei numeri mostrati»):
// con `LoadOptions.numberStyle` i numeri che la domanda MOSTRA (testo,
// formule, `dpformat`/`sigformat` senza stile esplicito) usano quello stile.
// Il codice JME che il motore rilegge resta col punto: lì una virgola
// cambierebbe il significato.

import { describe, it, expect } from "vitest";
import { loadQuestion, restoreQuestion } from "../../src/question";
import type { NumbasQuestionJSON } from "../../src/question";

const domanda: NumbasQuestionJSON = {
  name: "sconto",
  statement:
    "<p>Prezzo {p} euro; in formula \\(\\var{p}\\); semplificato \\(\\simplify{ {p}x }\\); importo \\(\\var{dpformat(q, 2)}\\); cifre \\(\\var{sigformat(p, 2)}\\); intero {n}.</p>",
  variables: {
    p: { name: "p", definition: "48.5" },
    q: { name: "q", definition: "41.2" },
    n: { name: "n", definition: "1500" },
  },
  parts: [{ type: "numberentry", marks: 1, minValue: "p", maxValue: "p", notationStyles: ["plain", "plain-eu"] }],
};

describe("Stile dei numeri mostrati", () => {
  it("con numberStyle plain-eu i decimali mostrati usano la virgola", () => {
    const q = loadQuestion(domanda, { seed: "1", locale: "it", numberStyle: "plain-eu" });
    const html = q.statementHtml;
    expect(html).toContain("Prezzo 48,5 euro");
    expect(html).toContain("48{,}5");
    expect(html).toContain("41,20");
    expect(html).toContain("49");
    expect(html).toContain("intero 1500.");
    expect(html).not.toMatch(/48\.5|41\.2/);
  });

  it("senza numberStyle resta il comportamento di Numbas: il punto", () => {
    const q = loadQuestion(domanda, { seed: "1", locale: "it" });
    expect(q.statementHtml).toContain("Prezzo 48.5 euro");
    expect(q.statementHtml).toContain("41.20");
  });

  // Un prodotto fra interi diviso per cento può restare un decimale esatto
  // (`TDecimal`): `dpformat` passa allora per `toFixed`, che upstream scrive
  // sempre col punto. Era il caso degli esercizi sugli sconti.
  it("dpformat su un decimale esatto segue lo stile", () => {
    const esatto: NumbasQuestionJSON = {
      ...domanda,
      statement: "<p>\\(\\var{dpformat(dec(9.8), 2)}\\) e {dpformat(dec(9.8), 2)}</p>",
    };
    const q = loadQuestion(esatto, { seed: "1", locale: "it", numberStyle: "plain-eu" });
    expect(q.statementHtml).not.toContain("9.80");
    expect(q.statementHtml).toContain("e 9,80");
  });

  // In modalità matematica KaTeX spazia la virgola come una punteggiatura:
  // «41,20» deve entrare come testo, non come LaTeX nudo.
  it("in una formula, il risultato di dpformat con la virgola entra come testo", () => {
    const q = loadQuestion(domanda, { seed: "1", locale: "it", numberStyle: "plain-eu" });
    expect(q.statementHtml).toContain("\\textrm{41,20}");
  });

  // Un decimale esatto (`TDecimal`) in una formula passava per
  // `niceDecimal`, che ignorava la sintassi LaTeX: «0,765» nudo.
  it("un decimale esatto in una formula usa {,}", () => {
    const esatto: NumbasQuestionJSON = { ...domanda, statement: "<p>\\(\\var{dec(0.765)}\\)</p>" };
    const q = loadQuestion(esatto, { seed: "1", locale: "it", numberStyle: "plain-eu" });
    expect(q.statementHtml).toContain("0{,}765");
  });

  it("uno stile esplicito di dpformat vince su quello della domanda", () => {
    const esplicito: NumbasQuestionJSON = {
      ...domanda,
      statement: "<p>\\(\\var{dpformat(q, 2, 'en')}\\)</p>",
    };
    const q = loadQuestion(esplicito, { seed: "1", locale: "it", numberStyle: "plain-eu" });
    expect(q.statementHtml).toContain("41.20");
  });

  // La correzione legge minValue/maxValue come JME: se lo stile toccasse
  // anche il codice, «48,5» diventerebbe una lista di due numeri.
  it("la correzione non cambia: 48,5 e 48.5 restano giuste", () => {
    for (const risposta of ["48,5", "48.5"]) {
      const q = loadQuestion(domanda, { seed: "1", locale: "it", numberStyle: "plain-eu" });
      const parte = q.parts[0]!;
      parte.storeAnswer(risposta);
      parte.submit();
      expect(parte.credit).toBe(1);
    }
  });

  it("restoreQuestion e regenerate conservano lo stile", () => {
    const q = loadQuestion(domanda, { seed: "1", locale: "it", numberStyle: "plain-eu" });
    const ripresa = restoreQuestion(domanda, q.toState(), { locale: "it", numberStyle: "plain-eu" });
    expect(ripresa.statementHtml).toContain("Prezzo 48,5 euro");
    expect(q.regenerate("2").statementHtml).toContain("Prezzo 48,5 euro");
  });
});
