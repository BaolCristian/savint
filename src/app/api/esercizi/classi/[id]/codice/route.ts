import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { rigeneraCodice } from "@/lib/esercizi/classi";

// Stessa ragione della pagina delle consegne (compiti/[id]/page.tsx):
// `non_insegni_questa_classe` torna 404, non 403 — un 403 confermerebbe che
// quella classe esiste a un docente che non ha alcun titolo per saperlo.
const STATI: Record<string, number> = {
  non_trovata: 404,
  non_insegni_questa_classe: 404,
};

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const teacherId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:classi-codice:${teacherId}`, windowSeconds: 60, max: 20 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const esito = await rigeneraCodice(id, teacherId);
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: STATI[esito.motivo] ?? 400 });
  return NextResponse.json({ codice: esito.codice });
}
