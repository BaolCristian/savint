import { describe, expect, it } from "vitest";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import { opzioniMotore } from "@/lib/esercizi/opzioni-motore";
import type { PartePubblica } from "../parti";
import { rispostaDaStato } from "../risposte";

// Il motore salva le scelte di `1_n_2` e `m_n_2` come matrice di spunte
// (`[[false], [true], …]`, una riga per scelta), non nella forma che i campi
// usano: i campi le devono ritrovare nella loro forma dopo un ricaricamento.
const conScelte = (tipo: "1_n_2" | "m_n_2") =>
  ({
    name: "Scelte",
    statement: "<p>Testo</p>",
    variables: {},
    parts: [{ type: tipo, marks: 1, prompt: "<p>Scegli</p>", choices: ["a", "b", "c"], matrix: [1, 0, 0] }],
  }) as unknown as NumbasQuestionJSON;

const parte = (type: PartePubblica["type"]): PartePubblica =>
  ({ path: "p0", type, promptHtml: "", marks: 1, scelte: ["a", "b", "c"] }) as PartePubblica;

function statoDopo(tipo: "1_n_2" | "m_n_2", risposta: unknown) {
  const q = loadQuestion(conScelte(tipo), { seed: "s", ...opzioniMotore("it") });
  q.getPart("p0")!.submit(risposta as never);
  return q.toState().parts;
}

describe("rispostaDaStato", () => {
  it("1_n_2: dalla matrice del motore torna l'indice scelto", () => {
    expect(rispostaDaStato(parte("1_n_2"), statoDopo("1_n_2", 2))).toBe(2);
  });

  it("1_n_2 senza nessuna spunta: nessuna risposta", () => {
    expect(rispostaDaStato(parte("1_n_2"), [{ path: "p0", answered: false, score: 0, marks: 1, answer: [[false], [false], [false]] }] as never)).toBeNull();
  });

  it("m_n_2: dalla matrice del motore torna un booleano per scelta", () => {
    expect(rispostaDaStato(parte("m_n_2"), statoDopo("m_n_2", [true, false, true]))).toEqual([true, false, true]);
  });

  it("una parte mai risposta resta senza risposta", () => {
    expect(rispostaDaStato(parte("1_n_2"), undefined)).toBeNull();
  });
});
