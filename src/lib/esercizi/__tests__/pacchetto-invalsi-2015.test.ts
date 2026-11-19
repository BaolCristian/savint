import { PACCHETTO_INVALSI_2015 } from "../../../../scripts/genera-invalsi-2015";
import { provaPacchettoInvalsi, s, vf, V, F, type Risposta } from "./invalsi-comune";

/** La prova INVALSI 2014/15 trascritta in 31 esercizi (scripts/genera-invalsi-2015.ts).
 * Le risposte giuste sono scritte qui, A PARTE dal modello (vedi invalsi-comune.ts). */

const SOLUZIONI: Record<number, Risposta[]> = {
  1: [vf(V, V, F, V)],
  2: [s(2)],
  3: [vf(F, V, V)],
  4: ["98", "96", "94", "92", "100-2t", s(1)],
  5: [s(0)],
  6: ["1/4", "7"],
  7: ["20"],
  8: ["1,11", "32"],
  9: ["10", s(3)],
  10: [vf(V, F, V, V)],
  11: [s(1), s(3)],
  12: ["11", "-5"],
  13: [s(3), "14,05"],
  14: ["49", "1", "2", "3", "4"],
  15: [s(3)],
  16: [s(3)],
  17: ["11"],
  18: ["93", s(1)],
  19: ["9"],
  20: [s(1)],
  21: [s(1)],
  22: ["15/38"],
  23: ["69"],
  24: [s(1)],
  25: [s(0)],
  26: [s(3)],
  27: [vf(V, F, V, F)],
  28: [s(0), s(0)],
  29: [s(3)],
  30: [s(2)],
  31: [{ caselle: [V, V, V, V, V, F, F, F] }],
};

const ERRORI: [number, number, Risposta][] = [
  [1, 0, vf(V, V, V, V)], // la tabella non vale tutta se una riga è sbagliata
  [4, 4, "100-7t"], // dimentica l'acqua che entra
  [6, 0, "12/52"], // toglie l'asso di cuori ma non dal totale delle carte
  [8, 0, "1,01"], // paga 7 minuti invece di 8
  [8, 1, "33"], // arrotonda per eccesso
  [13, 1, "14,1"], // non arrotonda ai centesimi
  [14, 0, "25"], // il numero di studenti, non la percentuale
  [17, 0, "16"], // dimentica carico e svuotamento
  [22, 0, "17/40"], // non toglie le palline estratte
  [23, 0, "75"], // media semplice di 85 e 65
  [31, 0, { caselle: [V, V, V, F, F, F, F, F] }], // solo i lati del quadrato
];

provaPacchettoInvalsi({
  nome: "INVALSI 2015",
  pacchetto: PACCHETTO_INVALSI_2015,
  domande: 31,
  soluzioni: SOLUZIONI,
  errori: ERRORI,
});
