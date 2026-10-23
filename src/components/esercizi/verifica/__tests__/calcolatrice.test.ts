import { describe, expect, it } from "vitest";
import { valuta } from "../calcolatrice";

describe("valuta", () => {
  it.each([
    ["2+3×4", 14],
    ["(2+3)×4", 20],
    ["2^3^2", 512],
    ["√16+1", 5],
    ["50%×80", 40],
    ["-3+5", 2],
    ["3,5×2", 7],
    ["3.5*2", 7],
    ["9÷3−1", 2],
    ["8/4/2", 1],
    ["-2^2", -4],
  ])("%s = %d", (espressione, atteso) => {
    expect(valuta(espressione)).toEqual({ ok: true, valore: atteso });
  });

  it.each(["1/0", "alert(1)", "", "2+", "(2", "2)", "√-4", "1,2,3", "2 3"])("%s non si calcola", (espressione) => {
    expect(valuta(espressione)).toEqual({ ok: false });
  });
});
