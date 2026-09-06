import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { assegna } from "@/lib/esercizi/compiti";

const bodySchema = z.object({
  batteriaId: z.string().min(1),
  classeId: z.string().min(1),
  opensAt: z.coerce.date().optional(),
  dueAt: z.coerce.date().optional(),
});

// I motivi di `assegna` portano un significato che il docente deve vedere:
// `esercizi_insufficienti` porta anche un `dettaglio` (quale contenitore,
// quanti richiesti, quanti disponibili) che finisce nel corpo qui sotto —
// appiattirlo su un messaggio generico gli farebbe perdere il lavoro che il
// dominio ha fatto per produrlo.
const STATI: Record<string, number> = {
  batteria_non_trovata: 404,
  classe_non_trovata: 404,
  non_insegni_questa_classe: 403,
  esercizi_insufficienti: 409,
};

export async function POST(request: Request) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const teacherId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:compiti:${teacherId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const esito = await assegna(parsed.data.batteriaId, parsed.data.classeId, teacherId, {
    opensAt: parsed.data.opensAt,
    dueAt: parsed.data.dueAt,
  });

  if (!esito.ok) {
    return NextResponse.json(
      { error: esito.motivo, ...(esito.dettaglio !== undefined ? { dettaglio: esito.dettaglio } : {}) },
      { status: STATI[esito.motivo] ?? 400 },
    );
  }
  return NextResponse.json({ compitoId: esito.compitoId }, { status: 201 });
}
