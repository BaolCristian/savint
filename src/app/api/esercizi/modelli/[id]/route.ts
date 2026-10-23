import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { eliminaModello } from "@/lib/esercizi/batterie";
import { utenteDaSessione } from "@/lib/esercizi/accesso";

// Eliminare un modello (Nuovo compito, Task 5): solo chi l'ha creato o un
// ADMIN. Per chiunque altro la risposta è 404, la stessa di un modello che
// non esiste (Decisioni, punto 1): nessun 403 che dica "c'è, ma non è tuo".
// Eliminare non tocca mai i compiti: vedi `eliminaModello`.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const teacherId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:modelli-elimina:${teacherId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const esito = await eliminaModello(id, utenteDaSessione(gate.session));
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: 404 });
  return NextResponse.json({ ok: true });
}
