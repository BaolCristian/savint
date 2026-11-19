import { PACCHETTO_INVALSI_2017 } from "../../../../scripts/genera-invalsi-2017";
import { provaPacchettoInvalsi, s, vf, V, F, type Risposta } from "./invalsi-comune";

/** La prova INVALSI 2016/17 trascritta in 32 esercizi (scripts/genera-invalsi-2017.ts).
 * Le risposte giuste sono scritte qui, A PARTE dal modello (vedi invalsi-comune.ts). */

const SOLUZIONI: Record<number, Risposta[]> = {
  1: [s(1)],
  2: [vf(V, F, F)],
  3: [s(1)],
  4: [vf(V, V, F), s(1)],
  5: [s(0)],
  6: ["8", "5", "3", "1"],
  7: [s(2)],
  8: ["6"],
  9: ["54"],
  10: [s(2)],
  11: [vf(F, F, V)],
  12: ["3,25"],
  13: ["3"],
  14: ["5000", "8000", "11000", "5000+3n", "15000"],
  15: [s(3), s(1), s(2), s(4), s(0)],
  16: [s(2), s(0), s(1), s(1), s(1)],
  17: ["0,36"],
  18: [s(0)],
  19: [s(2)],
  20: [{ caselle: [V, V, V, V, V, F, F, F] }, "4"],
  21: [s(2)],
  22: [s(2)],
  23: [s(0)],
  24: [s(0)],
  25: [s(2)],
  26: ["131", s(0)],
  27: [vf(V, F, F)],
  28: [s(1)],
  29: ["18", "40"],
  30: [vf(V, F, V, V)],
  31: [vf(V, F, F)],
  32: ["3/4"],
};

const ERRORI: [number, number, Risposta][] = [
  [1, 0, s(3)], // 90 − 14 = 76: dimentica di dividere per 2
  [2, 0, vf(V, V, F)], // confronta i numeri di alberi guariti, non le percentuali
  [4, 0, vf(V, V, V)], // confonde la posizione (30 km) con la strada percorsa (90 km)
  [6, 0, "4"], // conta una tacca per unità
  [8, 0, "7"], // guarda solo le caramelle al limone
  [9, 0, "72"], // somma i due perimetri, contando il lato comune
  [10, 0, s(0)], // media dei soli tre mesi del grafico
  [12, 0, "6,5"], // dimezza l'area invece di ridurla a un quarto
  [14, 3, "5000+30n"], // il prezzo di copertina invece del 10%
  [14, 4, "1500"], // sbaglia uno zero
  [16, 3, s(2)], // i centesimi presi come euro
  [17, 0, "0,9"], // somma le probabilità di vincere 0,3 + 0,6
  [19, 0, s(3)], // un cubetto per foro più quello centrale
  [20, 1, "6"], // la somma più grande, non la più probabile
  [26, 1, s(1)], // rapporto rispetto al 2008 invece che al 2006
  [28, 0, s(0)], // aggiunge il 20% al prezzo scontato
  [29, 1, "22"], // confonde la riga di M2 con il totale
  [32, 0, "1"], // semplifica 1/7 sopra e sotto
];

provaPacchettoInvalsi({
  nome: "INVALSI 2017",
  pacchetto: PACCHETTO_INVALSI_2017,
  domande: 32,
  soluzioni: SOLUZIONI,
  errori: ERRORI,
});
