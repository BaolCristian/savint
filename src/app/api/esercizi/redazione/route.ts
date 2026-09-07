import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { creaEsercizio, elencoRedazione } from "@/lib/esercizi/redazione";
import { esercizioEditorSchema } from "@/lib/esercizi/editor/modello";

const bodySchema = z.object({ editor: esercizioEditorSchema });

// Stessa mappatura in ogni rotta di questo gruppo (vedi anche [id]/route.ts
// e [id]/duplica/route.ts): `verifica_fallita` porta il dettaglio della
// verifica a venti semi — seme, fase, messaggio — nel corpo qui sotto.
// Appiattirlo su un messaggio generico ("salvataggio non riuscito")
// toglierebbe al docente l'unica informazione utile che quel controllo
// produce: è il modo in cui questo task fallisce più facilmente (vedi il
// brief). `versione_in_conflitto` è il rifiuto strutturato che la corsa fra
// due salvataggi concorrenti dello stesso esercizio produce ora (fix
// riportato dalla revisione del task precedente, vedi `redazione.ts`).
const STATI: Record<string, number> = {
  non_trovato: 404,
  non_rappresentabile: 409,
  verifica_fallita: 422,
  versione_in_conflitto: 409,
};

export async function GET() {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const elenco = await elencoRedazione();
  return NextResponse.json(elenco);
}

export async function POST(request: Request) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const teacherId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:redazione-crea:${teacherId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const esito = await creaEsercizio(parsed.data.editor, teacherId);
  if (!esito.ok) {
    return NextResponse.json(
      { error: esito.motivo, ...(esito.dettaglio !== undefined ? { dettaglio: esito.dettaglio } : {}) },
      { status: STATI[esito.motivo] ?? 400 },
    );
  }
  return NextResponse.json({ esercizioId: esito.esercizioId, versione: esito.versione }, { status: 201 });
}
