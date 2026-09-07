import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { salvaNuovaVersione, caricaPerEditor } from "@/lib/esercizi/redazione";
import { esercizioEditorSchema } from "@/lib/esercizi/editor/modello";

const bodySchema = z.object({ editor: esercizioEditorSchema });

// Vedi il commento gemello in ../route.ts: stessa mappatura, stessa
// ragione. `non_rappresentabile` qui può arrivare anche dal GET (un
// esercizio scritto a mano che l'editor non sa aprire), non solo dal PUT.
const STATI: Record<string, number> = {
  non_trovato: 404,
  non_rappresentabile: 409,
  verifica_fallita: 422,
  versione_in_conflitto: 409,
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const esito = await caricaPerEditor(id);
  if (!esito.ok) {
    return NextResponse.json({ error: esito.motivo, dettaglio: esito.dettaglio }, { status: STATI[esito.motivo] ?? 400 });
  }
  return NextResponse.json({
    editor: esito.editor,
    versione: esito.versione,
    autoreNome: esito.autoreNome,
    aggiornatoIl: esito.aggiornatoIl,
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const teacherId = gate.session.user.id;
  const { id } = await params;

  const limite = await checkRateLimit({ key: `esercizi:redazione-salva:${teacherId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const esito = await salvaNuovaVersione(id, parsed.data.editor);
  if (!esito.ok) {
    return NextResponse.json(
      { error: esito.motivo, ...(esito.dettaglio !== undefined ? { dettaglio: esito.dettaglio } : {}) },
      { status: STATI[esito.motivo] ?? 400 },
    );
  }
  return NextResponse.json({ esercizioId: esito.esercizioId, versione: esito.versione });
}
