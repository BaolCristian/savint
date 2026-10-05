import { esercizioEditorSchema } from "./modello";

/** Una cosa che manca perché l'esercizio si possa salvare, detta in modo
 * che la pagina la traduca (vedi `erroreSalvataggio.incompleto`): mai il
 * messaggio grezzo di zod, che parla di percorsi e tipi, non di esercizi. */
export type Mancanza =
  | { chiave: "titolo" | "argomento" | "parti" | "altro" }
  | { chiave: "parte" | "variabile"; numero: number };

/** Che cosa impedisce a questo modello di passare `esercizioEditorSchema`.
 *
 * Prima il server rispondeva solo `invalid_body`, e la pagina «Salvataggio
 * non riuscito. Riprova.»: un docente con titolo e testo scritti, ma senza
 * argomento e senza parti, riprovava all'infinito senza sapere cosa
 * mancasse. Qui ogni difetto dello schema diventa una voce: una per campo
 * della scheda, una per parte o variabile (contate da uno, come le numera
 * la pagina), e una voce generica per tutto il resto — mai un silenzio. */
export function cosaManca(editor: unknown): Mancanza[] {
  const esito = esercizioEditorSchema.safeParse(editor);
  if (esito.success) return [];

  const voci: Mancanza[] = [];
  const viste = new Set<string>();
  function aggiungi(m: Mancanza) {
    const id = "numero" in m ? `${m.chiave}:${m.numero}` : m.chiave;
    if (viste.has(id)) return;
    viste.add(id);
    voci.push(m);
  }

  for (const problema of esito.error.issues) {
    const [primo, secondo] = problema.path;
    if (primo === "meta" && secondo === "titolo") aggiungi({ chiave: "titolo" });
    else if (primo === "meta" && secondo === "argomento") aggiungi({ chiave: "argomento" });
    else if (primo === "parti" && typeof secondo === "number") aggiungi({ chiave: "parte", numero: secondo + 1 });
    else if (primo === "parti") aggiungi({ chiave: "parti" });
    else if (primo === "variabili" && typeof secondo === "number") aggiungi({ chiave: "variabile", numero: secondo + 1 });
    else aggiungi({ chiave: "altro" });
  }
  return voci;
}

/** Il dettaglio di un `invalid_body` delle rotte di redazione: le
 * mancanze, quando il corpo porta almeno un `editor` da esaminare; niente,
 * quando il corpo non è nemmeno quello (JSON rotto, `editor` assente). */
export function dettaglioCorpoNonValido(corpo: unknown): { dettaglio?: Mancanza[] } {
  if (typeof corpo !== "object" || corpo === null || !("editor" in corpo)) return {};
  return { dettaglio: cosaManca((corpo as { editor: unknown }).editor) };
}
