import { PACCHETTO_INVALSI_2017 } from "../../../../scripts/genera-invalsi-2017";
import { intero, provaPacchettoInvalsi, s, vf, V, F, type RispostaErrata, type Soluzione } from "./invalsi-comune";

/** La prova INVALSI 2016/17 trascritta in 32 esercizi (scripts/genera-invalsi-2017.ts).
 * Le risposte giuste sono scritte qui, A PARTE dal modello (vedi invalsi-comune.ts).
 *
 * Per le domande a numeri variabili la soluzione è una funzione dei valori
 * estratti: rifà il calcolo dai soli dati che lo studente legge nel testo,
 * senza usare le variabili «risultato» del modello. */

const SOLUZIONI: Record<number, Soluzione> = {
  // Uomini + (uomini + diff) = totale.
  1: ({ totale, diff }) => [s(1, String(intero((totale - diff) / 2, "gli uomini")))],
  2: [vf(V, F, F)],
  3: [s(1)],
  4: [vf(V, V, F), s(1)],
  // La cornice di 3 cm su entrambi i lati di ogni dimensione.
  5: ({ lungo, largo }) => [s(0, `${(lungo + 6) * (largo + 6)}\\text{ cm}^2`)],
  6: ["8", "5", "3", "1"],
  7: [s(2)],
  8: ({ menta, limone, totmenta, totlimone }) => [String(Math.min(Math.floor(totmenta / menta), Math.floor(totlimone / limone)))],
  9: ({ perimetro }) => [String(intero((perimetro / 4) * 6, "il perimetro"))],
  10: [s(2)],
  11: [vf(F, F, V)],
  12: ["3,25"],
  13: ({ pend, x0, y0 }) => [String(y0 - pend * x0)],
  // Compenso = fisso + 10% del prezzo per copia.
  14: ({ fisso, prezzo, forfait }) => {
    const quota = prezzo / 10;
    return [
      String(fisso),
      String(fisso + 1000 * quota),
      String(fisso + 2000 * quota),
      `${fisso}+${quota}n`,
      String(intero((forfait - fisso) / quota, "le copie")),
    ];
  },
  15: [s(3), s(1), s(2), s(4), s(0)],
  16: [s(2), s(0), s(1), s(1), s(1)],
  17: ["0,36"],
  18: [s(0)],
  19: [s(2)],
  20: [{ caselle: [V, V, V, V, V, F, F, F] }, "4"],
  21: [s(2)],
  22: ({ f1, f2, f3, f4 }) => [
    s(2, `\\frac{30 \\cdot ${f1} + 90 \\cdot ${f2} + 150 \\cdot ${f3} + 240 \\cdot ${f4}}{${f1} + ${f2} + ${f3} + ${f4}}`),
  ],
  23: [s(0)],
  24: [s(0)],
  25: [s(2)],
  26: ["131", s(0)],
  27: [vf(V, F, F)],
  28: [s(1)],
  29: ({ p16a, p16b }) => [String(p16a), String(p16a + p16b)],
  30: [vf(V, F, V, V)],
  31: [vf(V, F, F)],
  // (1 - 1/den) / (1 + 1/den) = (den - 1) / (den + 1).
  32: ({ den }) => [`${den - 1}/${den + 1}`],
};

const ERRORI: [number, number, RispostaErrata][] = [
  [1, 0, s(3)], // totale − diff: dimentica di dividere per 2
  [1, 0, s(0)], // metà del totale più la differenza
  [2, 0, vf(V, V, F)], // confronta i numeri di alberi guariti, non le percentuali
  [4, 0, vf(V, V, V)], // confonde la posizione (30 km) con la strada percorsa (90 km)
  [5, 0, s(3)], // la cornice contata una volta sola per lato
  [6, 0, "4"], // conta una tacca per unità
  [8, 0, ({ limone, totlimone }) => String(Math.floor(totlimone / limone))], // guarda solo le caramelle al limone
  [9, 0, ({ perimetro }) => String(2 * perimetro)], // somma i due perimetri, contando il lato comune
  [10, 0, s(0)], // media dei soli tre mesi del grafico
  [12, 0, "6,5"], // dimezza l'area invece di ridurla a un quarto
  [13, 0, ({ pend, x0, y0 }) => String(y0 + pend * x0)], // sbaglia il segno portando il termine
  [14, 3, ({ fisso, prezzo }) => `${fisso}+${prezzo}n`], // il prezzo di copertina invece del 10%
  [14, 4, ({ fisso, prezzo, forfait }) => String((forfait - fisso) / (prezzo / 10) / 10)], // sbaglia uno zero
  [16, 3, s(2)], // i centesimi presi come euro
  [17, 0, "0,9"], // somma le probabilità di vincere 0,3 + 0,6
  [19, 0, s(3)], // un cubetto per foro più quello centrale
  [20, 1, "6"], // la somma più grande, non la più probabile
  [22, 0, s(1)], // gli estremi superiori delle classi invece dei valori centrali
  [26, 1, s(1)], // rapporto rispetto al 2008 invece che al 2006
  [28, 0, s(0)], // aggiunge il 20% al prezzo scontato
  [29, 0, ({ tot1 }) => String(tot1)], // tutta la produzione di M1, non solo le 16 GB
  [29, 1, ({ p16b }) => String(p16b)], // confonde la riga di M2 con il totale
  [32, 0, "1"], // semplifica 1/den sopra e sotto
  [32, 0, ({ den }) => `${den - 1}/${den}`], // si ferma al numeratore
];

provaPacchettoInvalsi({
  nome: "INVALSI 2017",
  pacchetto: PACCHETTO_INVALSI_2017,
  domande: 32,
  soluzioni: SOLUZIONI,
  errori: ERRORI,
});
