import { describe, it, expect } from "vitest";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import {
  leggiSpecificaGrafico,
  campiona,
  limitiAutomatici,
  passoEtichette,
  passoGriglia,
  tratti,
} from "../grafici";

const domanda = (variabili: Record<string, string>): NumbasQuestionJSON => ({
  name: "g",
  variables: Object.fromEntries(Object.entries(variabili).map(([n, d]) => [n, { name: n, definition: d }])),
  parts: [],
});

describe("leggiSpecificaGrafico", () => {
  it("legge espressione e intervalli", () => {
    expect(leggiSpecificaGrafico("a*x+b", "-5..5", "-10..10")).toEqual({
      espressione: "a*x+b", x: [-5, 5], y: [-10, 10],
    });
  });

  it("l'intervallo delle y può mancare: automatico", () => {
    expect(leggiSpecificaGrafico("x^2", "-3..3", undefined)).toEqual({ espressione: "x^2", x: [-3, 3], y: null });
  });

  it("accetta estremi decimali", () => {
    expect(leggiSpecificaGrafico("x", "-0.5..2.5", undefined)?.x).toEqual([-0.5, 2.5]);
  });

  // L'espressione finisce in un attributo e poi nel motore: niente graffe
  // (il motore le sostituirebbe nel testo), niente segni che chiudono il
  // segnaposto, niente intervalli rovesciati o enormi.
  it.each([
    ["", "-5..5"],
    ["{a}*x", "-5..5"],
    ["a*x | 3", "-5..5"],
    ["a*x", "5..-5"],
    ["a*x", "3..3"],
    ["a*x", "-5..xx"],
    ["a*x", "-100000..100000"],
  ])("rifiuta %j su %j", (espressione, x) => {
    expect(leggiSpecificaGrafico(espressione, x, undefined)).toBeNull();
  });
});

describe("campiona", () => {
  it("calcola la funzione con le variabili dello studente", () => {
    const q = loadQuestion(domanda({ a: "2", b: "-3" }), { seed: "1" });
    const punti = campiona(q.scope, "a*x+b", [-5, 5], 11);
    expect(punti.map((p) => p.x)).toEqual([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
    expect(punti.map((p) => p.y)).toEqual([-13, -11, -9, -7, -5, -3, -1, 1, 3, 5, 7]);
  });

  it("un punto in cui la funzione non esiste vale null, non fa fallire il resto", () => {
    const q = loadQuestion(domanda({}), { seed: "1" });
    const punti = campiona(q.scope, "1/x", [-1, 1], 3);
    expect(punti[1]!.y).toBeNull();
    expect(punti[0]!.y).toBe(-1);
    expect(punti[2]!.y).toBe(1);
  });

  it("un'espressione che non si compila lancia", () => {
    const q = loadQuestion(domanda({}), { seed: "1" });
    expect(() => campiona(q.scope, "x +* 2", [-1, 1], 3)).toThrow();
  });

  // Il motore non distingue maiuscole e minuscole; e una variabile della
  // domanda che si chiama x non deve vincere sulla x del grafico.
  it("la x del grafico vince su una variabile x della domanda", () => {
    const q = loadQuestion(domanda({ x: "100" }), { seed: "1" });
    expect(campiona(q.scope, "x", [0, 2], 3).map((p) => p.y)).toEqual([0, 1, 2]);
  });
});

describe("limitiAutomatici", () => {
  it("una retta: dal minimo al massimo, arrotondati a valori comodi", () => {
    const [basso, alto] = limitiAutomatici([{ x: 0, y: -13 }, { x: 1, y: 7 }]);
    expect(basso).toBeLessThanOrEqual(-13);
    expect(alto).toBeGreaterThanOrEqual(7);
    expect(Number.isInteger(basso) && Number.isInteger(alto)).toBe(true);
  });

  it("una costante ha comunque un intervallo", () => {
    const [basso, alto] = limitiAutomatici([{ x: 0, y: 2 }, { x: 1, y: 2 }]);
    expect(basso).toBeLessThan(2);
    expect(alto).toBeGreaterThan(2);
  });

  // Vicino a un asintoto i valori esplodono: l'intervallo automatico non
  // deve schiacciare tutto il resto del grafico in una riga.
  it("ignora i picchi di un asintoto", () => {
    const punti = Array.from({ length: 201 }, (_, i) => {
      const x = -5 + i * 0.05;
      return { x, y: Math.abs(x) < 1e-9 ? null : 1 / x };
    });
    const [basso, alto] = limitiAutomatici(punti);
    expect(alto).toBeLessThanOrEqual(25);
    expect(basso).toBeGreaterThanOrEqual(-25);
  });
});

describe("passoGriglia", () => {
  it("un quadretto per unità su intervalli piccoli, passi comodi su quelli grandi", () => {
    expect(passoGriglia(10)).toBe(1);
    expect(passoGriglia(40)).toBe(5);
    expect(passoGriglia(200)).toBe(20);
    expect(passoGriglia(2)).toBe(0.2);
  });
});

describe("passoEtichette", () => {
  it("tutti gli interi quando ci stanno, altrimenti passi comodi", () => {
    expect(passoEtichette(10)).toBe(1);
    expect(passoEtichette(18)).toBe(5);
    expect(passoEtichette(25)).toBe(5);
    expect(passoEtichette(200)).toBe(20);
  });
});

describe("tratti", () => {
  it("una curva continua è un solo tratto", () => {
    const punti = [0, 1, 2, 3].map((x) => ({ x, y: x }));
    expect(tratti(punti, [-10, 10])).toHaveLength(1);
  });

  it("un punto mancante spezza la curva", () => {
    const punti = [{ x: 0, y: 0 }, { x: 1, y: null }, { x: 2, y: 2 }, { x: 3, y: 3 }];
    expect(tratti(punti, [-10, 10]).map((t) => t.length)).toEqual([1, 2]);
  });

  // 1/x fra -0,01 e 0,01 salta da -100 a +100: senza spezzare, il disegno
  // traccerebbe una riga verticale che la funzione non ha.
  it("un salto oltre l'intervallo delle y spezza la curva", () => {
    const punti = [{ x: -0.02, y: -50 }, { x: -0.01, y: -100 }, { x: 0.01, y: 100 }, { x: 0.02, y: 50 }];
    expect(tratti(punti, [-10, 10])).toHaveLength(2);
  });
});
