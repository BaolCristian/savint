import { NextResponse } from "next/server";
import { z } from "zod";
import type { QuestionState } from "@savint/engine";
import { requireStudent } from "@/lib/auth/require-role";
import { salvaRisposta } from "@/lib/esercizi/prova-verifica";
import { statoDomandaSchema } from "@/lib/esercizi/stato-schema";
import { limiteProva, rispostaRifiuto } from "../comune";

// Il salvataggio automatico di un esercizio della prova. La risposta non
// porta mai punteggio né feedback: solo quando è stato salvato e la
// scadenza, con l'ora del server.
const bodySchema = z.object({
  tentativoId: z.string().min(1).max(64),
  state: statoDomandaSchema,
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStudent();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const studentId = gate.session.user.id;
  const bloccato = await limiteProva(studentId);
  if (bloccato) return bloccato;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const locale = request.headers.get("x-savint-locale") === "en" ? "en" : "it";
  const ora = new Date();
  const esito = await salvaRisposta(id, studentId, parsed.data.tentativoId, parsed.data.state as QuestionState, ora, locale);
  if (!esito.ok) return rispostaRifiuto(esito.motivo, ora);
  return NextResponse.json({ salvatoAt: esito.salvatoAt, scadenza: esito.scadenza, oraServer: ora });
}
