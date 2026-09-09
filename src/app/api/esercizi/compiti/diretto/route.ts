import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { classiDelDocente } from "@/lib/esercizi/classi";
import { assegnaDiretto } from "@/lib/esercizi/compiti";

// `anno` è facoltativo qui e SOLO qui: è il ripiego per una classe che non
// ne porta uno proprio (vedi il commento sopra la sua risoluzione, sotto).
// Quando la classe ha già un anno, questo campo viene ignorato — non è mai
// il modo con cui un client dichiara l'anno di una classe che ce l'ha.
const bodySchema = z.object({
  classeId: z.string().min(1),
  argomento: z.string().min(1).max(200),
  quanti: z.number().int().positive(),
  difficoltaMax: z.number().int().min(1).max(3).optional(),
  anno: z.number().int().min(1).max(5).optional(),
  opensAt: z.coerce.date().optional(),
  dueAt: z.coerce.date().optional(),
});

// Stessa mappatura di compiti/route.ts (l'assegnazione per raccolta): questa
// rotta finisce nello stesso `EsitoAssegna`, per la stessa via
// (`assegnaDiretto` delega interamente ad `assegna`) — vedi il commento su
// `MotivoAssegna` in compiti.ts. `esercizi_insufficienti` porta un
// `dettaglio` (contenitore — qui l'argomento, richiesti, disponibili) che
// finisce nel corpo qui sotto — appiattirlo su un messaggio generico gli
// farebbe perdere il lavoro che il dominio ha fatto per produrlo.
//
// `classe_non_trovata` e `non_insegni_questa_classe` sono 404, non 403: un
// 403 confermerebbe che quella classe esiste a un docente che non ha
// titolo per saperlo — stessa regola di compiti/route.ts e di
// rigeneraCodice, allineata fra le tre il 2026-09-08.
//
// `classe_senza_anno` non arriva MAI da `assegnaDiretto`: è un rifiuto di
// questa rotta, prima ancora di entrare nel dominio (vedi sotto). 422: il
// corpo è ben formato, ma la classe indicata non porta il dato che questa
// operazione richiede.
const STATI: Record<string, number> = {
  batteria_non_trovata: 404,
  classe_non_trovata: 404,
  non_insegni_questa_classe: 404,
  esercizi_insufficienti: 409,
  scadenza_prima_apertura: 400,
  scadenza_nel_passato: 400,
};

export async function POST(request: Request) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const teacherId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:compiti-diretto:${teacherId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  // `FiltroDiretto.anno` non è mai facoltativo (compiti.ts) — si pesca per
  // anno, mescolare esercizi di anni diversi sarebbe sbagliato — ma la SUA
  // FONTE è "la classe, o quanto ha detto il docente" (Fix round 1):
  // `classe.yearLevel` se la classe ce l'ha, altrimenti `parsed.data.anno`.
  // Quando la classe ha già un anno quello del corpo non viene mai usato:
  // un client non può dichiarare un anno diverso da quello vero di una
  // classe che ce l'ha già. `classiDelDocente` è già filtrata per questo
  // docente: se `classeId` non compare nella lista, o la classe non esiste
  // o non è sua, e le due cose meritano la stessa risposta di `assegna`
  // per lo stesso identico motivo.
  const classi = await classiDelDocente(teacherId);
  const classe = classi.find((c) => c.id === parsed.data.classeId);
  if (!classe) return NextResponse.json({ error: "non_insegni_questa_classe" }, { status: 404 });
  const anno = classe.yearLevel ?? parsed.data.anno;
  // Una classe creata a mano senza anno (creaClasse ammette `anno: null`),
  // o sincronizzata da un gruppo Google il cui nome non porta un anno
  // riconoscibile (yearLevelFromName in resolve-role.ts), non ha un `anno`
  // proprio: senza un anno nel corpo a fare da ripiego, l'assegnazione
  // diretta non ha su cosa filtrare. Task 5 (il modulo, non ancora
  // costruito) chiederà l'anno nel form solo quando la classe non lo
  // porta — qui il corpo può già mandarlo comunque.
  if (anno == null) return NextResponse.json({ error: "classe_senza_anno" }, { status: 422 });

  const esito = await assegnaDiretto({
    classeId: parsed.data.classeId,
    teacherId,
    filtro: {
      anno,
      argomento: parsed.data.argomento,
      difficoltaMax: parsed.data.difficoltaMax,
    },
    quanti: parsed.data.quanti,
    opensAt: parsed.data.opensAt,
    dueAt: parsed.data.dueAt,
  });

  if (!esito.ok) {
    return NextResponse.json(
      { error: esito.motivo, ...(esito.dettaglio !== undefined ? { dettaglio: esito.dettaglio } : {}) },
      { status: STATI[esito.motivo] ?? 400 },
    );
  }
  return NextResponse.json({ compitoId: esito.compitoId }, { status: 201 });
}
