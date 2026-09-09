import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { classiDelDocente } from "@/lib/esercizi/classi";
import { argomentiDisponibili } from "@/lib/esercizi/batterie";
import { quantiCorrispondono } from "@/lib/esercizi/compiti";

const querySchema = z.object({
  classeId: z.string().min(1),
  argomento: z.string().min(1).max(200).optional(),
  difficoltaMax: z.coerce.number().int().min(1).max(3).optional(),
});

export async function GET(request: NextRequest) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const teacherId = gate.session.user.id;

  // Questa rotta è letta mentre il docente sceglie — un nuovo argomento,
  // una nuova soglia di difficoltà — quindi chiamata più volte per ogni
  // singola assegnazione, non una sola come una scrittura. Tetto quattro
  // volte quello di una rotta di scrittura di quest'area (30/60s, vedi
  // compiti/route.ts e compiti/diretto/route.ts): un tetto pensato per le
  // scritture bloccherebbe il docente a metà pensiero, proprio mentre
  // guarda "quanti esercizi corrispondono" cambiare filtro dopo filtro.
  const limite = await checkRateLimit({ key: `esercizi:argomenti:${teacherId}`, windowSeconds: 60, max: 120 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });

  // Stessa regola di compiti/diretto/route.ts: l'anno viene sempre dalla
  // classe, mai da un parametro che il chiamante potrebbe dichiarare (non
  // è nemmeno nello schema sopra). La stessa interrogazione fa anche da
  // cancello: solo le classi che questo docente insegna davvero compaiono
  // in `classiDelDocente`, quindi un `classeId` a caso non apre un modo
  // per sfogliare il banco esercizi — resta una rotta da docente come le
  // altre, dietro lo stesso controllo di ruolo E dietro l'appartenenza
  // della classe, non solo dietro requireTeacher().
  const classi = await classiDelDocente(teacherId);
  const classe = classi.find((c) => c.id === parsed.data.classeId);
  if (!classe) return NextResponse.json({ error: "non_insegni_questa_classe" }, { status: 404 });
  if (classe.yearLevel == null) return NextResponse.json({ error: "classe_senza_anno" }, { status: 422 });

  // Con un argomento scelto: il conteggio ESATTO che la pesca vera
  // userebbe (`quantiCorrispondono`, non una stima) — il numero che il
  // modulo di assegnazione mostra sotto i filtri, aggiornato mentre si
  // sceglie (Task 5). Senza argomento: l'elenco fra cui scegliere, già
  // ristretto all'anno di questa classe.
  if (parsed.data.argomento !== undefined) {
    const quanti = await quantiCorrispondono({
      anno: classe.yearLevel,
      argomento: parsed.data.argomento,
      difficoltaMax: parsed.data.difficoltaMax,
    });
    return NextResponse.json({ quanti });
  }

  const elenco = await argomentiDisponibili(classe.yearLevel);
  return NextResponse.json(elenco);
}
