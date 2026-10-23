import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { classiDelDocente } from "@/lib/esercizi/classi";
import { riepilogoEstrazione } from "@/lib/esercizi/estrazione";
import { blocchiConAnno, blocchiSchema, semeSchema } from "@/lib/esercizi/blocchi-corpo";

const bodySchema = z.object({
  classeId: z.string().min(1),
  blocchi: blocchiSchema,
  seme: semeSchema,
});

/** Il riepilogo della zona 3 del "Nuovo compito" (Task 3): i numeri per
 * blocco e, se tutti bastano, l'estrazione con quel seme. Nessuna
 * scrittura: la pagina lo chiede a ogni modifica dei blocchi e per "Estrai
 * di nuovo" (seme nuovo), e "Assegna" rifà poi la stessa estrazione con lo
 * stesso seme (`assegnaCompito`).
 *
 * La classe deve essere del docente (`classiDelDocente`, che esclude le
 * archiviate): altrimenti 404, non 403, come le altre rotte dei compiti — un
 * 403 confermerebbe che quella classe esiste. Serve la classe per l'anno dei
 * blocchi argomento (`blocchiConAnno`, come `compiti/diretto`).
 *
 * Tetto più largo delle rotte che scrivono: la pagina chiama questa a ogni
 * modifica, e un docente che compone tre blocchi ne fa decine al minuto. */
export async function POST(request: Request) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const teacherId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:compiti-estrai:${teacherId}`, windowSeconds: 60, max: 120 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const classe = (await classiDelDocente(teacherId)).find((c) => c.id === parsed.data.classeId);
  if (!classe) return NextResponse.json({ error: "non_insegni_questa_classe" }, { status: 404 });

  const blocchi = blocchiConAnno(parsed.data.blocchi, classe.yearLevel);
  if (!blocchi) return NextResponse.json({ error: "classe_senza_anno" }, { status: 422 });

  // Sempre come docente: `riepilogoEstrazione` passa da `comeDocente`.
  const riepilogo = await riepilogoEstrazione(blocchi, { id: teacherId, admin: false }, parsed.data.seme);
  return NextResponse.json(riepilogo);
}
