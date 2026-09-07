import { prisma } from "@/lib/db/client";

/** Crea un contenitore vuoto, di proprietà del docente che lo ha creato. */
export async function creaContenitore(
  createdById: string,
  name: string,
  description?: string,
): Promise<{ id: string }> {
  const c = await prisma.contenitore.create({ data: { createdById, name, description } });
  return { id: c.id };
}

/** Tutti i contenitori, col conteggio degli esercizi che contengono.
 *
 * Non espone `createdById`: nessun chiamante lo usa (l'interfaccia lato
 * client non ha nemmeno un campo per riceverlo, Fix round finale, item 6) —
 * un id utente grezzo che non serve a nulla qui non deve viaggiare oltre
 * questa funzione, per non diventare un'abitudine che il prossimo chiamante
 * copia senza chiedersi se serva davvero. */
export async function elencoContenitori(): Promise<
  { id: string; name: string; description: string | null; esercizi: number }[]
> {
  const righe = await prisma.contenitore.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { esercizi: true } } },
  });
  return righe.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    esercizi: r._count.esercizi,
  }));
}

/** Il contenuto di un contenitore, esercizi ordinati per anno e poi titolo.
 * `null` se il contenitore non esiste. */
export async function contenutoContenitore(id: string): Promise<
  | {
      id: string;
      name: string;
      description: string | null;
      esercizi: { id: string; title: string; yearLevel: number; topic: string; difficulty: number }[];
    }
  | null
> {
  const c = await prisma.contenitore.findUnique({
    where: { id },
    include: {
      esercizi: {
        include: { esercizio: true },
      },
    },
  });
  if (!c) return null;

  const esercizi = c.esercizi
    .map((ce) => ce.esercizio)
    .sort((a, b) => a.yearLevel - b.yearLevel || a.title.localeCompare(b.title));

  return {
    id: c.id,
    name: c.name,
    description: c.description,
    esercizi: esercizi.map((e) => ({
      id: e.id,
      title: e.title,
      yearLevel: e.yearLevel,
      topic: e.topic,
      difficulty: e.difficulty,
    })),
  };
}

/** Aggiunge esercizi a un contenitore; chi c'è già non si duplica.
 * Restituisce quante righe sono state davvero create. */
export async function aggiungiEsercizi(contenitoreId: string, esercizioIds: string[]): Promise<number> {
  if (esercizioIds.length === 0) return 0;
  const r = await prisma.contenitoreEsercizio.createMany({
    data: esercizioIds.map((esercizioId) => ({ contenitoreId, esercizioId })),
    skipDuplicates: true,
  });
  return r.count;
}

/** Toglie un esercizio da un contenitore. L'esercizio stesso (il bacino)
 * resta intatto: si toglie solo il legame. */
export async function togliEsercizio(contenitoreId: string, esercizioId: string): Promise<void> {
  await prisma.contenitoreEsercizio.deleteMany({ where: { contenitoreId, esercizioId } });
}

/** Cancella un contenitore libero. Se una BatteriaRegola lo usa, rifiuta
 * prima di tentare — il vincolo onDelete: Restrict è solo la rete di
 * sicurezza, questo controllo è ciò che dà un messaggio al docente invece di
 * un errore del database. */
export async function eliminaContenitore(id: string): Promise<{ ok: true } | { ok: false; motivo: "in_uso" }> {
  const usi = await prisma.batteriaRegola.count({ where: { contenitoreId: id } });
  if (usi > 0) return { ok: false, motivo: "in_uso" };
  await prisma.contenitore.delete({ where: { id } });
  return { ok: true };
}
