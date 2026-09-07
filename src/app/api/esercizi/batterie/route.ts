import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { creaBatteria } from "@/lib/esercizi/batterie";

const regolaSchema = z.object({
  contenitoreId: z.string().min(1),
  count: z.number().int().positive(),
});

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  regole: z.array(regolaSchema).min(1).max(50),
});

export async function POST(request: Request) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const teacherId = gate.session.user.id;

  const limite = await checkRateLimit({ key: `esercizi:batterie:${teacherId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const esito = await creaBatteria(teacherId, parsed.data.name, parsed.data.regole, parsed.data.description);
  if (!esito.ok) {
    return NextResponse.json({ error: esito.motivo, dettaglio: esito.dettaglio }, { status: 404 });
  }
  return NextResponse.json({ id: esito.id }, { status: 201 });
}
