import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { classiDelDocente } from "@/lib/esercizi/classi";
import { assegnaCompito } from "@/lib/esercizi/compiti";
import { blocchiConAnno, blocchiSchema, semeSchema, TOTALE_MAX } from "@/lib/esercizi/blocchi-corpo";

// Nuovo compito, Task 3: il corpo è quello della pagina "Nuovo compito" —
// i blocchi, il modo, il seme dell'estrazione vista. Il vecchio corpo
// `{ batteriaId, classeId }` (assegnare una batteria composta prima) non è
// più accettato: risponde 400 finché il vecchio modulo, che lo manda
// ancora, non sparisce con il Task 7.
const bodySchema = z.object({
  classeId: z.string().min(1),
  blocchi: blocchiSchema,
  modo: z.enum(["CLASSE", "STUDENTE"]),
  seme: semeSchema,
  versioniViste: z.array(z.string().min(1).max(100)).max(TOTALE_MAX).optional(),
  opensAt: z.coerce.date().optional(),
  dueAt: z.coerce.date().optional(),
  salvaModello: z.object({ nome: z.string().trim().min(1).max(200) }).optional(),
  modelloId: z.string().min(1).max(100).optional(),
  // Modalità verifica: senza `tipo` è un compito. Qui solo la forma; i
  // limiti (durata, avvio nel futuro, formulario esistente) li controlla
  // `assegnaCompito`, che risponde coi suoi motivi.
  tipo: z.enum(["COMPITO", "VERIFICA"]).optional(),
  verifica: z
    .object({
      durataMinuti: z.number().int(),
      avvioProgrammatoAt: z.coerce.date().optional(),
      calcolatrice: z.enum(["NESSUNO", "SOLO_PDP", "TUTTI"]),
      formulario: z.enum(["NESSUNO", "SOLO_PDP", "TUTTI"]),
      formularioFile: z.string().min(1).max(100).optional(),
    })
    .optional(),
});

// I motivi di `assegnaCompito` portano un significato che il docente deve
// vedere: `esercizi_insufficienti` ed `estrazione_cambiata` portano il
// riepilogo nuovo (numeri per blocco, nuova estrazione) che la pagina
// mostra al posto del suo — appiattirli su un messaggio generico le
// toglierebbe ciò che serve per rimediare. 404 e non 403 per classe e
// modello, come le altre rotte dei compiti: un 403 confermerebbe che
// esistono a chi non ha motivo di saperlo.
const STATI: Record<string, number> = {
  classe_non_trovata: 404,
  non_insegni_questa_classe: 404,
  modello_non_trovato: 404,
  esercizi_insufficienti: 409,
  estrazione_cambiata: 409,
  date_non_valide: 400,
  blocchi_non_validi: 400,
  verifica_non_valida: 400,
  pdp_senza_esercizi: 400,
  formulario_non_trovato: 400,
};

export async function POST(request: Request) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const teacherId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:compiti:${teacherId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const d = parsed.data;

  // La classe serve qui per l'anno dei blocchi argomento (`blocchiConAnno`);
  // `classiDelDocente` è già filtrata per questo
  // docente e senza le archiviate, quindi una classe assente dalla lista o
  // non esiste o non è sua: stessa risposta per entrambe.
  const classe = (await classiDelDocente(teacherId)).find((c) => c.id === d.classeId);
  if (!classe) return NextResponse.json({ error: "non_insegni_questa_classe" }, { status: 404 });

  const blocchi = blocchiConAnno(d.blocchi, classe.yearLevel);
  if (!blocchi) return NextResponse.json({ error: "classe_senza_anno" }, { status: 422 });

  const esito = await assegnaCompito({
    classeId: d.classeId,
    teacherId,
    blocchi,
    modo: d.modo,
    seme: d.seme,
    versioniViste: d.versioniViste,
    opensAt: d.opensAt,
    dueAt: d.dueAt,
    salvaModello: d.salvaModello,
    modelloId: d.modelloId,
    tipo: d.tipo,
    verifica: d.verifica,
  });

  if (!esito.ok) {
    return NextResponse.json(
      {
        error: esito.motivo,
        ...(esito.riepilogo !== undefined ? { riepilogo: esito.riepilogo } : {}),
        ...(esito.dettaglio !== undefined ? { dettaglio: esito.dettaglio } : {}),
      },
      { status: STATI[esito.motivo] ?? 400 },
    );
  }
  return NextResponse.json({ compitoId: esito.compitoId }, { status: 201 });
}
