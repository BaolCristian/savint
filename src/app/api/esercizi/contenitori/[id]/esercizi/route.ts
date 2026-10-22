import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { aggiungiEsercizi, togliEsercizio } from "@/lib/esercizi/contenitori";
import { utenteDaSessione } from "@/lib/esercizi/accesso";

// Una raccolta (o un esercizio) che il docente non vede è `non_trovato`:
// 404, come una che non esiste. `sola_lettura` è il 403 per chi la vede ma
// non può modificarla — la sua esistenza la conosce già (stessa mappatura
// delle rotte della redazione).
const STATI: Record<string, number> = { non_trovato: 404, sola_lettura: 403 };

const postBodySchema = z.object({
  esercizioIds: z.array(z.string().min(1)).min(1).max(500),
});

const deleteBodySchema = z.object({
  esercizioId: z.string().min(1),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const teacherId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:contenitori-esercizi-add:${teacherId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const parsed = postBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const esito = await aggiungiEsercizi(id, parsed.data.esercizioIds, utenteDaSessione(gate.session));
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: STATI[esito.motivo] ?? 400 });
  return NextResponse.json({ aggiunti: esito.aggiunti });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const teacherId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:contenitori-esercizi-rimuovi:${teacherId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const parsed = deleteBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const esito = await togliEsercizio(id, parsed.data.esercizioId, utenteDaSessione(gate.session));
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: STATI[esito.motivo] ?? 400 });
  return NextResponse.json({ ok: true });
}
