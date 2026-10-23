import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { modificaPunti } from "@/lib/esercizi/risultati-verifica";
import { limiteVerifiche, rispostaAzione } from "../comune";

// I punti dati a mano dal docente a un esercizio di una prova consegnata;
// `punti: null` torna al calcolo automatico. Il valore (0 – punti
// dell'esercizio, passo 0,25) lo controlla il dominio.
const bodySchema = z.object({
  tentativoId: z.string().min(1),
  punti: z.number().nullable(),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const teacherId = gate.session.user.id;
  const bloccato = await limiteVerifiche(teacherId);
  if (bloccato) return bloccato;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  return rispostaAzione(await modificaPunti(id, teacherId, parsed.data.tentativoId, parsed.data.punti));
}
