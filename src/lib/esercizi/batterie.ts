import { prisma } from "@/lib/db/client";

export interface RegolaInput {
  contenitoreId: string;
  count: number;
}

/** Crea una batteria con le sue regole, in una transazione: o vanno dentro
 * tutte, o niente. L'ordine delle regole (per la pesca, più avanti) è
 * l'ordine in cui compaiono nell'array. */
export async function creaBatteria(
  createdById: string,
  name: string,
  regole: RegolaInput[],
  description?: string,
): Promise<{ id: string }> {
  const id = await prisma.$transaction(async (tx) => {
    const b = await tx.batteria.create({ data: { createdById, name, description } });
    if (regole.length > 0) {
      await tx.batteriaRegola.createMany({
        data: regole.map((r, i) => ({
          batteriaId: b.id,
          contenitoreId: r.contenitoreId,
          order: i,
          count: r.count,
        })),
      });
    }
    return b.id;
  });
  return { id };
}

/** Tutte le batterie, con le loro regole (nome del contenitore + quanti) e il
 * numero di compiti a cui sono già state assegnate. */
export async function elencoBatterie(): Promise<
  { id: string; name: string; regole: { contenitore: string; count: number }[]; compiti: number }[]
> {
  const righe = await prisma.batteria.findMany({
    orderBy: { name: "asc" },
    include: {
      regole: { orderBy: { order: "asc" }, include: { contenitore: true } },
      _count: { select: { compiti: true } },
    },
  });
  return righe.map((b) => ({
    id: b.id,
    name: b.name,
    regole: b.regole.map((r) => ({ contenitore: r.contenitore.name, count: r.count })),
    compiti: b._count.compiti,
  }));
}

/** Confronta, per ogni regola della batteria, quanti esercizi chiede contro
 * quanti il suo contenitore ne ha davvero. Non guarda i compiti già
 * assegnati: è un controllo "questa batteria è ancora assegnabile?", non uno
 * storico. */
export async function verificaBatteria(
  batteriaId: string,
): Promise<{ ok: true } | { ok: false; mancanti: { contenitore: string; richiesti: number; disponibili: number }[] }> {
  const batteria = await prisma.batteria.findUniqueOrThrow({
    where: { id: batteriaId },
    include: {
      regole: {
        orderBy: { order: "asc" },
        include: { contenitore: { include: { _count: { select: { esercizi: true } } } } },
      },
    },
  });

  const mancanti = batteria.regole
    .filter((r) => r.contenitore._count.esercizi < r.count)
    .map((r) => ({
      contenitore: r.contenitore.name,
      richiesti: r.count,
      disponibili: r.contenitore._count.esercizi,
    }));

  if (mancanti.length > 0) return { ok: false, mancanti };
  return { ok: true };
}
