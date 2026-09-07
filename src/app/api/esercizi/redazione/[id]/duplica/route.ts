import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { duplicaEsercizio } from "@/lib/esercizi/redazione";

// `duplicaEsercizio` rifiuta solo con `non_trovato`: non chiama mai
// `verificaSuSemi` (copia il contenuto grezzo dell'ultima versione così
// com'è, vedi il commento su `duplicaEsercizio` in redazione.ts), quindi
// niente 422 qui.
const STATI: Record<string, number> = {
  non_trovato: 404,
};

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const teacherId = gate.session.user.id;
  const { id } = await params;

  const limite = await checkRateLimit({ key: `esercizi:redazione-duplica:${teacherId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const esito = await duplicaEsercizio(id, teacherId);
  if (!esito.ok) {
    return NextResponse.json(
      { error: esito.motivo, ...(esito.dettaglio !== undefined ? { dettaglio: esito.dettaglio } : {}) },
      { status: STATI[esito.motivo] ?? 400 },
    );
  }
  return NextResponse.json({ esercizioId: esito.esercizioId, versione: esito.versione }, { status: 201 });
}
