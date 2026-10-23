import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import type { MotivoProva } from "@/lib/esercizi/prova-verifica";

// Ciò che le rotte della prova dello studente hanno in comune: il limite
// per studente (il salvataggio automatico è fitto; gli eventi hanno il loro
// limite a parte) e la traduzione dei rifiuti. Ogni 409 porta l'ora del
// server, con cui il client rimette in pari il suo conto alla rovescia.

async function limite(key: string, max: number): Promise<NextResponse | null> {
  const esito = await checkRateLimit({ key, windowSeconds: 60, max });
  if (esito.allowed) return null;
  return NextResponse.json({ error: "rate_limited" }, {
    status: 429,
    headers: esito.retryAfterSeconds ? { "Retry-After": String(esito.retryAfterSeconds) } : undefined,
  });
}

export const limiteProva = (studentId: string) => limite(`esercizi:prova:${studentId}`, 300);
export const limiteEventi = (studentId: string) => limite(`esercizi:prova-eventi:${studentId}`, 60);

export function rispostaRifiuto(motivo: MotivoProva, oraServer: Date): NextResponse {
  if (motivo === "non_trovata") return NextResponse.json({ error: motivo }, { status: 404 });
  if (motivo === "invalid_state") return NextResponse.json({ error: motivo }, { status: 400 });
  return NextResponse.json({ error: motivo, oraServer }, { status: 409 });
}
