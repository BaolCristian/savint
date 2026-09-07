import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { verificaEsercizio } from "@/lib/esercizi/redazione";
import { esercizioEditorSchema } from "@/lib/esercizi/editor/modello";

const bodySchema = z.object({ editor: esercizioEditorSchema });

// La stessa verifica che crea/salva corrono prima di scrivere, senza
// scrivere nulla: il pulsante "controlla" del modulo di redazione. Un
// esito negativo torna con la stessa forma (motivo + dettaglio, 422) delle
// rotte che salvano — vedi ../route.ts — così l'interfaccia può mostrare
// il dettaglio della verifica con lo stesso codice in entrambi i casi.
export async function POST(request: Request) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const teacherId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:redazione-verifica:${teacherId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const esito = verificaEsercizio(parsed.data.editor);
  if (!esito.ok) {
    return NextResponse.json({ error: "verifica_fallita", dettaglio: esito }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
