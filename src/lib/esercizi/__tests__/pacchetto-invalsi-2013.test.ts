import { PACCHETTO_INVALSI_2013 } from "../../../../scripts/genera-invalsi-2013";
import { provaPacchettoInvalsi, s, vf, V, F, type Risposta } from "./invalsi-comune";

/** La prova INVALSI 2012/13 trascritta in 32 esercizi (scripts/genera-invalsi-2013.ts).
 * Le risposte giuste sono scritte qui, A PARTE dal modello (vedi invalsi-comune.ts). */

const SOLUZIONI: Record<number, Risposta[]> = {
  1: [s(0)],
  2: [s(2)],
  3: [s(0), "1610,51"],
  4: [vf(F, F, V, F)],
  5: [s(0)],
  6: [s(0)],
  7: [s(1), s(2)],
  8: [s(1), "1", "-1/3", s(0)],
  9: [s(2)],
  10: [s(3)],
  11: [s(0), s(1)],
  12: ["240", s(3)],
  13: [s(1), "21,46"],
  14: [s(1)],
  15: [s(0), s(3)],
  16: [vf(F, V, V, F)],
  17: ["12"],
  18: ["84"],
  19: [s(0)],
  20: [s(1), "33"],
  21: [s(0)],
  22: ["62315789"],
  23: [s(1)],
  24: ["32", s(2)],
  25: [s(0)],
  26: [s(2), s(3)],
  27: [s(0)],
  28: [s(2)],
  29: [s(3)],
  30: [s(1)],
  31: [s(2)],
  32: [s(2)],
};

const ERRORI: [number, number, Risposta][] = [
  [3, 1, "1500"], // crescita lineare: +100 al giorno
  [4, 0, vf(F, F, V, V)], // confonde i più alti di B con quelli di A
  [8, 2, "1/3"], // sbaglia il segno
  [12, 0, "640"], // calcola l'80% degli 800 studenti della scuola
  [13, 1, "75"], // toglie dal quadrato solo un quarto di cerchio
  [16, 0, vf(F, V, F, F)], // legge «solo se» come «se»
  [17, 0, "24"], // somma le aree dei due triangoli tolti
  [18, 0, "8232"], // moltiplica i tre numeri invece del mcm
  [20, 1, "49"], // divide per le vittime del 2007
  [22, 0, "623158"], // usa 0,95 invece di 0,0095
  [24, 0, "24"], // la terza cornice invece della quarta
];

provaPacchettoInvalsi({
  nome: "INVALSI 2013",
  pacchetto: PACCHETTO_INVALSI_2013,
  domande: 32,
  soluzioni: SOLUZIONI,
  errori: ERRORI,
});
