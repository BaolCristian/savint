/** I tipi degli esiti dell'import di esercizi e il testo da rimandare
 * all'IA quando un esercizio non va.
 *
 * Questo file lo importa anche il client (l'anteprima dell'import): deve
 * restare senza dipendenze dal server — niente prisma, niente redazione.ts,
 * solo tipi e funzioni pure. */

export type Problema = { percorso: string; messaggio: string };

export type EsitoControllo =
  | { indice: number; stato: "ok"; titolo: string; content: unknown }
  | { indice: number; stato: "invalido"; titolo: string | null; problemi: Problema[] }
  | {
      indice: number;
      stato: "verifica_fallita";
      titolo: string;
      dettaglio: { seme: number; fase: string; messaggio: string };
    }
  | { indice: number; stato: "gia_presente"; titolo: string; titoloEsistente: string; nelFile?: true };

export type EsitoImport =
  | { indice: number; stato: "creato"; titolo: string; esercizioId: string }
  // Il salvataggio è fallito per un motivo che non dipende dall'esercizio
  // (database, rete...): non è un errore da far correggere all'IA, per
  // questo `testoErrorePerIA` non lo accetta.
  | { indice: number; stato: "errore"; titolo: string; messaggio: string }
  | Exclude<EsitoControllo, { stato: "ok" }>;

const CHIUSURA = "Correggi l'esercizio e rimandami tutto il JSON, non solo l'esercizio corretto.";

/** Il testo che il docente copia e incolla nella conversazione con l'IA per
 * farle correggere un esercizio rifiutato. Gli esercizi si numerano da 1,
 * come li conterebbe chi legge il file, non da 0 come l'array. */
export function testoErrorePerIA(esito: Exclude<EsitoControllo, { stato: "ok" }>): string {
  const numero = esito.indice + 1;
  const nome = esito.titolo ? `L'esercizio n. ${numero} ("${esito.titolo}")` : `L'esercizio n. ${numero}`;
  switch (esito.stato) {
    case "invalido": {
      const elenco = esito.problemi.map((p) => `- ${p.percorso || "(esercizio)"}: ${p.messaggio}`).join("\n");
      return `${nome} non rispetta il formato richiesto:\n${elenco}\n${CHIUSURA}`;
    }
    case "verifica_fallita": {
      const { seme, fase, messaggio } = esito.dettaglio;
      return `${nome} non supera la verifica automatica (fase "${fase}", seme ${seme}): ${messaggio}\n${CHIUSURA}`;
    }
    case "gia_presente": {
      const dove = esito.nelFile
        ? `ripete un esercizio precedente dello stesso JSON ("${esito.titoloEsistente}")`
        : `è identico a un esercizio già presente in Savint ("${esito.titoloEsistente}")`;
      return `${nome} ${dove}. Sostituiscilo con un esercizio diverso e rimandami tutto il JSON.`;
    }
  }
}
