import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { utenteDaSessione } from "@/lib/esercizi/accesso";
import { eliminaCommento, risolviCommento } from "@/lib/esercizi/commenti";

// Un commento: PATCH lo segna come risolto o lo riapre, DELETE lo elimina
// (con le sue risposte). Un commento di un esercizio che chi chiede non vede
// è 404, come uno inesistente.

const corpoSchema = z.object({ risolto: z.boolean() });

const STATI: Record<string, number> = { non_trovato: 404, non_permesso: 403 };

/** Lo stesso limite delle altre scritture dell'area: 30 ogni 60 secondi. */
async function limitato(teacherId: string) {
  const limite = await checkRateLimit({ key: `esercizi:commenti:${teacherId}`, windowSeconds: 60, max: 30 });
  if (limite.allowed) return null;
  return NextResponse.json({ error: "rate_limited" }, {
    status: 429,
    headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;
  const { id } = await params;

  const fermo = await limitato(gate.session.user.id);
  if (fermo) return fermo;

  const json = await request.json().catch(() => null);
  const parsed = corpoSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const esito = await risolviCommento(id, utenteDaSessione(gate.session), parsed.data.risolto);
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: STATI[esito.motivo] ?? 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;
  const { id } = await params;

  const fermo = await limitato(gate.session.user.id);
  if (fermo) return fermo;

  const esito = await eliminaCommento(id, utenteDaSessione(gate.session));
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: STATI[esito.motivo] ?? 400 });
  return NextResponse.json({ ok: true });
}
