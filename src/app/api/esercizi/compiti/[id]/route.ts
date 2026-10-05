import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { modificaDateCompito, ritiraCompito, type EsitoGestioneCompito } from "@/lib/esercizi/compiti";

// Entrambe le date sono obbligatorie nel corpo: `null` toglie la data, una
// chiave assente invece sarebbe ambigua ("lasciala com'è" o "toglila"?). Il
// modulo della pagina di dettaglio le manda sempre tutte e due.
const bodySchema = z.object({
  opensAt: z.coerce.date().nullable(),
  dueAt: z.coerce.date().nullable(),
});

// 404 e non 403 per chi non ha titolo, come la creazione (compiti/route.ts)
// e la pagina delle consegne: un 403 confermerebbe che quel compito esiste a
// chi non ha motivo di saperlo. Il dominio risponde già con un solo motivo
// per "inesistente", "ritirato" e "non tuo", quindi anche il corpo è uguale.
const STATI: Record<string, number> = {
  compito_non_trovato: 404,
  scadenza_prima_apertura: 400,
  scadenza_nel_passato: 400,
};

async function limite(teacherId: string): Promise<NextResponse | null> {
  const esito = await checkRateLimit({ key: `esercizi:compiti-gestione:${teacherId}`, windowSeconds: 60, max: 30 });
  if (esito.allowed) return null;
  return NextResponse.json({ error: "rate_limited" }, {
    status: 429,
    headers: esito.retryAfterSeconds ? { "Retry-After": String(esito.retryAfterSeconds) } : undefined,
  });
}

function risposta(esito: EsitoGestioneCompito): NextResponse {
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: STATI[esito.motivo] ?? 400 });
  return NextResponse.json({ ok: true });
}

/** Cambia apertura e scadenza di un compito assegnato. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const teacherId = gate.session.user.id;

  const bloccato = await limite(teacherId);
  if (bloccato) return bloccato;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  return risposta(await modificaDateCompito(id, teacherId, parsed.data));
}

/** Ritira il compito: soft delete (vedi `ritiraCompito`), i tentativi già
 * svolti restano nel database. DELETE perché per chi usa l'interfaccia il
 * compito sparisce davvero, anche se la riga resta. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const teacherId = gate.session.user.id;

  const bloccato = await limite(teacherId);
  if (bloccato) return bloccato;

  return risposta(await ritiraCompito(id, teacherId));
}
