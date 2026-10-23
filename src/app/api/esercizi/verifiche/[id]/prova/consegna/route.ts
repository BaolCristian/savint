import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/require-role";
import { consegnaProva } from "@/lib/esercizi/prova-verifica";
import { limiteProva, rispostaRifiuto } from "../comune";

// Lo studente consegna la prova. Idempotente: una seconda consegna è ok.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStudent();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const studentId = gate.session.user.id;
  const bloccato = await limiteProva(studentId);
  if (bloccato) return bloccato;

  const ora = new Date();
  const esito = await consegnaProva(id, studentId, ora);
  if (!esito.ok) return rispostaRifiuto(esito.motivo, ora);
  return NextResponse.json({ ok: true });
}
