import { PACCHETTO_INVALSI_2014 } from "../../../../scripts/genera-invalsi-2014";
import { provaPacchettoInvalsi, s, vf, V, F, type Risposta } from "./invalsi-comune";

/** La prova INVALSI 2013/14 trascritta in 28 esercizi (scripts/genera-invalsi-2014.ts).
 * Le risposte giuste sono scritte qui, A PARTE dal modello (vedi invalsi-comune.ts). */

const SOLUZIONI: Record<number, Risposta[]> = {
  1: [s(2)],
  2: [vf(V, F, V), vf(V, V, F)],
  3: [s(1), s(2)],
  4: [s(3), "28", "60+5n"],
  5: [s(1), vf(F, V, F)],
  6: [s(2)],
  7: ["18"],
  8: [s(3)],
  9: ["252"],
  10: [vf(F, V, V)],
  11: ["1/4"],
  12: ["726", "683", "129/250", "75/121"],
  13: [s(0)],
  14: [s(1), s(0), s(2)],
  15: [vf(V, F, F, V)],
  16: ["6"],
  17: ["2"],
  18: ["24"],
  19: ["18"],
  20: ["25"],
  21: [s(1)],
  22: [s(1), "6"],
  23: [vf(F, V, F, V)],
  24: [s(2)],
  25: [s(3), "30"],
  26: [s(3)],
  27: [s(1)],
  28: [s(3)],
};

const ERRORI: [number, number, Risposta][] = [
  [2, 1, vf(V, V, V)], // legge la cumulata come pioggia del mese
  [4, 1, "40"], // 200 : 5, dimentica la quota fissa
  [4, 2, "5+60n"], // scambia quota fissa e costo per ingresso
  [7, 0, "17"], // conta i quadretti a occhio
  [9, 0, "180"], // somma le percentuali: 600 − 70% di 600
  [11, 0, "1/2"], // confonde il triangolo QST con QSR
  [12, 2, "407/1500"], // solo le disoccupate con giudizio negativo
  [12, 3, "450/1500"], // probabilità sul totale, non sui giudizi positivi
  [16, 0, "12"], // prende il diametro
  [18, 0, "48"], // usa il raggio come altezza
  [19, 0, "8"], // 108 − 100, dimentica chi non segue nessuno sport
  [20, 0, "14"], // non riporta la proporzione
  [22, 1, "5"], // 1,2(h − 1) = h risolta male
  [25, 1, "8"], // confonde i fiori con il denominatore
];

provaPacchettoInvalsi({
  nome: "INVALSI 2014",
  pacchetto: PACCHETTO_INVALSI_2014,
  domande: 28,
  soluzioni: SOLUZIONI,
  errori: ERRORI,
});
