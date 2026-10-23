import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { NOME_FILE_FORMULARIO } from "@/lib/esercizi/formulari";
import { modificaVerificaPreparata, monitoraggioVerifica } from "@/lib/esercizi/verifiche";
import { limiteVerifiche, rispostaAzione } from "./comune";

// Una verifica vista dal docente: GET il monitoraggio (nessun punteggio),
// PATCH le impostazioni finché è preparata. Le regole sui valori (durata,
// avvio nel futuro, formulario caricato) sono del dominio; qui solo la forma.
const modo = z.enum(["NESSUNO", "SOLO_PDP", "TUTTI"]);
const bodySchema = z.object({
  durataMinuti: z.number().int().optional(),
  avvioProgrammatoAt: z.coerce.date().nullable().optional(),
  calcolatrice: modo.optional(),
  formulario: modo.optional(),
  formularioFile: z.string().regex(NOME_FILE_FORMULARIO).nullable().optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const teacherId = gate.session.user.id;
  const bloccato = await limiteVerifiche(teacherId);
  if (bloccato) return bloccato;

  const monitoraggio = await monitoraggioVerifica(id, teacherId);
  if (!monitoraggio) return NextResponse.json({ error: "non_trovata" }, { status: 404 });
  // Le date diventano stringhe ISO nella serializzazione JSON.
  return NextResponse.json(monitoraggio);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const teacherId = gate.session.user.id;
  const bloccato = await limiteVerifiche(teacherId);
  if (bloccato) return bloccato;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  return rispostaAzione(await modificaVerificaPreparata(id, teacherId, parsed.data));
}
