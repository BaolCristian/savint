import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { utenteDaSessione } from "@/lib/esercizi/accesso";
import { misureDellaClasse, misurePdpSchema, salvaMisurePdp } from "@/lib/esercizi/misure-pdp";

// Le misure PDP degli iscritti di una classe (modalità verifica). Una classe
// che non è di chi chiede (e chi chiede non è ADMIN) risponde 404, come una
// che non esiste: un 403 confermerebbe che la classe c'è. Anche uno studente
// non iscritto è 404: per questa classe non esiste.
const bodySchema = z.object({
  studentId: z.string().min(1),
  misure: misurePdpSchema,
});

async function limite(teacherId: string): Promise<NextResponse | null> {
  const esito = await checkRateLimit({ key: `esercizi:misure-pdp:${teacherId}`, windowSeconds: 60, max: 60 });
  if (esito.allowed) return null;
  return NextResponse.json({ error: "rate_limited" }, {
    status: 429,
    headers: esito.retryAfterSeconds ? { "Retry-After": String(esito.retryAfterSeconds) } : undefined,
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const bloccato = await limite(gate.session.user.id);
  if (bloccato) return bloccato;

  const mappa = await misureDellaClasse(id, utenteDaSessione(gate.session));
  if (!mappa) return NextResponse.json({ error: "non_trovata" }, { status: 404 });
  return NextResponse.json({ misure: Object.fromEntries(mappa) });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const bloccato = await limite(gate.session.user.id);
  if (bloccato) return bloccato;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const esito = await salvaMisurePdp(id, parsed.data.studentId, utenteDaSessione(gate.session), parsed.data.misure);
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: 404 });
  return NextResponse.json({ ok: true });
}
