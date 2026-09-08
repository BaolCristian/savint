import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { iscrivitiConCodice } from "@/lib/esercizi/classi";

// Non e' una rotta da docente come le altre due sorelle (`../route.ts`,
// `../[id]/codice/route.ts`): e' l'unica delle tre che uno studente deve
// poter chiamare, quindi sta dietro `requireStudent`, non `requireTeacher`.
// Un cancello sbagliato qui rompe l'iscrizione (nessuno studente passa) o
// apre la scrittura a chiunque abbia un ruolo diverso da studente — vedi il
// registro in api/__tests__/teacher-only-routes.test.ts, dove questa rotta
// e' registrata con l'aspettativa opposta alle altre.
const bodySchema = z.object({
  codice: z.string().min(1).max(20),
});

// Un solo motivo per qualunque codice che non porta a un'iscrizione nuova
// per questo studente: `iscrivitiConCodice` appiattisce gia' "codice mai
// esistito" e "codice di una classe archiviata" sullo stesso
// `codice_sconosciuto` (vedi il dominio, task 2) — questa rotta si limita a
// inoltrare quel motivo, senza aggiungere id, nome della classe o
// qualunque altro indizio nel corpo: distinguerli lascerebbe a chiunque
// provi codici a caso il modo di scoprire quali classi esistono davvero.
const STATI: Record<string, number> = {
  codice_sconosciuto: 404,
  gia_iscritto: 409,
};

export async function POST(request: Request) {
  const gate = await requireStudent();
  if (!gate.ok) return gate.response;

  const studentId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:classi-iscrizione:${studentId}`, windowSeconds: 60, max: 10 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const esito = await iscrivitiConCodice(studentId, parsed.data.codice);
  if (!esito.ok) return NextResponse.json({ error: esito.motivo }, { status: STATI[esito.motivo] ?? 400 });
  return NextResponse.json({ classe: esito.classe }, { status: 201 });
}
