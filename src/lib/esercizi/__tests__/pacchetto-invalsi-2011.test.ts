import { PACCHETTO_INVALSI_2011 } from "../../../../scripts/genera-invalsi-2011";
import { provaPacchettoInvalsi, s, vf, V, F, type Risposta } from "./invalsi-comune";

/** La prova INVALSI 2010/11 trascritta in 30 esercizi (scripts/genera-invalsi-2011.ts).
 * Le risposte giuste sono scritte qui, A PARTE dal modello (vedi invalsi-comune.ts). */

const SOLUZIONI: Record<number, Risposta[]> = {
  1: [vf(F, V, V)],
  2: [s(3)],
  3: [s(3)],
  4: [s(2)],
  5: [s(0)],
  6: [s(0), s(1), s(2)],
  7: ["600", s(2)],
  8: ["32,3", s(1)],
  9: [vf(F, V, V, F), "1", "1,41", "1,73"],
  10: [s(2)],
  11: [s(2), "8400", s(2)],
  12: [s(2), s(0), s(1), s(1), s(2), s(1)],
  13: ["100", "4n-2(25-n)", "19"],
  14: [s(0)],
  15: [s(3)],
  16: [s(2)],
  17: [s(3)],
  18: ["15"],
  19: [s(2)],
  20: [s(1), s(0), "1340", "746"],
  21: [s(2)],
  22: [s(2)],
  23: [s(1), "297600"],
  24: [s(2)],
  25: ["50"],
  26: [s(2)],
  27: [s(0)],
  28: [s(2)],
  29: [s(3)],
  30: [s(2)],
};

const ERRORI: [number, number, Risposta][] = [
  [1, 0, vf(V, V, V)], // legge 711 292 come i maschi
  [7, 0, "150"], // conta solo il tratto di via 20 Settembre
  [8, 0, "102,2"], // moltiplica per 16/9 invece che per 9/16
  [9, 2, "2"], // somma i lati invece di usare Pitagora
  [11, 1, "12000"], // divide 3 000 per 0,25 senza togliere le spese fisse
  [13, 1, "4n-2"], // toglie 2 punti in tutto, non per ogni risposta sbagliata
  [13, 2, "18"], // 18,3 arrotondato per difetto
  [20, 2, "746"], // divide invece di moltiplicare
  [20, 3, "1340"], // moltiplica invece di dividere
  [23, 1, "74400"], // dimentica la densità di 4 persone al metro quadro
  [25, 0, "60"], // 20% del prezzo finale invece che del costo base
  [12, 0, s(0)], // crede di leggere nel grafico il confronto con il 1971-2000
];

provaPacchettoInvalsi({
  nome: "INVALSI 2011",
  pacchetto: PACCHETTO_INVALSI_2011,
  domande: 30,
  soluzioni: SOLUZIONI,
  errori: ERRORI,
});
