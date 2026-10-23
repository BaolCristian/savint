import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/require-role";
import { MAX_EVENTI, registraEventi } from "@/lib/esercizi/prova-verifica";
import { limiteEventi, rispostaRifiuto } from "../comune";

// Le uscite dalla pagina della prova e i rientri, a lotti. Ore e durate le
// limita il dominio; qui solo la forma.
const bodySchema = z.object({
  eventi: z.array(z.object({
    tipo: z.enum(["USCITA", "RIENTRO"]),
    motivo: z.enum(["SCHERMO_INTERO", "SCHEDA", "FOCUS"]).optional(),
    at: z.string().datetime(),
    durataMs: z.number().int().optional(),
  })).max(MAX_EVENTI),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStudent();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const studentId = gate.session.user.id;
  const bloccato = await limiteEventi(studentId);
  if (bloccato) return bloccato;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const ora = new Date();
  const esito = await registraEventi(id, studentId, parsed.data.eventi, ora);
  if (!esito.ok) return rispostaRifiuto(esito.motivo, ora);
  return new NextResponse(null, { status: 204 });
}
