import { z } from "zod";

// Lo schema di `QuestionState` (`@savint/engine`) come arriva dal client: lo
// usano la rotta delle risposte di un compito e il salvataggio della prova
// di una verifica. Stava nella rotta delle risposte; spostato qui senza
// cambiare niente.

// Un `answer` reale non va oltre `boolean[][]` (le matrici `m_n_x`, viste dal
// Task 8 dell'engine) o `Answer[]` per i gap di un gapfill — due, tre livelli
// al più. Il precedente `z.lazy` ricorsivo non aveva un fondo: un corpo di
// poche decine di KB con array annidati per decine di migliaia di livelli fa
// scattare uno `RangeError: Maximum call stack size exceeded` dentro
// `safeParse`, che non è uno `ZodError` e quindi non viene intercettato da
// `safeParse` stesso (esce dalla funzione come eccezione non gestita) — un
// modo per uno studente autenticato di far cadere il processo con un corpo
// piccolo. Costruire lo schema con una profondità finita (il ramo foglia non
// contiene più `z.array`) fa sì che un array oltre quella profondità fallisca
// come "non è una foglia valida", senza altra ricorsione: l'esito è un
// `ZodError` normale, non uno sforamento dello stack. Si limita anche la
// lunghezza di ogni livello, contro un array piatto ma enorme.
const ANSWER_MAX_DEPTH = 6;
const ANSWER_MAX_ITEMS = 256;
// La foglia stringa non aveva alcun limite di lunghezza: una risposta da
// 300.000 caratteri tornava 200 e finiva persa dentro lo `state` del
// tentativo (provato con una richiesta vera). A 120 richieste al minuto per
// studente — il tetto del rate limit della rotta delle risposte — è una trentina di MB al
// minuto di stato scritto da un solo account autenticato, e rispedito al
// browser al caricamento successivo. Nessuna risposta reale si avvicina a
// questo tetto: la più lunga è un'espressione JME scritta a mano.
const ANSWER_MAX_CHARS = 512;

function buildAnswerSchema(depth: number): z.ZodType<unknown> {
  const leaf = z.union([z.string().max(ANSWER_MAX_CHARS), z.number(), z.boolean(), z.null()]);
  if (depth <= 0) return leaf;
  return z.union([leaf, z.array(buildAnswerSchema(depth - 1)).max(ANSWER_MAX_ITEMS)]);
}
export const answerSchema = buildAnswerSchema(ANSWER_MAX_DEPTH);

// Lo stato di una parte (`PartState` in `@savint/engine`): prima era
// `z.unknown()`, quindi un `null` dentro `state.parts` passava la validazione
// e arrivava fino a `restoreQuestion`, che lo tratta come un oggetto e lancia
// un `TypeError` non gestito. Tipizzarlo per intero — coi `gaps` a
// profondità finita, un gapfill non annida gap dentro gap in questo motore —
// fa rifiutare in validazione qualunque voce malformata, `null` incluso.
const PART_STATE_MAX_GAPS_DEPTH = 2;
const PART_STATE_MAX_ITEMS = 256;

function buildPartStateSchema(depth: number): z.ZodType<unknown> {
  const base = {
    path: z.string().min(1).max(32),
    answered: z.boolean(),
    score: z.number(),
    marks: z.number(),
    answer: answerSchema.optional(),
  };
  if (depth <= 0) return z.object(base);
  return z.object({ ...base, gaps: z.array(buildPartStateSchema(depth - 1)).max(PART_STATE_MAX_ITEMS).optional() });
}
const partStateSchema = buildPartStateSchema(PART_STATE_MAX_GAPS_DEPTH);

/** Lo stato di una domanda dichiarato dal client. */
export const statoDomandaSchema = z.object({
  seed: z.string(),
  answered: z.boolean(),
  submitted: z.number(),
  adviceDisplayed: z.boolean(),
  revealed: z.boolean(),
  score: z.number(),
  marks: z.number(),
  parts: z.array(partStateSchema).max(PART_STATE_MAX_ITEMS),
});
