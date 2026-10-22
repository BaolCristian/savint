import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { controllaImport } from "@/lib/esercizi/importa/importa";
import { utenteDaSessione } from "@/lib/esercizi/accesso";
import { MAX_ESERCIZI_IMPORT } from "@/lib/esercizi/importa/estrai";

// Il tetto del corpo, in byte UTF-8 del testo ricevuto: trenta esercizi
// stanno larghi in molto meno, oltre è un incolla sbagliato.
const MAX_BYTE_CORPO = 1_000_000;

// Gli elementi restano `unknown`: li valida il dominio uno per uno, così un
// elemento rotto diventa un esito `invalido` e non fa cadere gli altri.
const bodySchema = z.object({ esercizi: z.array(z.unknown()).min(1).max(MAX_ESERCIZI_IMPORT) });

// Il controllo in blocco senza scrivere nulla: l'anteprima dell'import. Il
// server rifà tutto da capo (normalizzazione, schema, verifica, doppioni)
// anche se il browser ha già estratto e normalizzato il testo incollato.
export async function POST(request: Request) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const teacherId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:redazione-importa-verifica:${teacherId}`, windowSeconds: 60, max: 10 });
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

  // I doppioni si cercano solo fra gli esercizi che il docente vede.
  const esiti = await controllaImport(parsed.data.esercizi, utenteDaSessione(gate.session));
  return NextResponse.json({ esiti });
}
