import { describe, it, expect } from "vitest";
import { loadQuestion, type NumbasQuestionJSON, type QuestionState } from "@savint/engine";
import {
  GRAZIA_MS, statoVerifica, scadenzaProva, posizioniDellaProva, totalePieno,
  puntiCella, punteggioProva, rispostaVuota, haRisposta, contenutoPerVerifica,
  type LayoutBlocco,
} from "../verifica-regole";

const layout: LayoutBlocco[] = [
  { quanti: 3, quantiPdp: 2, punti: 2, scelti: false, nonPerPdp: [] },
  { quanti: 2, quantiPdp: 2, punti: 1, scelti: true, nonPerPdp: ["e5"] },
];
const esercizi = ["e1", "e2", "e3", "e4", "e5"];

describe("regole della verifica", () => {
  it("la grazia dei salvataggi è di 30 secondi", () => {
    expect(GRAZIA_MS).toBe(30_000);
  });

  it("scadenzaProva somma durata, tempo extra in percentuale e minuti extra", () => {
    const inizio = new Date("2026-10-23T10:00:00Z");
    expect(scadenzaProva({ inizio, durataMinuti: 60, tempoExtraPct: 30, minutiExtra: 5 }))
      .toEqual(new Date("2026-10-23T11:23:00Z"));
    expect(scadenzaProva({ inizio, durataMinuti: 60, tempoExtraPct: 0, minutiExtra: 0 }))
      .toEqual(new Date("2026-10-23T11:00:00Z"));
  });

  it("posizioniDellaProva: senza misure tutte le posizioni, con meno esercizi il sottoinsieme PDP", () => {
    expect(posizioniDellaProva(layout, esercizi, false)).toEqual([
      { posizione: 0, punti: 2 },
      { posizione: 1, punti: 2 },
      { posizione: 2, punti: 2 },
      { posizione: 3, punti: 1 },
      { posizione: 4, punti: 1 },
    ]);
    expect(posizioniDellaProva(layout, esercizi, true)).toEqual([
      { posizione: 0, punti: 2 },
      { posizione: 1, punti: 2 },
      { posizione: 3, punti: 1 },
    ]);
  });

  it("totalePieno somma quanti per punti di ogni blocco", () => {
    expect(totalePieno(layout)).toBe(8);
  });

  it("punteggioProva riporta l'ottenuto sul totale pieno (esempio dello spec)", () => {
    // 12 punti su un totale studente di 16, verifica da 20 ⇒ 15 (75%).
    const celle = [
      { punti: 8, score: 3, maxScore: 4, puntiManuali: null }, // 6
      { punti: 8, score: 6, maxScore: 8, puntiManuali: null }, // 6
    ];
    expect(punteggioProva(celle, 20)).toEqual({ ottenuto: 12, totaleStudente: 16, finale: 15, percentuale: 75 });
  });

  it("puntiCella: il punteggio manuale vince sul calcolo, maxScore 0 dà zero", () => {
    expect(puntiCella({ punti: 2, score: 1, maxScore: 1, puntiManuali: 0.75 })).toBe(0.75);
    expect(puntiCella({ punti: 2, score: 1, maxScore: 1, puntiManuali: null })).toBe(2);
    expect(puntiCella({ punti: 2, score: 0, maxScore: 0, puntiManuali: null })).toBe(0);
  });

  it("punteggioProva arrotonda a due decimali e non divide per zero", () => {
    const r = punteggioProva([{ punti: 1, score: 1, maxScore: 3, puntiManuali: null }], 10);
    expect(r).toEqual({ ottenuto: 0.33, totaleStudente: 1, finale: 3.33, percentuale: 33.33 });
    expect(punteggioProva([], 10)).toEqual({ ottenuto: 0, totaleStudente: 0, finale: 0, percentuale: 0 });
  });

  it("statoVerifica: pubblicata > chiusa > avviata > preparata", () => {
    const t = new Date();
    expect(statoVerifica({ avviataAt: null, chiusaAt: null, pubblicataAt: null })).toBe("PREPARATA");
    expect(statoVerifica({ avviataAt: t, chiusaAt: null, pubblicataAt: null })).toBe("IN_CORSO");
    expect(statoVerifica({ avviataAt: t, chiusaAt: t, pubblicataAt: null })).toBe("CHIUSA");
    expect(statoVerifica({ avviataAt: t, chiusaAt: t, pubblicataAt: t })).toBe("PUBBLICATA");
  });

  it("rispostaVuota riconosce le risposte senza contenuto", () => {
    expect(rispostaVuota(undefined)).toBe(true);
    expect(rispostaVuota(null)).toBe(true);
    expect(rispostaVuota("")).toBe(true);
    expect(rispostaVuota("  ")).toBe(true);
    expect(rispostaVuota([null, ""])).toBe(true);
    expect(rispostaVuota([[false, false]])).toBe(true);
    expect(rispostaVuota("0")).toBe(false);
    expect(rispostaVuota([[false, true]])).toBe(false);
  });

  it("haRisposta guarda parti e gap con una risposta non vuota", () => {
    const base = { seed: "s", answered: true, submitted: 1, adviceDisplayed: false, revealed: false, score: 0, marks: 1 };
    const vuoto: QuestionState = { ...base, parts: [{ path: "p0", answered: true, score: 0, marks: 1, answer: "" }] };
    expect(haRisposta(vuoto)).toBe(false);
    expect(haRisposta(null)).toBe(false);
    const nonRisposta: QuestionState = {
      ...base, parts: [{ path: "p0", answered: false, score: 0, marks: 1, answer: "3" }],
    };
    expect(haRisposta(nonRisposta)).toBe(false);
    const conGap: QuestionState = {
      ...base,
      parts: [{
        path: "p0", answered: false, score: 0, marks: 1,
        gaps: [
          { path: "p0g0", answered: true, score: 0, marks: 1, answer: " " },
          { path: "p0g1", answered: true, score: 0, marks: 1, answer: "4" },
        ],
      }],
    };
    expect(haRisposta(conGap)).toBe(true);
  });

  it("contenutoPerVerifica toglie aiuti e spiegazioni senza cambiare la correzione", () => {
    const originale = {
      name: "Prova",
      statement: "<p>Rispondi.</p>",
      advice: "<p>Lo svolgimento.</p>",
      parts: [
        {
          type: "1_n_2",
          marks: 0,
          prompt: "<p>Quanto fa 2+2?</p>",
          shuffleChoices: false,
          displayType: "radiogroup",
          minMarks: 0,
          maxMarks: 0,
          choices: ["4", "5", "22"],
          matrix: ["2", 0, 0],
          distractors: ["", "Hai contato male.", "Non si accostano le cifre."],
          adaptiveMarkingNotUsedMessage: "<p>Non usato.</p>",
        },
        {
          type: "gapfill",
          prompt: "<p>Il quadrato di 4 è [[0]].</p>",
          gaps: [
            {
              type: "numberentry",
              marks: 2,
              minValue: "16",
              maxValue: "16",
              alternativeFeedbackMessage: "<p>Messaggio principale.</p>",
              alternatives: [
                {
                  type: "numberentry",
                  marks: 1,
                  minValue: "8",
                  maxValue: "8",
                  alternativeFeedbackMessage: "<p>Hai raddoppiato: metà punteggio.</p>",
                },
              ],
            },
          ],
        },
      ],
    };
    const copia = structuredClone(originale);
    const pulito = contenutoPerVerifica(originale) as typeof originale;

    expect(originale).toEqual(copia);
    expect(pulito.advice).toBe("");
    const [scelta, gapfill] = pulito.parts as Record<string, unknown>[];
    expect(scelta).not.toHaveProperty("distractors");
    expect(scelta).not.toHaveProperty("adaptiveMarkingNotUsedMessage");
    const gap = (gapfill!.gaps as Record<string, unknown>[])[0]!;
    expect(gap).not.toHaveProperty("alternativeFeedbackMessage");
    const alternativa = (gap.alternatives as Record<string, unknown>[])[0]!;
    expect(alternativa).not.toHaveProperty("alternativeFeedbackMessage");
    expect(alternativa.minValue).toBe("8");

    const punteggio = (content: unknown) => {
      const q = loadQuestion(content as NumbasQuestionJSON, { seed: "seme", locale: "it" });
      const p0 = q.getPart("p0")!;
      p0.submit(p0.correctAnswer());
      q.getPart("p1")!.submit(["8"] as never);
      q.updateScore();
      return q.score().score;
    };
    const atteso = punteggio(originale);
    expect(atteso).toBeGreaterThan(0);
    expect(punteggio(pulito)).toBe(atteso);
  });
});
