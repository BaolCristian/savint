import type { QuestionState, PartState } from "@savint/engine";

// Regole pure della modalità verifica: stato, tempi, sottoinsieme PDP,
// punteggio e ripulitura del contenuto. Niente database qui: chi legge e
// scrive le verifiche (e i test) le usa tutte da questo file.

/** Il margine con cui il server accetta ancora un salvataggio dopo la
 * scadenza della prova (rete lenta, coda di salvataggi in volo). */
export const GRAZIA_MS = 30_000;

export type StatoVerifica = "PREPARATA" | "IN_CORSO" | "CHIUSA" | "PUBBLICATA";

/** Lo stato di una verifica si legge dalle sue date: vince la più avanzata. */
export function statoVerifica(v: {
  avviataAt: Date | null;
  chiusaAt: Date | null;
  pubblicataAt: Date | null;
}): StatoVerifica {
  if (v.pubblicataAt) return "PUBBLICATA";
  if (v.chiusaAt) return "CHIUSA";
  if (v.avviataAt) return "IN_CORSO";
  return "PREPARATA";
}

/** Un blocco della verifica, congelato in Verifica.layout. `quanti` sono gli
 * esercizi che il blocco mette nell'estrazione di ogni studente: le
 * posizioni del blocco k sono [Σ quanti dei blocchi prima, + quanti).
 * `quantiPdp` vale per i blocchi casuali (le prime posizioni del blocco),
 * `nonPerPdp` (id di Esercizio) per i blocchi scelti a mano. */
export type LayoutBlocco = {
  quanti: number;
  punti: number;
  quantiPdp: number;
  scelti: boolean;
  nonPerPdp: string[];
};

/** La scadenza di una prova: durata allungata del tempo extra in
 * percentuale, più i minuti extra. */
export function scadenzaProva(i: {
  inizio: Date;
  durataMinuti: number;
  tempoExtraPct: number;
  minutiExtra: number;
}): Date {
  const durataMs = Math.round(i.durataMinuti * (1 + i.tempoExtraPct / 100) * 60_000);
  return new Date(i.inizio.getTime() + durataMs + i.minutiExtra * 60_000);
}

/** Le posizioni dell'estrazione che la prova chiede allo studente, con i
 * punti di ciascuna, in ordine crescente. Senza «meno esercizi» tutte; con
 * la misura, per un blocco casuale le prime `quantiPdp` posizioni del
 * blocco, per un blocco scelti quelle il cui esercizio non è escluso. */
export function posizioniDellaProva(
  layout: LayoutBlocco[],
  esercizioIdPerPosizione: string[],
  menoEsercizi: boolean,
): { posizione: number; punti: number }[] {
  const risultato: { posizione: number; punti: number }[] = [];
  let inizio = 0;
  for (const blocco of layout) {
    for (let k = 0; k < blocco.quanti; k++) {
      const posizione = inizio + k;
      const inclusa = !menoEsercizi
        || (blocco.scelti
          ? !blocco.nonPerPdp.includes(esercizioIdPerPosizione[posizione]!)
          : k < blocco.quantiPdp);
      if (inclusa) risultato.push({ posizione, punti: blocco.punti });
    }
    inizio += blocco.quanti;
  }
  return risultato;
}

/** Il totale della verifica completa, senza riduzioni PDP. */
export function totalePieno(layout: LayoutBlocco[]): number {
  return layout.reduce((somma, b) => somma + b.quanti * b.punti, 0);
}

/** I punti di un esercizio della prova: quelli dati a mano dal docente se ci
 * sono, altrimenti la frazione del motore riportata sui punti del blocco. */
export function puntiCella(c: {
  punti: number;
  score: number;
  maxScore: number;
  puntiManuali: number | null;
}): number {
  if (c.puntiManuali !== null) return c.puntiManuali;
  return c.maxScore > 0 ? (c.score / c.maxScore) * c.punti : 0;
}

const arrotonda2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/** Il punteggio di una prova. Chi ha svolto meno esercizi (PDP) ha un
 * totale più basso: l'ottenuto si riporta in proporzione sul totale pieno,
 * così il voto si legge sulla stessa scala di tutta la classe. */
export function punteggioProva(
  celle: Parameters<typeof puntiCella>[0][],
  pieno: number,
): { ottenuto: number; totaleStudente: number; finale: number; percentuale: number } {
  const ottenuto = celle.reduce((somma, c) => somma + puntiCella(c), 0);
  const totaleStudente = celle.reduce((somma, c) => somma + c.punti, 0);
  const finale = totaleStudente > 0 ? (ottenuto * pieno) / totaleStudente : 0;
  const percentuale = pieno > 0 ? (finale / pieno) * 100 : 0;
  return {
    ottenuto: arrotonda2(ottenuto),
    totaleStudente: arrotonda2(totaleStudente),
    finale: arrotonda2(finale),
    percentuale: arrotonda2(percentuale),
  };
}

/** Una risposta senza contenuto: assente, testo vuoto o di soli spazi, o un
 * elenco (gap, matrice delle scelte) i cui elementi sono tutti vuoti o
 * `false`. */
export function rispostaVuota(a: unknown): boolean {
  if (a === undefined || a === null) return true;
  if (typeof a === "string") return a.trim() === "";
  if (Array.isArray(a)) return a.every((x) => x === false || rispostaVuota(x));
  return false;
}

function parteRisposta(p: PartState): boolean {
  if (p.answered && !rispostaVuota(p.answer)) return true;
  return (p.gaps ?? []).some(parteRisposta);
}

/** Lo studente ha risposto qualcosa: almeno una parte (o un gap) registrata
 * dal motore con una risposta non vuota. */
export function haRisposta(state: QuestionState | null): boolean {
  if (!state) return false;
  return state.parts.some(parteRisposta);
}

// I campi che durante la verifica darebbero allo studente un aiuto o un
// segnale di giusto/sbagliato: tolti da ogni parte, gap e alternativa.
const CAMPI_DI_AIUTO = ["distractors", "alternativeFeedbackMessage", "adaptiveMarkingNotUsedMessage"];
const FIGLI = ["parts", "gaps", "alternatives"];

function ripulisciParte(parte: unknown): void {
  if (!parte || typeof parte !== "object") return;
  const p = parte as Record<string, unknown>;
  for (const campo of CAMPI_DI_AIUTO) delete p[campo];
  for (const figli of FIGLI) {
    if (Array.isArray(p[figli])) (p[figli] as unknown[]).forEach(ripulisciParte);
  }
}

/** Il contenuto di un esercizio come lo vede lo studente durante la
 * verifica: senza svolgimento (`advice`) né spiegazioni delle scelte o
 * messaggi delle alternative. La correzione non cambia: restano risposte,
 * punti e alternative. Lavora su una copia, l'originale non si tocca. */
export function contenutoPerVerifica(content: unknown): unknown {
  if (!content || typeof content !== "object") return content;
  const copia = structuredClone(content) as Record<string, unknown>;
  copia.advice = "";
  if (Array.isArray(copia.parts)) copia.parts.forEach(ripulisciParte);
  return copia;
}
