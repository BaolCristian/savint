import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { utenteDaSessione } from "@/lib/esercizi/accesso";
import { impostaCondivisione, leggiCondivisione } from "@/lib/esercizi/condivisione";

// La finestra "Condividi": GET legge chi ha accesso, PUT lo sostituisce.
// Solo il proprietario (o l'ADMIN) la usa: per chiunque altro la risorsa non
// esiste (404), come una inesistente — mai un 403 che ne riveli l'esistenza.
// La risorsa ha la stessa forma `Risorsa` in query (GET) e nel corpo (PUT).

const ruolo = z.enum(["VISUALIZZATORE", "COMMENTATORE", "EDITOR"]);
const id = z.string().min(1).max(100);

const risorsaSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("esercizio"), id }),
  z.object({ tipo: z.literal("contenitore"), id }),
  z.object({ tipo: z.literal("argomento"), argomento: z.string().trim().min(1).max(200), ownerId: id.optional() }),
]);

const corpoSchema = z.object({
  risorsa: risorsaSchema,
  persone: z.array(z.object({ userId: id, ruolo })).max(500),
  scuola: ruolo.nullable(),
});

const STATI: Record<string, number> = { non_trovato: 404, destinatario_non_valido: 422 };

export async function GET(request: NextRequest) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const parsed = risorsaSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });

  const stato = await leggiCondivisione(parsed.data, utenteDaSessione(gate.session));
  if (!stato) return NextResponse.json({ error: "non_trovato" }, { status: 404 });
  return NextResponse.json(stato);
}

export async function PUT(request: Request) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const teacherId = gate.session.user.id;
  // Come le altre rotte di scrittura di quest'area: 30 ogni 60 secondi.
  const limite = await checkRateLimit({ key: `esercizi:condivisione:${teacherId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const json = await request.json().catch(() => null);
  const parsed = corpoSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const { risorsa, persone, scuola } = parsed.data;
  const esito = await impostaCondivisione(risorsa, utenteDaSessione(gate.session), { persone, scuola });
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: STATI[esito.motivo] ?? 409 });
  return NextResponse.json({ ok: true });
}
