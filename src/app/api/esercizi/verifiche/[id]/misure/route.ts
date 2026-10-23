import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { misurePdpSchema } from "@/lib/esercizi/misure-pdp";
import { misureDellaVerifica, salvaMisureVerifica } from "@/lib/esercizi/verifiche";
import { limiteVerifiche, rispostaAzione } from "../comune";

// Le misure PDP di una verifica: quelle della classe, o quelle cambiate per
// questa sola verifica finché è preparata. Solo i docenti con titolo sul
// compito; per gli altri 404.
const bodySchema = z.object({
  studentId: z.string().min(1),
  misure: misurePdpSchema,
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const teacherId = gate.session.user.id;
  const bloccato = await limiteVerifiche(teacherId);
  if (bloccato) return bloccato;

  const studenti = await misureDellaVerifica(id, teacherId);
  if (!studenti) return NextResponse.json({ error: "non_trovata" }, { status: 404 });
  return NextResponse.json({ studenti });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const teacherId = gate.session.user.id;
  const bloccato = await limiteVerifiche(teacherId);
  if (bloccato) return bloccato;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  return rispostaAzione(await salvaMisureVerifica(id, teacherId, parsed.data.studentId, parsed.data.misure));
}
