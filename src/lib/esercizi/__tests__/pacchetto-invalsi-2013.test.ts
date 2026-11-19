import { PACCHETTO_INVALSI_2013 } from "../../../../scripts/genera-invalsi-2013";
import { intero, num, provaPacchettoInvalsi, s, vf, V, F, type RispostaErrata, type Soluzione } from "./invalsi-comune";

/** La prova INVALSI 2012/13 trascritta in 32 esercizi (scripts/genera-invalsi-2013.ts).
 * Le risposte giuste sono scritte qui, A PARTE dal modello (vedi invalsi-comune.ts).
 *
 * Per le domande a numeri variabili la soluzione è una funzione dei valori
 * estratti: rifà il calcolo dai soli dati che lo studente legge nel testo,
 * senza usare le variabili «risultato» del modello. */

const mcd = (a: number, b: number): number => (b === 0 ? a : mcd(b, a % b));
const mcm = (a: number, b: number): number => (a * b) / mcd(a, b);

const SOLUZIONI: Record<number, Soluzione> = {
  1: [s(0)],
  // L stampa il triplo di D: D stampa un quarto del totale, due L ne fanno 6/4.
  2: ({ totale }) => [s(2, String(intero((6 * totale) / 4)))],
  3: [s(0), "1610,51"],
  4: [vf(F, F, V, F)],
  5: [s(0)],
  6: [s(0)],
  // (1 + p/100)² - 1, in percentuale.
  7: ({ perc }) => [s(1, `${num(1 + perc / 100)}a`), s(2, `Del ${intero(((100 + perc) ** 2 - 100 ** 2) / 100, "l'aumento dell'area")}%`)],
  8: [s(1), "1", "-1/3", s(0)],
  9: [s(2)],
  10: [s(3)],
  11: ({ q1, q2 }) => [s(0, num((100 - q2) / 100)), s(1, `${num((q1 * q2) / 100)}%`)],
  12: ["240", s(3)],
  13: [s(1), "21,46"],
  14: [s(1)],
  15: [s(0), s(3)],
  16: [vf(F, V, V, F)],
  // Base AE per altezza uguale al lato.
  17: ({ k, lato }) => [String(k * lato)],
  18: ({ carta, vetro, plastica }) => [String(mcm(mcm(carta, vetro), plastica))],
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

const ERRORI: [number, number, RispostaErrata][] = [
  [2, 0, s(3)], // raddoppia il totale
  [2, 0, s(1)], // aggiunge al totale le pagine di D una volta sola
  [7, 0, s(3)], // aggiunge il decimale invece di moltiplicare
  [7, 1, s(0)], // l'area aumenta come il lato
  [7, 1, s(1)], // raddoppia l'aumento del lato
  [11, 0, s(1)], // il difetto di M1
  [11, 1, s(0)], // il solo indice di M2
  [11, 1, s(3)], // somma le probabilità
  [3, 1, "1500"], // crescita lineare: +100 al giorno
  [4, 0, vf(F, F, V, V)], // confonde i più alti di B con quelli di A
  [8, 2, "1/3"], // sbaglia il segno
  [12, 0, "640"], // calcola l'80% degli 800 studenti della scuola
  [13, 1, "75"], // toglie dal quadrato solo un quarto di cerchio
  [16, 0, vf(F, V, F, F)], // legge «solo se» come «se»
  [17, 0, ({ k, lato }) => String((lato - k) * lato)], // somma le aree dei due triangoli tolti
  [18, 0, ({ carta, vetro, plastica }) => String(carta * vetro * plastica)], // moltiplica i tre numeri invece del mcm
  [18, 0, ({ carta, vetro, plastica }) => String(carta + vetro + plastica)], // somma i tre periodi
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
