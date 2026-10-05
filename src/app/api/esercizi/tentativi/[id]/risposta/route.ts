import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { applicaRisposta } from "@/lib/esercizi/tentativo";

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
// studente — il tetto del rate limit qui sotto — è una trentina di MB al
// minuto di stato scritto da un solo account autenticato, e rispedito al
// browser al caricamento successivo. Nessuna risposta reale si avvicina a
// questo tetto: la più lunga è un'espressione JME scritta a mano.
const ANSWER_MAX_CHARS = 512;

function buildAnswerSchema(depth: number): z.ZodType<unknown> {
  const leaf = z.union([z.string().max(ANSWER_MAX_CHARS), z.number(), z.boolean(), z.null()]);
  if (depth <= 0) return leaf;
  return z.union([leaf, z.array(buildAnswerSchema(depth - 1)).max(ANSWER_MAX_ITEMS)]);
}
const answerSchema = buildAnswerSchema(ANSWER_MAX_DEPTH);

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

const bodySchema = z.object({
  partPath: z.string().min(1).max(32).regex(/^p\d+(g\d+)?$/),
  answer: answerSchema,
  state: z.object({
    seed: z.string(),
    answered: z.boolean(),
    submitted: z.number(),
    adviceDisplayed: z.boolean(),
    revealed: z.boolean(),
    score: z.number(),
    marks: z.number(),
    parts: z.array(partStateSchema).max(PART_STATE_MAX_ITEMS),
  }),
});

const STATI: Record<string, number> = {
  non_trovato: 404, non_tuo: 403, gia_completato: 409, parte_sconosciuta: 400,
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStudent();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const studentId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:risposta:${studentId}`, windowSeconds: 60, max: 120 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const locale = request.headers.get("x-savint-locale") === "en" ? "en" : "it";

  // `applicaRisposta` ricostruisce la domanda dal motore a partire dallo
  // stato del client (`ricalcola`/`restoreQuestion`): lo schema sopra scarta
  // le forme che sappiamo essere pericolose, ma non può dimostrare che ogni
  // combinazione sintatticamente valida sia anche semanticamente coerente
  // con questa domanda (es. un `answer` del tipo sbagliato per quella parte).
  // Un errore qui è quindi "stato del client che il motore non riesce a
  // ricostruire", non un guasto del server: risponde 400 invece di lasciar
  // salire un 500.
  let esito;
  try {
    esito = await applicaRisposta(
      id, studentId, parsed.data.partPath, parsed.data.answer as never, parsed.data.state as never, locale,
    );
  } catch (e) {
    console.error("[esercizi/risposta] stato del client non ricostruibile", e);
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: STATI[esito.motivo] ?? 400 });
  return NextResponse.json({
    score: esito.score,
    maxScore: esito.maxScore,
    allCorrect: esito.allCorrect,
    feedback: esito.feedback,
  });
}
