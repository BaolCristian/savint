import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import {
  aggiungiMinuti,
  avviaRecupero,
  avviaVerifica,
  chiudiRecupero,
  chiudiVerifica,
  type EsitoAzione,
} from "@/lib/esercizi/verifiche";
import { limiteVerifiche, rispostaAzione } from "../comune";

// Le azioni del docente su una verifica: avviare, chiudere, dare minuti,
// aprire e chiudere i recuperi. `pubblica` è nel contratto ma arriva con i
// risultati: fino ad allora risponde 400.
const studentIds = z.array(z.string().min(1)).min(1);
const bodySchema = z.discriminatedUnion("azione", [
  z.object({ azione: z.literal("avvia") }),
  z.object({ azione: z.literal("chiudi") }),
  z.object({ azione: z.literal("minuti"), minuti: z.number(), studentId: z.string().min(1).optional() }),
  z.object({ azione: z.literal("recupero"), studentIds }),
  z.object({ azione: z.literal("chiudiRecupero"), studentIds }),
  z.object({ azione: z.literal("pubblica"), studentIds: studentIds.optional() }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const teacherId = gate.session.user.id;
  const bloccato = await limiteVerifiche(teacherId);
  if (bloccato) return bloccato;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const corpo = parsed.data;
  let esito: EsitoAzione;
  switch (corpo.azione) {
    case "avvia":
      esito = await avviaVerifica(id, teacherId);
      break;
    case "chiudi":
      esito = await chiudiVerifica(id, teacherId);
      break;
    case "minuti":
      esito = await aggiungiMinuti(id, teacherId, corpo.minuti, corpo.studentId);
      break;
    case "recupero":
      esito = await avviaRecupero(id, teacherId, corpo.studentIds);
      break;
    case "chiudiRecupero":
      esito = await chiudiRecupero(id, teacherId, corpo.studentIds);
      break;
    case "pubblica":
      return NextResponse.json({ error: "non_disponibile" }, { status: 400 });
  }
  return rispostaAzione(esito);
}
