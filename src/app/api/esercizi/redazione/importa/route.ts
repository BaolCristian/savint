import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { importaEsercizi } from "@/lib/esercizi/importa/importa";
import { MAX_ESERCIZI_IMPORT } from "@/lib/esercizi/importa/estrai";

// Stesso tetto e stesso schema del controllo (vedi verifica/route.ts): il
// corpo in byte UTF-8, gli elementi lasciati `unknown` al dominio.
const MAX_BYTE_CORPO = 1_000_000;

const bodySchema = z.object({ esercizi: z.array(z.unknown()).min(1).max(MAX_ESERCIZI_IMPORT) });

// L'import vero: crea gli esercizi validi e verificati, salta i doppioni e
// riporta un esito per elemento. Il server non si fida del controllo fatto
// prima: `importaEsercizi` rifà tutto, e un secondo invio dello stesso
// contenuto dà `gia_presente` invece di una copia. Lo status è 200 anche se
// alcuni elementi falliscono: l'esito è per elemento, nel corpo.
export async function POST(request: Request) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const teacherId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:redazione-importa:${teacherId}`, windowSeconds: 60, max: 10 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const testo = await request.text();
  if (new TextEncoder().encode(testo).length > MAX_BYTE_CORPO) {
    return NextResponse.json({ error: "troppo_grande" }, { status: 413 });
  }

  let corpo: unknown;
  try {
    corpo = JSON.parse(testo);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const esiti = await importaEsercizi(parsed.data.esercizi, teacherId);
  return NextResponse.json({ esiti });
}
