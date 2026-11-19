import { PACCHETTO_INVALSI_2012 } from "../../../../scripts/genera-invalsi-2012";
import { intero, num, provaPacchettoInvalsi, s, vf, V, F, type RispostaErrata, type Soluzione } from "./invalsi-comune";

/** La prova INVALSI 2011/12 trascritta in 30 esercizi (scripts/genera-invalsi-2012.ts).
 * Le risposte giuste sono scritte qui, A PARTE dal modello (vedi invalsi-comune.ts).
 *
 * Per le domande a numeri variabili la soluzione è una funzione dei valori
 * estratti: rifà il calcolo dai soli dati che lo studente legge nel testo,
 * senza usare le variabili «risultato» del modello. */

/** I franchi della banca A per `euro` euro (1,412 franchi per euro), al decimo. */
const bancaA = (euro: number): number => Math.round(euro * 14.12) / 10;

const SOLUZIONI: Record<number, Soluzione> = {
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
  // (pk - q)x - ck + d = 0 con x = 0: -ck + d = 0.
  12: ({ c, d }) => [`${d}/${c}`],
  13: [s(3)],
  14: [s(1), "2323", "232,3"],
  15: [s(3)],
  16: [s(0)],
  17: ["12"],
  18: [s(2)],
  19: [s(2)],
  20: ({ somma, su, giu }) => {
    const finale = String(intero(somma * (1 + su / 100) * (1 - giu / 100), "la somma finale"));
    return [finale, finale];
  },
  21: ({ n }) => [s(2, `a^{${n}}(a+1)`)],
  22: [s(1)],
  23: ({ somma }) => [num(bancaA(somma)), s(2)],
  24: ["2,5"],
  // Si paga (1 - p)(1 - q) del prezzo: lo sconto è il resto.
  25: ({ primo, secondo }) => [s(2, `${intero(100 - (100 - primo) * (1 - secondo / 100), "lo sconto")}%`)],
  26: [s(3), s(2), s(1)],
  27: [s(0)],
  // x(x - 1) = P: la soluzione positiva di x² - x - P = 0.
  28: ({ prodotto }) => [s(1, String(intero((1 + Math.sqrt(1 + 4 * prodotto)) / 2, "la soluzione")))],
  29: [vf(V, V, F)],
  30: [s(2)],
};

const ERRORI: [number, number, RispostaErrata][] = [
  [1, 0, vf(F, V, V)], // confronta le percentuali invece dei grammi di zucchero
  [2, 4, "15+100g"], // scambia costo fisso e costo al giorno
  [2, 6, "10"], // risolve 30g = 100 + 15g invece di una volta e mezza
  [6, 7, "85,5"], // divide per tutta la popolazione invece che per gli esiti corretti
  [10, 2, "40"], // arrotonda per difetto invece che per eccesso
  [11, 0, "2*3*4"], // ricopia la riga precedente
  [12, 0, ({ c, d }) => `-${d}/${c}`], // sbaglia il segno
  [12, 0, ({ p, q }) => String(q / p)], // annulla il coefficiente di x invece del termine noto
  [14, 2, "2323"], // dimentica di dividere per i dieci anni
  [17, 0, "14"], // non toglie il triangolo rientrante ABC
  [20, 0, ({ somma, su, giu }) => String((somma * (100 + su - giu)) / 100)], // somma le percentuali: +10% − 5% = +5%
  [20, 1, ({ somma }) => String(somma)], // pensa che guadagno e perdita si compensino
  [21, 0, s(1)], // somma gli esponenti
  [23, 0, ({ somma }) => num(Math.round(somma * 14.16 - 20) / 10)], // usa il cambio della banca B
  [24, 0, "3,35"], // usa 3 m di dislivello invece di 2 (√(9 + 2,25))
  [25, 0, s(3)], // somma i due sconti
  [25, 0, s(0)], // sottrae il secondo sconto dal primo
  [28, 0, s(2)], // prende il secondo membro per la soluzione
];

provaPacchettoInvalsi({
  nome: "INVALSI 2012",
  pacchetto: PACCHETTO_INVALSI_2012,
  domande: 30,
  soluzioni: SOLUZIONI,
  errori: ERRORI,
});
