import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/require-role";
import { consegnaProva } from "@/lib/esercizi/prova-verifica";
import { limiteProva, rispostaRifiuto } from "../comune";

// Lo studente consegna la prova. Idempotente: una seconda consegna è ok.
// `{ automatica: true }` è la consegna che il client fa da sé allo zero
// dell'orologio: prima della scadenza vera (minuti aggiunti dal docente) il
// server risponde 409 `non_scaduta` con la scadenza nuova e l'ora del server.
// Senza corpo, o con un corpo diverso, è la consegna dello studente.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStudent();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const studentId = gate.session.user.id;
  const bloccato = await limiteProva(studentId);
  if (bloccato) return bloccato;

  const corpo = (await request.json().catch(() => null)) as { automatica?: unknown } | null;
  const automatica = corpo?.automatica === true;
  const ora = new Date();
  const esito = await consegnaProva(id, studentId, ora, automatica);
  if (esito.ok) return NextResponse.json({ ok: true });
  if (esito.motivo === "non_scaduta") {
    return NextResponse.json({ error: esito.motivo, scadenza: esito.scadenza, oraServer: ora }, { status: 409 });
  }
  return rispostaRifiuto(esito.motivo, ora);
}
