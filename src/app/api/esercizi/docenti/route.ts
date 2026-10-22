import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth/require-role";
import { docentiDellaScuola } from "@/lib/esercizi/condivisione";

// I colleghi a cui si può condividere (TEACHER e ADMIN), escluso chi chiede:
// l'elenco a ricerca "Aggiungi colleghi" della finestra "Condividi".
export async function GET() {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;
  return NextResponse.json({ docenti: await docentiDellaScuola(gate.session.user.id) });
}
