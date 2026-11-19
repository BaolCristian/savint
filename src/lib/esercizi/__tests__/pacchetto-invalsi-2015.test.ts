import { PACCHETTO_INVALSI_2015 } from "../../../../scripts/genera-invalsi-2015";
import { intero, num, provaPacchettoInvalsi, s, vf, V, F, type RispostaErrata, type Soluzione } from "./invalsi-comune";

/** La prova INVALSI 2014/15 trascritta in 31 esercizi (scripts/genera-invalsi-2015.ts).
 * Le risposte giuste sono scritte qui, A PARTE dal modello (vedi invalsi-comune.ts).
 *
 * Per le domande a numeri variabili la soluzione è una funzione dei valori
 * estratti: rifà il calcolo dai soli dati che lo studente legge nel testo,
 * senza usare le variabili «risultato» del modello. */

const SOLUZIONI: Record<number, Soluzione> = {
  1: [vf(V, V, F, V)],
  2: [s(2)],
  3: [vf(F, V, V)],
  // Entrano `entra`, escono `esce`, oggi ce ne sono N.
  4: ({ entra, esce, N }) => {
    const perde = esce - entra;
    return [
      String(N - perde),
      String(N - 2 * perde),
      String(N - 3 * perde),
      String(N - 4 * perde),
      `${N}-${perde}t`,
      s(1, `${intero(N / perde)} settimane`),
    ];
  },
  // La probabilità mostrata è (13 - k)/(52 - k): le carte tolte sono k.
  5: [s(0)],
  6: ({ k }) => ["1/4", String(k)],
  // h : ombra = palo : ombra del palo.
  7: ({ ombra, p, s: ombraPalo }) => [num(Math.round(((ombra * p) / ombraPalo) * 10) / 10)],
  8: ({ c, m, durata, E }) => [num((c + (durata + 1) * m) / 100), String(Math.floor((100 * E - c) / m))],
  9: ({ n1, n2, n3 }) => [String(n1 + n2), s(3, `${4 * (n1 + n2 + n3)}%`)],
  10: [vf(V, F, V, V)],
  11: [s(1), s(3)],
  12: ({ t1, t2, t3, t4, t5, t6, t7, t8 }) => {
    const t = [t1, t2, t3, t4, t5, t6, t7, t8];
    const media = intero(t.reduce((a, b) => a + b, 0) / 8, "la media");
    return [String(Math.max(...t) - Math.min(...t)), String(media)];
  },
  // x/a + x/b + L = x.
  13: ({ a, b, L }) => [s(3), num(L / (1 - 1 / a - 1 / b), 2)],
  14: ["49", "1", "2", "3", "4"],
  15: ({ m }) => [s(3, String(2 * m))],
  16: ({ r }) => [s(3, String(r ** 3))],
  17: ({ h1, h2, ciclo, carico, svuota }) => [String(Math.floor((60 * (h2 - h1)) / (ciclo + carico + svuota)))],
  18: ({ p, q }) => [String(100 - q), s(1, `${num((p * q) / 100)}%`)],
  19: ["9"],
  20: [s(1)],
  21: ({ n }) => [s(1, `a^{${n}}\\cdot(a+1)`)],
  22: ({ rosse, blu }) => [`${blu - 2}/${rosse + blu - 2}`],
  23: ({ n1, n2, m1, m2 }) => [String(intero((n1 * m1 + n2 * m2) / (n1 + n2), "la media"))],
  24: [s(1)],
  25: ({ lanci }) => [s(0, `circa ${intero(lanci / 3)} volte`)],
  26: [s(3)],
  27: [vf(V, F, V, F)],
  28: [s(0), s(0)],
  29: [s(3)],
  30: [s(2)],
  31: [{ caselle: [V, V, V, V, V, F, F, F] }],
};

const ERRORI: [number, number, RispostaErrata][] = [
  [1, 0, vf(V, V, V, V)], // la tabella non vale tutta se una riga è sbagliata
  [4, 4, ({ N, esce }) => `${N}-${esce}t`], // dimentica l'acqua che entra
  [4, 5, s(0)], // divide per l'acqua che entra
  [6, 0, "12/52"], // toglie l'asso di cuori ma non dal totale delle carte
  [6, 1, ({ k }) => String(13 - k)], // i fiori rimasti, non quelli tolti
  [7, 0, ({ ombra, p, s: ombraPalo }) => num(Math.round(((ombra * ombraPalo) / p) * 10) / 10)], // proporzione rovesciata
  [8, 0, ({ c, m, durata }) => num((c + durata * m) / 100)], // paga i minuti interi, non quello iniziato
  [8, 1, ({ c, m, E }) => String(Math.floor((100 * E - c) / m) + 1)], // arrotonda per eccesso
  [9, 1, s(2)], // solo gli alunni a meno di 1 km
  // somma invece di differenza
  [12, 0, ({ t1, t2, t3, t4, t5, t6, t7, t8 }) => String(Math.max(t1, t2, t3, t4, t5, t6, t7, t8) + Math.min(t1, t2, t3, t4, t5, t6, t7, t8))],
  [13, 1, ({ a, b, L }) => num(L * (1 + 1 / a + 1 / b), 2)], // aggiunge a L le sue frazioni
  [14, 0, "25"], // il numero di studenti, non la percentuale
  [16, 0, s(2)], // il rapporto al quadrato
  [17, 0, ({ h1, h2, ciclo }) => String(Math.floor((60 * (h2 - h1)) / ciclo))], // dimentica carico e svuotamento
  [18, 1, s(0)], // somma le probabilità
  [22, 0, ({ rosse, blu }) => `${blu}/${rosse + blu}`], // non toglie le palline estratte
  [23, 0, ({ m1, m2 }) => num((m1 + m2) / 2)], // media semplice delle due medie
  [25, 0, s(3)], // maggiore o uguale a 4
  [31, 0, { caselle: [V, V, V, F, F, F, F, F] }], // solo i lati del quadrato
];

provaPacchettoInvalsi({
  nome: "INVALSI 2015",
  pacchetto: PACCHETTO_INVALSI_2015,
  domande: 31,
  soluzioni: SOLUZIONI,
  errori: ERRORI,
});
