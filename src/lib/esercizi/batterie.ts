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
 * REALMENTE pescati da regole precedenti della stessa batteria (l'insieme
 * `presi` cresce con le scelte vere del sorteggio, non con una stima) e
 * quelli senza versione risolvibile. Usata da `assegna` in compiti.ts, che
 * mescola quello che risulta con un seme vero e ne prende `count`.
 *
 * NON usata da `verificaBatteria` qui sotto: prima di un'assegnazione non
 * esiste un seme, quindi non c'è un "presi" vero da passare — quella
 * funzione stima invece un limite superiore al consumo possibile (vedi il
 * suo commento). Le due condividono `idsConVersione`, non questa. */
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
 * quanti il suo contenitore può davvero fornire — tenendo conto sia del
 * filtro di disponibilità di versione (un esercizio senza
 * `EsercizioVersione` non conta mai) sia della sovrapposizione con le
 * regole precedenti, con una stima **per difetto** (Fix round 2), non con
 * un sorteggio simulato.
 *
 * CONTRATTO, e perché è cambiato: qui non esiste ancora un seme (nessuna
 * assegnazione è avvenuta), quindi non si può sapere con certezza QUALI
 * esercizi condivisi una regola precedente "si prenderebbe" — dipende dal
 * sorteggio vero, che è casuale. Un tentativo di simularlo con una scelta
 * qualunque (per id, ad esempio) è un'esecuzione ARBITRARIA, non la
 * PEGGIORE: un'assegnazione vera sfortunata può consumare più
 * sovrapposizione di quanto quella scelta arbitraria preveda, facendo dire
 * qui "ok" a una batteria che poi fallisce — lo stesso difetto per cui
 * questa funzione è stata corretta nel giro precedente, spostato di un
 * livello. Per questo la stima assume il caso PEGGIORE possibile: per ogni
 * regola, quanti dei suoi esercizi potrebbero essere già stati consumati
 * dalle regole precedenti è limitato da due cose — non più di quanti
 * esercizi condivisi esistono davvero (`overlap`), e non più di quanti le
 * regole precedenti possono complessivamente pescare in tutto
 * (`sum(count precedenti)`); il minore dei due è un limite superiore vero
 * al consumo reale, in QUALUNQUE esecuzione, non una stima plausibile.
 *
 * Il contratto che ne segue: un verdetto positivo (`{ ok: true }`)
 * GARANTISCE che `assegna` (compiti.ts) su questa batteria non fallirà per
 * `esercizi_insufficienti`, qualunque seme venga estratto. Un verdetto
 * negativo NON garantisce il contrario: può capitare che un'assegnazione
 * vera avrebbe comunque avuto successo (la stima è per difetto, non
 * esatta) — in tal caso il rimedio più economico è aggiungere un esercizio
 * al contenitore scarso, non ignorare l'avviso. Errare da questo lato
 * costa un minuto al docente; l'errore opposto — dire "ok" e poi fallire —
 * gli costa un'assegnazione persa dopo che gli era stato detto che andava
 * bene.
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

  // Il bacino di ciascuna regola, filtrato sulla disponibilità di versione
  // (non ancora sulla sovrapposizione con le regole precedenti: quella si
  // stima per difetto qui sotto, regola per regola).
  const bacini = batteria.regole.map(
    (r) => new Set(r.contenitore.esercizi.map((e) => e.esercizioId).filter((id) => conVersione.has(id))),
  );

  const mancanti: { contenitore: string; richiesti: number; disponibili: number }[] = [];
  const precedentiUnione = new Set<string>();
  let sommaContiPrecedenti = 0;
  for (let i = 0; i < batteria.regole.length; i++) {
    const regola = batteria.regole[i]!;
    const bacino = bacini[i]!;

    const overlap = [...bacino].filter((id) => precedentiUnione.has(id)).length;
    const consumoPeggiore = Math.min(overlap, sommaContiPrecedenti);
    const disponibili = bacino.size - consumoPeggiore;

    if (disponibili < regola.count) {
      mancanti.push({ contenitore: regola.contenitore.name, richiesti: regola.count, disponibili });
    }

    for (const id of bacino) precedentiUnione.add(id);
    sommaContiPrecedenti += regola.count;
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
