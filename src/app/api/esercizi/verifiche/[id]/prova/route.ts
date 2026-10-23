import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/require-role";
import { entraNellaProva, tempoProva } from "@/lib/esercizi/prova-verifica";
import { limiteProva, rispostaRifiuto } from "./comune";

// La prova dello studente: POST entra (o rientra) e riceve esercizi ripuliti,
// scadenza e strumenti; GET il tempo per il conto alla rovescia.

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStudent();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const studentId = gate.session.user.id;
  const bloccato = await limiteProva(studentId);
  if (bloccato) return bloccato;

  const ora = new Date();
  const esito = await entraNellaProva(id, studentId, ora);
  if (!esito.ok) return rispostaRifiuto(esito.motivo, ora);
  // Le date diventano stringhe ISO nella serializzazione JSON.
  return NextResponse.json(esito.prova);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStudent();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const studentId = gate.session.user.id;
  const bloccato = await limiteProva(studentId);
  if (bloccato) return bloccato;

  const tempo = await tempoProva(id, studentId);
  if (!tempo) return NextResponse.json({ error: "non_trovata" }, { status: 404 });
  return NextResponse.json(tempo);
}
