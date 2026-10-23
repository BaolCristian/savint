import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { salvaFormulario } from "@/lib/esercizi/formulari";

/** Carica il formulario di una verifica (PDF o immagine) e ne restituisce il
 * SOLO nome (`{ file }`), che la pagina manda poi in `verifica.formularioFile`
 * quando crea la verifica. Il file non è pubblico: vedi formulari.ts. */
export async function POST(request: Request) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const teacherId = gate.session.user.id;
  const limite = await checkRateLimit({ key: `esercizi:formulari:${teacherId}`, windowSeconds: 60, max: 10 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const dati = await request.formData().catch(() => null);
  const file = dati?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file_mancante" }, { status: 400 });

  const esito = await salvaFormulario(file);
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: 400 });
  return NextResponse.json({ file: esito.file }, { status: 201 });
}
