import { PACCHETTO_INVALSI_2014 } from "../../../../scripts/genera-invalsi-2014";
import { intero, provaPacchettoInvalsi, s, vf, V, F, type RispostaErrata, type Soluzione } from "./invalsi-comune";

/** La prova INVALSI 2013/14 trascritta in 28 esercizi (scripts/genera-invalsi-2014.ts).
 * Le risposte giuste sono scritte qui, A PARTE dal modello (vedi invalsi-comune.ts).
 *
 * Per le domande a numeri variabili la soluzione è una funzione dei valori
 * estratti: rifà il calcolo dai soli dati che lo studente legge nel testo,
 * senza usare le variabili «risultato» del modello. */

const SOLUZIONI: Record<number, Soluzione> = {
  1: [s(2)],
  2: [vf(V, F, V), vf(V, V, F)],
  3: [s(1), s(2)],
  4: [s(3), "28", "60+5n"],
  5: [s(1), vf(F, V, F)],
  6: [s(2)],
  7: ["18"],
  8: [s(3)],
  // Le percentuali si applicano una dopo l'altra, ognuna sui rimasti.
  9: ({ partecipa, ritiro1, ritiro2 }) => [String(intero((1000 * partecipa * (100 - ritiro1) * (100 - ritiro2)) / 1e6))],
  10: [vf(F, V, V)],
  11: ["1/4"],
  12: ({ occpos, disocpos, occneg, disocneg }) => [
    String(occpos + disocpos),
    String(disocpos + disocneg),
    `${occneg + disocneg}/${occpos + disocpos + occneg + disocneg}`,
    `${occpos}/${occpos + disocpos}`,
  ],
  13: [s(0)],
  14: [s(1), s(0), s(2)],
  15: [vf(V, F, F, V)],
  // AB è l'altra diagonale del rettangolo OACB: un raggio.
  16: ({ diametro }) => [String(intero(diametro / 2))],
  // x = 1: 2k - coef + noto - k = 0.
  17: ({ coef, noto }) => [String(coef - noto)],
  // L'altezza è il diametro: area = (somma delle basi) · 2r / 2.
  18: ({ raggio, area }) => [String(intero((2 * area) / (2 * raggio)))],
  19: ({ calcio, basket, nessuno }) => [String(calcio + basket - (100 - nessuno))],
  20: ({ difettosi, prod1, prod2 }) => [String(Math.round((difettosi * prod2) / prod1))],
  // Ogni quadrato ha metà dell'area del precedente: il quarto ha area A/8.
  21: ({ n }) => {
    const lato = Math.sqrt(16 * n * n);
    return [s(1, `${intero(lato / 4)}\\sqrt{2}cm`)];
  },
  22: [s(1), "6"],
  23: [vf(F, V, F, V)],
  24: [s(2)],
  25: ({ righe, colonne, q }) => [s(3), String(intero((righe * colonne) / q))],
  26: [s(3)],
  27: [s(1)],
  28: [s(3)],
};

const ERRORI: [number, number, RispostaErrata][] = [
  [2, 1, vf(V, V, V)], // legge la cumulata come pioggia del mese
  [4, 1, "40"], // 200 : 5, dimentica la quota fissa
  [4, 2, "5+60n"], // scambia quota fissa e costo per ingresso
  [7, 0, "17"], // conta i quadretti a occhio
  // somma le due percentuali di ritiro e le toglie insieme dai partenti
  [9, 0, ({ partecipa, ritiro1, ritiro2 }) => String((10 * partecipa * (100 - ritiro1 - ritiro2)) / 100)],
  [9, 0, ({ partecipa }) => String(10 * partecipa)], // dimentica i ritiri
  [11, 0, "1/2"], // confonde il triangolo QST con QSR
  [12, 0, ({ occpos, occneg }) => String(occpos + occneg)], // somma la colonna invece della riga
  [12, 2, ({ disocneg }) => `${disocneg}/1500`], // solo le disoccupate con giudizio negativo
  [12, 3, ({ occpos }) => `${occpos}/1500`], // probabilità sul totale, non sui giudizi positivi
  [16, 0, ({ diametro }) => String(diametro)], // prende il diametro
  [18, 0, ({ raggio, area }) => String((2 * area) / raggio)], // usa il raggio come altezza
  [18, 0, ({ raggio, area }) => String(area / (2 * raggio))], // dimentica il diviso 2 dell'area
  [19, 0, ({ calcio, basket }) => String(calcio + basket - 100)], // dimentica chi non segue nessuno sport
  [20, 0, ({ difettosi }) => String(difettosi)], // non riporta la proporzione
  [17, 0, ({ coef, noto }) => String(coef + noto)], // sbaglia il segno nel portare il termine noto
  [21, 0, s(3)], // il lato del secondo quadrato
  [21, 0, s(0)], // un quadrato di troppo
  [22, 1, "5"], // 1,2(h − 1) = h risolta male
  [25, 1, ({ q }) => String(q)], // confonde i fiori con il denominatore
  [25, 1, ({ righe, colonne }) => String(righe * colonne)], // dimentica di dividere
];

provaPacchettoInvalsi({
  nome: "INVALSI 2014",
  pacchetto: PACCHETTO_INVALSI_2014,
  domande: 28,
  soluzioni: SOLUZIONI,
  errori: ERRORI,
});
