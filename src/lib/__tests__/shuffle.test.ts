import { describe, it, expect } from "vitest";
import { shuffle, shuffleAwayFromOriginal } from "@/lib/shuffle";

describe("shuffle", () => {
  it("keeps the same elements", () => {
    const items = ["a", "b", "c", "d", "e"];
    expect(shuffle(items).sort()).toEqual([...items].sort());
  });

  it("is roughly uniform: every item lands in first position about equally often", () => {
    const items = [0, 1, 2, 3];
    const counts = [0, 0, 0, 0];
    const runs = 20000;
    for (let r = 0; r < runs; r++) counts[shuffle(items)[0]]++;
    for (const c of counts) expect(Math.abs(c / runs - 0.25)).toBeLessThan(0.03);
  });
});

describe("shuffleAwayFromOriginal", () => {
  it("never returns the original order", () => {
    for (const n of [2, 3, 4, 6]) {
      const items = Array.from({ length: n }, (_, i) => `x${i}`);
      for (let r = 0; r < 500; r++) {
        const out = shuffleAwayFromOriginal(items);
        expect(out).not.toEqual(items);
        expect([...out].sort()).toEqual([...items].sort());
      }
    }
  });

  it("returns a copy for trivial inputs without looping forever", () => {
    expect(shuffleAwayFromOriginal([])).toEqual([]);
    expect(shuffleAwayFromOriginal(["a"])).toEqual(["a"]);
    expect(shuffleAwayFromOriginal(["a", "a"])).toEqual(["a", "a"]);
  });
});
