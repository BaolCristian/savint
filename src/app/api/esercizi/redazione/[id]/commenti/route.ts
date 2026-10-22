import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { utenteDaSessione } from "@/lib/esercizi/accesso";
import { elencoCommenti, scriviCommento } from "@/lib/esercizi/commenti";

// I commenti di un esercizio: GET li legge, POST ne scrive uno (o una
// risposta, con `parentId`). Chi non vede l'esercizio riceve 404, come per
// un id inesistente; chi lo vede senza poter commentare 403. La lunghezza
// del testo (1..2000 dopo il trim) la controlla il dominio: 422.

const corpoSchema = z.object({
  testo: z.string().max(10_000),
  parentId: z.string().min(1).max(100).optional(),
});

const STATI: Record<string, number> = { non_trovato: 404, non_permesso: 403, testo_non_valido: 422 };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const commenti = await elencoCommenti(id, utenteDaSessione(gate.session));
  if (!commenti) return NextResponse.json({ error: "non_trovato" }, { status: 404 });
  return NextResponse.json({ commenti });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const teacherId = gate.session.user.id;
  const { id } = await params;

  // Come le altre rotte di scrittura di quest'area: 30 ogni 60 secondi.
  const limite = await checkRateLimit({ key: `esercizi:commenti:${teacherId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const json = await request.json().catch(() => null);
  const parsed = corpoSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const esito = await scriviCommento(id, utenteDaSessione(gate.session), parsed.data.testo, parsed.data.parentId);
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: STATI[esito.motivo] ?? 400 });
  return NextResponse.json({ id: esito.id }, { status: 201 });
}
