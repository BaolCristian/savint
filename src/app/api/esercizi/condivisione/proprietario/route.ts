import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { utenteDaSessione } from "@/lib/esercizi/accesso";
import { trasferisciProprieta } from "@/lib/esercizi/condivisione";

// Solo l'ADMIN passa un esercizio o una raccolta a un altro docente. Qui, e
// solo qui, il rifiuto è un 403: la rotta è dell'ADMIN per costruzione, non
// rivela niente su una risorsa che un docente non vede.
const corpoSchema = z.object({
  risorsa: z.object({ tipo: z.enum(["esercizio", "contenitore"]), id: z.string().min(1).max(100) }),
  nuovoProprietarioId: z.string().min(1).max(100),
});

const STATI: Record<string, number> = { non_permesso: 403, non_trovato: 404, destinatario_non_valido: 422 };

export async function POST(request: Request) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const teacherId = gate.session.user.id;
  const limite = await checkRateLimit({ key: `esercizi:proprietario:${teacherId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const json = await request.json().catch(() => null);
  const parsed = corpoSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const esito = await trasferisciProprieta(parsed.data.risorsa, parsed.data.nuovoProprietarioId, utenteDaSessione(gate.session));
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: STATI[esito.motivo] ?? 409 });
  return NextResponse.json({ ok: true });
}
