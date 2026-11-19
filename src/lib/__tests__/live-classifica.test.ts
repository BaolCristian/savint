import { describe, it, expect } from "vitest";
import { classificaGeneraleDopo } from "../live-classifica";

const dopo = (totale: number) =>
  Array.from({ length: totale }, (_, i) => i + 1).filter((n) => classificaGeneraleDopo(n, totale));

describe("classifica generale durante la partita", () => {
  it("ogni tre domande, mai nelle ultime tre", () => {
    expect(dopo(12)).toEqual([3, 6, 9]);
    expect(dopo(10)).toEqual([3, 6]);
    expect(dopo(20)).toEqual([3, 6, 9, 12, 15]);
  });

  it("in una partita corta non compare mai", () => {
    expect(dopo(3)).toEqual([]);
    expect(dopo(5)).toEqual([]);
    expect(dopo(6)).toEqual([3]);
  });
});
