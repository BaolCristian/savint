import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { eliminaBatteria } from "@/lib/esercizi/batterie";

// Stessa forma della cancellazione di un contenitore (route sorella in
// contenitori/[id]/route.ts): il vincolo onDelete: Restrict a livello di
// schema resta la rete di sicurezza, `eliminaBatteria` e' cio' che
// trasforma un errore di Postgres in un motivo comprensibile per il docente.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const teacherId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:batterie-elimina:${teacherId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const esito = await eliminaBatteria(id);
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: 409 });
  return NextResponse.json({ ok: true });
}
