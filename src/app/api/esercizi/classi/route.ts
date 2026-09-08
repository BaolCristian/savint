import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { creaClasse } from "@/lib/esercizi/classi";

// `anno` opzionale in ingresso (non nel contratto del dominio, che vuole
// sempre `number | null`): un client che non lo manda intende "nessun
// anno", non un corpo malformato — l'assenza si traduce in `null` prima di
// chiamare `creaClasse`, sotto.
const bodySchema = z.object({
  nome: z.string().min(1).max(200),
  anno: z.number().int().nullable().optional(),
});

const STATI: Record<string, number> = {
  nome_gia_usato: 409,
};

export async function POST(request: Request) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const teacherId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:classi:${teacherId}`, windowSeconds: 60, max: 20 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const esito = await creaClasse(teacherId, { nome: parsed.data.nome, anno: parsed.data.anno ?? null });

  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: STATI[esito.motivo] ?? 400 });
  return NextResponse.json({ classe: esito.classe }, { status: 201 });
}
