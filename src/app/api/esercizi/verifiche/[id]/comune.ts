import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import type { EsitoAzione } from "@/lib/esercizi/verifiche";

// Ciò che le rotte del docente su una verifica hanno in comune: il limite
// per docente (il monitoraggio interroga ogni 5 s, cioè 12 al minuto, e il
// limite lascia spazio alle azioni) e la traduzione degli esiti. 404 e non
// 403 per chi non ha titolo: un 403 confermerebbe che la verifica esiste.

export async function limiteVerifiche(teacherId: string): Promise<NextResponse | null> {
  const esito = await checkRateLimit({ key: `esercizi:verifiche:${teacherId}`, windowSeconds: 60, max: 120 });
  if (esito.allowed) return null;
  return NextResponse.json({ error: "rate_limited" }, {
    status: 429,
    headers: esito.retryAfterSeconds ? { "Retry-After": String(esito.retryAfterSeconds) } : undefined,
  });
}

const STATI: Record<Exclude<EsitoAzione, { ok: true }>["motivo"], number> = {
  non_trovata: 404,
  stato_non_valido: 409,
  studenti_non_validi: 400,
  valore_non_valido: 400,
};

export function rispostaAzione(esito: EsitoAzione): NextResponse {
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: STATI[esito.motivo] });
  return NextResponse.json({ ok: true });
}
