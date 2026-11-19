import { PACCHETTO_INVALSI_2011 } from "../../../../scripts/genera-invalsi-2011";
import { num, provaPacchettoInvalsi, s, vf, V, F, type RispostaErrata, type Soluzione } from "./invalsi-comune";

/** La prova INVALSI 2010/11 trascritta in 30 esercizi (scripts/genera-invalsi-2011.ts).
 * Le risposte giuste sono scritte qui, A PARTE dal modello (vedi invalsi-comune.ts).
 *
 * Per le domande a numeri variabili la soluzione è una funzione dei valori
 * estratti: rifà il calcolo dai soli dati che lo studente legge nel testo,
 * senza usare le variabili «risultato» del modello. */

/** Il numero decimale fatto di cifre messe in certe posizioni dopo la
 * virgola (1 = decimi, 2 = centesimi, …), come lo scrive uno studente. */
const decimale = (cifre: [number, number][]): string => {
  // Ogni cifra come intero in centomillesimi: niente errori di arrotondamento.
  const centomillesimi = cifre.reduce((somma, [cifra, posizione]) => somma + cifra * 10 ** (5 - posizione), 0);
  return num(centomillesimi / 100000);
};

const SOLUZIONI: Record<number, Soluzione> = {
  1: [vf(F, V, V)],
  // In orario `orario`%: alle 6:34 la prende se non è in orario.
  2: ({ orario }) => [s(3, `${100 - orario}%`)],
  // Il terzo lato sta fra la differenza e la somma: la risposta è oltre la somma.
  3: ({ corto, lungo }) => [s(3, `${corto + lungo + 1} cm`)],
  4: [s(2)],
  5: [s(0)],
  6: [s(0), s(1), s(2)],
  7: ["600", s(2)],
  8: ["32,3", s(1)],
  9: [vf(F, V, V, F), "1", "1,41", "1,73"],
  10: ({ esp }) => [s(2, `\\left(\\frac{1}{2}\\right)^{${esp + 1}}`)],
  // 900 + 0,25k = speso.
  11: ({ speso }) => [s(2), String((speso - 900) / 0.25), s(2)],
  // Il primo numero di risposte esatte che supera la soglia.
  13: ({ domande, dati, tolti, soglia }) => {
    let minimo = 0;
    while (dati * minimo - tolti * (domande - minimo) <= soglia) minimo++;
    return [String(domande * dati), `${dati}n-${tolti}(${domande}-n)`, String(minimo)];
  },
  12: [s(2), s(0), s(1), s(1), s(2), s(1)],
  14: [s(0)],
  15: [s(3)],
  16: [s(2)],
  17: [s(3)],
  18: ["15"],
  19: ({ n1, n2, n3, n4 }) => [
    s(2, `\\frac{1,5\\cdot${n1}+2,5\\cdot${n2}+3,5\\cdot${n3}+4,5\\cdot${n4}}{${n1 + n2 + n3 + n4}}`),
  ],
  20: [s(1), s(0), "1340", "746"],
  21: [s(2)],
  22: [s(2)],
  23: [s(1), "297600"],
  24: [s(2)],
  // Il prezzo è il (100 + aliquota)% del costo base.
  25: ({ prezzo, aliquota }) => {
    const base = (prezzo * 100) / (100 + aliquota);
    return [num(Math.round(prezzo - base))];
  },
  26: [s(2)],
  27: ({ paga, perc }) => [s(0, `g=${paga}h+${num(perc / 100)}s`)],
  // Vinte e pareggiate uguali: 4 punti a coppia, il punteggio è un multiplo di 4.
  28: ({ vinte }) => [s(2, String(4 * vinte + 6))],
  29: ({ c1, c2, c3, c4 }) => [
    s(
      3,
      decimale([
        [c1, 1],
        [c2, 2],
        [c3, 4],
        [c4, 5],
      ]),
    ),
  ],
  30: [s(2)],
};

const ERRORI: [number, number, RispostaErrata][] = [
  [1, 0, vf(V, V, V)], // legge 711 292 come i maschi
  [2, 0, s(2)], // solo il ritardo di 5 minuti
  [3, 0, s(1)], // crede che il triangolo non possa essere isoscele
  [7, 0, "150"], // conta solo il tratto di via 20 Settembre
  [8, 0, "102,2"], // moltiplica per 16/9 invece che per 9/16
  [9, 2, "2"], // somma i lati invece di usare Pitagora
  [10, 0, s(3)], // toglie 1 all'esponente invece di aggiungerlo
  [11, 1, ({ speso }) => String(speso / 0.25)], // divide la spesa per 0,25 senza togliere le spese fisse
  [13, 1, ({ dati, tolti }) => `${dati}n-${tolti}`], // toglie i punti una volta sola, non per ogni risposta sbagliata
  // arrotonda per difetto il quoziente
  [13, 2, ({ domande, dati, tolti, soglia }) => String(Math.floor((soglia + tolti * domande) / (dati + tolti)))],
  [19, 0, s(3)], // divide per il numero delle classi
  [20, 2, "746"], // divide invece di moltiplicare
  [20, 3, "1340"], // moltiplica invece di dividere
  [23, 1, "74400"], // dimentica la densità di 4 persone al metro quadro
  [25, 0, ({ prezzo, aliquota }) => num((prezzo * aliquota) / 100)], // percentuale del prezzo finale invece che del costo base
  [27, 0, s(1)], // la percentuale divisa per 10
  [28, 0, s(1)], // un multiplo di 4
  [29, 0, s(2)], // dimentica lo zero dei millesimi
  [12, 0, s(0)], // crede di leggere nel grafico il confronto con il 1971-2000
];

provaPacchettoInvalsi({
  nome: "INVALSI 2011",
  pacchetto: PACCHETTO_INVALSI_2011,
  domande: 30,
  soluzioni: SOLUZIONI,
  errori: ERRORI,
});
