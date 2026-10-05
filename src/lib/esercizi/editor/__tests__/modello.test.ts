import { describe, it, expect } from "vitest";
import { esercizioEditorSchema } from "../modello";
import type { EsercizioEditor } from "../modello";

/** Stessa base minima di verso-numbas.test.ts, duplicata qui perche' questo
 * file non va toccato in questo task (vedi task-2-brief.md). */
const base: EsercizioEditor = {
  meta: { titolo: "T", descrizione: "", anno: 1, argomento: "equazioni",
          tag: [], difficolta: 1 },
  testo: "Risolvi \\(\\simplify{ {a}x+{b} }=0\\)",
  suggerimento: "",
  variabili: [
    { nome: "a", definizione: "random(2..9)", descrizione: "" },
    { nome: "b", definizione: "random(-9..9 except 0)", descrizione: "" },
  ],
  condizione: "",
  parti: [{ tipo: "numerica", consegna: "\\(x=\\)", punti: 2,
            valore: "-b/a", tolleranza: { tipo: "esatta" } }],
};

/** Un difetto del piano di Task 1: lo schema permetteva una parte da zero
 * punti. Per una parte a scelta multipla questo produce una matrice di
 * marcatura tutta a zero, e la posizione della risposta giusta smette di
 * essere ricostruibile dal file. Ogni parte deve valere almeno un punto. */
describe("esercizioEditorSchema - almeno un punto per parte", () => {
  it("rifiuta una parte numerica da zero punti", () => {
    const e = { ...base, parti: [{ ...base.parti[0], punti: 0 }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta una parte a scelta da zero punti", () => {
    const e = { ...base, parti: [{ tipo: "scelta" as const, consegna: "Q", punti: 0,
      risposte: ["a", "b"], indiceGiusta: 0 }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("rifiuta una parte a espressione da zero punti", () => {
    const e = { ...base, parti: [{ tipo: "espressione" as const, consegna: "Q", punti: 0,
      risposta: "x" }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });

  it("accetta una parte da un punto", () => {
    const e = { ...base, parti: [{ ...base.parti[0], punti: 1 }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(true);
  });

  it("rifiuta punti negativi", () => {
    const e = { ...base, parti: [{ ...base.parti[0], punti: -1 }] };
    expect(esercizioEditorSchema.safeParse(e).success).toBe(false);
  });
});

/** La scelta multipla con più risposte giuste (Numbas `m_n_2`): le
 * risposte giuste sono una casella per risposta, allineata a `risposte`,
 * non un insieme di indici — un insieme ammetterebbe doppioni e ordini
 * diversi per lo stesso significato, e l'andata e ritorno non sarebbe più
 * byte per byte. */
describe("esercizioEditorSchema - scelta multipla con più risposte giuste", () => {
  const parte = {
    tipo: "sceltaMultipla" as const,
    consegna: "Quali sono pari?",
    punti: 2,
    risposte: ["2", "3", "4"],
    corrette: [true, false, true],
  };
  const con = (p: object) => ({ ...base, parti: [p] });

  it("accetta una parte con due risposte giuste su tre", () => {
    expect(esercizioEditorSchema.safeParse(con(parte)).success).toBe(true);
  });

  it("accetta spiegazioni, una per risposta", () => {
    expect(esercizioEditorSchema.safeParse(con({ ...parte, spiegazioni: ["", "3 è dispari", ""] })).success).toBe(true);
  });

  it("rifiuta una parte senza nessuna risposta giusta", () => {
    expect(esercizioEditorSchema.safeParse(con({ ...parte, corrette: [false, false, false] })).success).toBe(false);
  });

  it("rifiuta caselle «corretta» non allineate alle risposte", () => {
    expect(esercizioEditorSchema.safeParse(con({ ...parte, corrette: [true, false] })).success).toBe(false);
  });

  it("rifiuta spiegazioni non allineate alle risposte", () => {
    expect(esercizioEditorSchema.safeParse(con({ ...parte, spiegazioni: ["solo una"] })).success).toBe(false);
  });

  it("accetta da 2 a 8 risposte, non meno né più", () => {
    const n = (k: number) => ({ ...parte, risposte: Array.from({ length: k }, (_, i) => String(i)),
      corrette: Array.from({ length: k }, (_, i) => i === 0) });
    expect(esercizioEditorSchema.safeParse(con(n(1))).success).toBe(false);
    expect(esercizioEditorSchema.safeParse(con(n(2))).success).toBe(true);
    expect(esercizioEditorSchema.safeParse(con(n(8))).success).toBe(true);
    expect(esercizioEditorSchema.safeParse(con(n(9))).success).toBe(false);
  });

  it("rifiuta una parte da zero punti", () => {
    expect(esercizioEditorSchema.safeParse(con({ ...parte, punti: 0 })).success).toBe(false);
  });
});
