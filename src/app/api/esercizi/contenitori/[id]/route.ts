import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { eliminaContenitore } from "@/lib/esercizi/contenitori";

// Stessa forma della cancellazione di una batteria (route sorella in
// batterie/[id]/route.ts): il vincolo onDelete: Restrict a livello di schema
// resta la rete di sicurezza, `eliminaContenitore` e' cio' che trasforma un
// errore di Postgres in un motivo comprensibile per il docente.
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

  const esito = await eliminaContenitore(id);
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: 409 });
  return NextResponse.json({ ok: true });
}
