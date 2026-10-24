import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { eliminaContenitore, modificaContenitore } from "@/lib/esercizi/contenitori";
import { utenteDaSessione } from "@/lib/esercizi/accesso";

// Il vincolo onDelete: Restrict a livello di schema resta la rete di
// sicurezza, `eliminaContenitore` e' cio' che trasforma un errore di
// Postgres in un motivo comprensibile per il docente.
// Solo il proprietario elimina: chi non vede la raccolta riceve 404 (come
// per una inesistente), chi la vede senza esserne proprietario 403.
const STATI: Record<string, number> = { non_trovato: 404, sola_lettura: 403, in_uso: 409 };
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const teacherId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:contenitori-elimina:${teacherId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const esito = await eliminaContenitore(id, utenteDaSessione(gate.session));
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: STATI[esito.motivo] ?? 409 });
  return NextResponse.json({ ok: true });
}

// Nome e descrizione, gli stessi limiti della creazione. Il nome si
// ripulisce dagli spazi prima del controllo: "   " non e' un nome.
const modificaSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const teacherId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:contenitori-modifica:${teacherId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const parsed = modificaSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const esito = await modificaContenitore(id, parsed.data, utenteDaSessione(gate.session));
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: STATI[esito.motivo] ?? 409 });
  return NextResponse.json({ ok: true });
}

