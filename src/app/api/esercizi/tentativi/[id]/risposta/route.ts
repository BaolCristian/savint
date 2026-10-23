import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { applicaRisposta } from "@/lib/esercizi/tentativo";
import { answerSchema, statoDomandaSchema } from "@/lib/esercizi/stato-schema";

const bodySchema = z.object({
  partPath: z.string().min(1).max(32).regex(/^p\d+(g\d+)?$/),
  answer: answerSchema,
  state: statoDomandaSchema,
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
