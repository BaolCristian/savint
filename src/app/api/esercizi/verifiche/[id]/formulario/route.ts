import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { leggiFormulario } from "@/lib/esercizi/formulari";
import { puoVedereFormulario } from "@/lib/esercizi/prova-verifica";
import { prisma } from "@/lib/db/client";
import { limiteVerifiche } from "../comune";
import { limiteProva } from "../prova/comune";

// Il formulario di una verifica, per il docente con titolo o per lo
// studente con la prova aperta a cui spetta. Un 404 per ogni rifiuto: un
// 403 confermerebbe che la verifica (e il suo formulario) esiste.
const NON_TROVATO = () => NextResponse.json({ error: "non_trovato" }, { status: 404 });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const utente = { id: session.user.id, role: session.user.role };
  const bloccato = utente.role === "STUDENT" ? await limiteProva(utente.id) : await limiteVerifiche(utente.id);
  if (bloccato) return bloccato;

  if (!(await puoVedereFormulario(id, utente))) return NON_TROVATO();
  const verifica = await prisma.verifica.findUnique({ where: { compitoId: id }, select: { formularioFile: true } });
  const file = verifica?.formularioFile ? await leggiFormulario(verifica.formularioFile) : null;
  if (!file) return NON_TROVATO();

  return new NextResponse(Buffer.from(file.byte), {
    status: 200,
    headers: {
      "Content-Type": file.tipo,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
    },
  });
}
