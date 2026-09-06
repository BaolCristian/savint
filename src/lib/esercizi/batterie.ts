import { prisma } from "@/lib/db/client";

export interface RegolaInput {
  contenitoreId: string;
  count: number;
}

/** Gli id, fra quelli passati, che hanno almeno una `EsercizioVersione`: un
 * esercizio senza versione non può mai essere consegnato a uno studente,
 * quindi non conta come "disponibile" — né per `verificaBatteria` né per la
 * pesca vera in `assegna` (compiti.ts). Una query sola per tutti gli
 * esercizi coinvolti, non una per regola. */
export async function idsConVersione(esercizioIds: string[]): Promise<Set<string>> {
  if (esercizioIds.length === 0) return new Set();
  const righe = await prisma.esercizioVersione.findMany({
    where: { esercizioId: { in: esercizioIds } },
    select: { esercizioId: true },
    distinct: ["esercizioId"],
  });
  return new Set(righe.map((r) => r.esercizioId));
}

/** Il bacino di candidati di una regola dopo aver tolto gli esercizi già
 * "presi" da regole precedenti della stessa batteria e quelli senza
 * versione risolvibile. Usata sia da `verificaBatteria` qui sotto (che non
 * pesca, misura solo la capienza) sia da `assegna` in compiti.ts (che poi
 * mescola quello che risulta e ne prende `count`): la stessa esclusione,
 * non due riscritture che potrebbero divergere silenziosamente. */
export function candidatiDisponibili(
  esercizioIds: string[],
  presi: ReadonlySet<string>,
  conVersione: ReadonlySet<string>,
): string[] {
  return esercizioIds.filter((id) => conVersione.has(id) && !presi.has(id)).sort();
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
 * quanti il suo contenitore può davvero fornire — applicando la STESSA
 * esclusione incrociata fra regole e lo stesso filtro di disponibilità di
 * versione che `assegna` (compiti.ts) applica quando pesca sul serio: un
 * esercizio già "preso" da una regola precedente, o senza nessuna
 * `EsercizioVersione`, non conta come disponibile per nessuna regola.
 *
 * Non c'è un sorteggio vero qui (nessun seme, nessuna assegnazione): quando
 * una regola risulta capiente, gli esercizi "presi" per calcolare cosa
 * resta alla regola successiva sono scelti per id (ordine stabile), non a
 * caso. Nel caso comune — contenitori disgiunti, o capienza abbondante — il
 * verdetto coincide sempre con quello di un'assegnazione vera; con più
 * regole che condividono esercizi E capienza risicata su entrambe, un
 * sorteggio realmente casuale potrebbe consumare la sovrapposizione in modo
 * leggermente diverso da questa stima. Resta comunque la stessa esclusione
 * strutturale di `assegna`, non un conteggio indipendente che può
 * scoprire "abbastanza" quando la pesca vera scoprirebbe il contrario.
 *
 * Non guarda i compiti già assegnati: è un controllo "questa batteria è
 * ancora assegnabile?", non uno storico. */
export async function verificaBatteria(
  batteriaId: string,
): Promise<{ ok: true } | { ok: false; mancanti: { contenitore: string; richiesti: number; disponibili: number }[] }> {
  const batteria = await prisma.batteria.findUniqueOrThrow({
    where: { id: batteriaId },
    include: {
      regole: {
        orderBy: { order: "asc" },
        include: { contenitore: { include: { esercizi: true } } },
      },
    },
  });

  const tuttiGliId = [...new Set(batteria.regole.flatMap((r) => r.contenitore.esercizi.map((e) => e.esercizioId)))];
  const conVersione = await idsConVersione(tuttiGliId);

  const presi = new Set<string>();
  const mancanti: { contenitore: string; richiesti: number; disponibili: number }[] = [];
  for (const regola of batteria.regole) {
    const candidati = candidatiDisponibili(
      regola.contenitore.esercizi.map((e) => e.esercizioId),
      presi,
      conVersione,
    );
    if (candidati.length < regola.count) {
      mancanti.push({ contenitore: regola.contenitore.name, richiesti: regola.count, disponibili: candidati.length });
      continue;
    }
    for (const id of candidati.slice(0, regola.count)) presi.add(id);
  }

  if (mancanti.length > 0) return { ok: false, mancanti };
  return { ok: true };
}

/** Cancella una batteria libera. Se ha già dei `Compito` assegnati, rifiuta
 * prima di tentare — stessa forma di `eliminaContenitore` in
 * contenitori.ts: il vincolo `onDelete: Restrict` sullo schema resta la
 * rete di sicurezza, questo controllo è ciò che dà un messaggio al docente
 * invece di un errore del database. */
export async function eliminaBatteria(id: string): Promise<{ ok: true } | { ok: false; motivo: "in_uso" }> {
  const usi = await prisma.compito.count({ where: { batteriaId: id } });
  if (usi > 0) return { ok: false, motivo: "in_uso" };
  await prisma.batteria.delete({ where: { id } });
  return { ok: true };
}
