import { PACCHETTO_INVALSI_2012 } from "../../../../scripts/genera-invalsi-2012";
import { provaPacchettoInvalsi, s, vf, V, F, type Risposta } from "./invalsi-comune";

/** La prova INVALSI 2011/12 trascritta in 30 esercizi (scripts/genera-invalsi-2012.ts).
 * Le risposte giuste sono scritte qui, A PARTE dal modello (vedi invalsi-comune.ts). */

const SOLUZIONI: Record<number, Risposta[]> = {
  1: [vf(F, F, V)],
  2: [s(1), "60", "90", s(1), "100+15g", "30g", "20"],
  3: [s(3)],
  4: [vf(F, V, V)],
  5: [s(1)],
  6: ["8550", "9000", "990", "10", "1000", "460", s(2), "89,6"],
  7: [s(3), s(3)],
  8: [s(0)],
  9: [vf(F, F, V, F)],
  10: ["18", "32", "41", s(0)],
  11: ["60", "120", s(1), s(2)],
  12: ["2/5"],
  13: [s(3)],
  14: [s(1), "2323", "232,3"],
  15: [s(3)],
  16: [s(0)],
  17: ["12"],
  18: [s(2)],
  19: [s(2)],
  20: ["1045", "1045"],
  21: [s(2)],
  22: [s(1)],
  23: ["423,6", s(2)],
  24: ["2,5"],
  25: [s(2)],
  26: [s(3), s(2), s(1)],
  27: [s(0)],
  28: [s(1)],
  29: [vf(V, V, F)],
  30: [s(2)],
};

const ERRORI: [number, number, Risposta][] = [
  [1, 0, vf(F, V, V)], // confronta le percentuali invece dei grammi di zucchero
  [2, 4, "15+100g"], // scambia costo fisso e costo al giorno
  [2, 6, "10"], // risolve 30g = 100 + 15g invece di una volta e mezza
  [6, 7, "85,5"], // divide per tutta la popolazione invece che per gli esiti corretti
  [10, 2, "40"], // arrotonda per difetto invece che per eccesso
  [11, 0, "2*3*4"], // ricopia la riga precedente
  [12, 0, "-2/5"], // sbaglia il segno
  [12, 0, "2"], // annulla il coefficiente di x invece del termine noto
  [14, 2, "2323"], // dimentica di dividere per i dieci anni
  [17, 0, "14"], // non toglie il triangolo rientrante ABC
  [20, 0, "1050"], // somma le percentuali: +10% − 5% = +5%
  [23, 0, "424,8"], // usa il cambio della banca B
  [24, 0, "3,35"], // usa 3 m di dislivello invece di 2 (√(9 + 2,25))
];

provaPacchettoInvalsi({
  nome: "INVALSI 2012",
  pacchetto: PACCHETTO_INVALSI_2012,
  domande: 30,
  soluzioni: SOLUZIONI,
  errori: ERRORI,
});
