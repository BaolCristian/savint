import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth/require-role";
import { dettaglioRisposta, risultatiVerifica } from "@/lib/esercizi/risultati-verifica";
import { limiteVerifiche } from "../comune";

// I risultati di una verifica per il docente: la tabella studenti ×
// esercizi (solo a verifica chiusa o pubblicata: 409 durante la prova), o
// con `?tentativo=` la risposta di uno studente a un esercizio. 404 per chi
// non ha titolo sul compito.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const teacherId = gate.session.user.id;
  const bloccato = await limiteVerifiche(teacherId);
  if (bloccato) return bloccato;

  const tentativo = new URL(request.url).searchParams.get("tentativo");
  if (tentativo) {
    const dettaglio = await dettaglioRisposta(id, teacherId, tentativo);
    if (!dettaglio) return NextResponse.json({ error: "non_trovata" }, { status: 404 });
    return NextResponse.json(dettaglio);
  }

  const esito = await risultatiVerifica(id, teacherId);
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: esito.motivo === "non_trovata" ? 404 : 409 });
  return NextResponse.json(esito.risultati);
}
