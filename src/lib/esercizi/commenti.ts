import { prisma } from "@/lib/db/client";
import { puo, ruoloEsercizio, type Utente } from "./accesso";

/**
 * I commenti sugli esercizi (spec "Commenti"): note fra colleghi del tipo
 * "mi sembra ci sia un errore nella parte b". Riguardano l'esercizio, non
 * una versione; testo semplice; risposte a un solo livello.
 *
 * Chi non vede l'esercizio riceve sempre `non_trovato`, anche per l'id di un
 * commento che gli appartiene: mai un indizio che esista.
 */

type Base = { id: string; autoreNome: string; testo: string; createdAt: Date; mio: boolean };
export type Commento = Base & { risolto: boolean; risposte: Base[] };

export type MotivoCommento = "non_trovato" | "non_permesso" | "testo_non_valido";
export type EsitoCommento = { ok: true } | { ok: false; motivo: MotivoCommento };

export const MAX_TESTO_COMMENTO = 2000;

const no = (motivo: MotivoCommento) => ({ ok: false as const, motivo });

const autore = { select: { name: true, email: true } } as const;
const nomeDi = (a: { name: string | null; email: string | null }) => a.name ?? a.email ?? "";

/** I commenti di un esercizio, i più recenti prima; le risposte sotto
 * ciascuno, in ordine di arrivo. null se `chi` non vede l'esercizio. */
export async function elencoCommenti(esercizioId: string, chi: Utente): Promise<Commento[] | null> {
  if (!puo(await ruoloEsercizio(chi, esercizioId), "vedere")) return null;
  const righe = await prisma.commentoEsercizio.findMany({
    where: { esercizioId, parentId: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      autore,
      risposte: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { autore } },
    },
  });
  const base = (r: { id: string; autoreId: string; testo: string; createdAt: Date; autore: { name: string | null; email: string | null } }): Base => ({
    id: r.id,
    autoreNome: nomeDi(r.autore),
    testo: r.testo,
    createdAt: r.createdAt,
    mio: r.autoreId === chi.id,
  });
  return righe.map((r) => ({ ...base(r), risolto: r.risoltoAt !== null, risposte: r.risposte.map(base) }));
}

/** Scrive un commento (o, con `parentId`, una risposta a un commento di
 * primo livello dello stesso esercizio). Serve il ruolo `commentare`. */
export async function scriviCommento(
  esercizioId: string,
  chi: Utente,
  testo: string,
  parentId?: string,
): Promise<{ ok: true; id: string } | { ok: false; motivo: MotivoCommento }> {
  const ruolo = await ruoloEsercizio(chi, esercizioId);
  if (!ruolo) return no("non_trovato");
  if (!puo(ruolo, "commentare")) return no("non_permesso");
  const pulito = testo.trim();
  if (pulito.length < 1 || pulito.length > MAX_TESTO_COMMENTO) return no("testo_non_valido");
  if (parentId) {
    const padre = await prisma.commentoEsercizio.findUnique({ where: { id: parentId }, select: { esercizioId: true, parentId: true } });
    // Un commento di un altro esercizio, per questo, non esiste.
    if (!padre || padre.esercizioId !== esercizioId) return no("non_trovato");
    // Le risposte stanno a un solo livello.
    if (padre.parentId !== null) return no("non_permesso");
  }
  const creato = await prisma.commentoEsercizio.create({
    data: { esercizioId, autoreId: chi.id, testo: pulito, parentId: parentId ?? null },
    select: { id: true },
  });
  return { ok: true, id: creato.id };
}

/** Il commento e il ruolo di `chi` sul suo esercizio; `non_trovato` se il
 * commento non c'è o l'esercizio non si vede. */
async function caricaConRuolo(id: string, chi: Utente) {
  const commento = await prisma.commentoEsercizio.findUnique({
    where: { id },
    select: { esercizioId: true, autoreId: true, parentId: true },
  });
  if (!commento) return null;
  const ruolo = await ruoloEsercizio(chi, commento.esercizioId);
  if (!ruolo) return null;
  return { commento, ruolo };
}

/** Segna come risolto (o riapre) un commento di primo livello. Serve
 * `risolvere` (EDITOR o più). */
export async function risolviCommento(id: string, chi: Utente, risolto: boolean): Promise<EsitoCommento> {
  const trovato = await caricaConRuolo(id, chi);
  if (!trovato) return no("non_trovato");
  if (!puo(trovato.ruolo, "risolvere") || trovato.commento.parentId !== null) return no("non_permesso");
  await prisma.commentoEsercizio.update({
    where: { id },
    data: risolto ? { risoltoAt: new Date(), risoltoDaId: chi.id } : { risoltoAt: null, risoltoDaId: null },
  });
  return { ok: true };
}

/** Elimina un commento: lo può fare il suo autore, o chi può condividere
 * l'esercizio (proprietario, ADMIN). Con un commento di primo livello se ne
 * vanno anche le risposte (cascade nello schema). */
export async function eliminaCommento(id: string, chi: Utente): Promise<EsitoCommento> {
  const trovato = await caricaConRuolo(id, chi);
  if (!trovato) return no("non_trovato");
  if (trovato.commento.autoreId !== chi.id && !puo(trovato.ruolo, "condividere")) return no("non_permesso");
  await prisma.commentoEsercizio.delete({ where: { id } });
  return { ok: true };
}

/** Per il catalogo: quanti commenti di primo livello non risolti ha ciascuno
 * degli esercizi dati, con una sola query raggruppata. Gli assenti valgono 0. */
export async function commentiApertiPer(esercizioIds: string[]): Promise<Map<string, number>> {
  if (esercizioIds.length === 0) return new Map();
  const gruppi = await prisma.commentoEsercizio.groupBy({
    by: ["esercizioId"],
    where: { esercizioId: { in: esercizioIds }, parentId: null, risoltoAt: null },
    _count: { _all: true },
  });
  return new Map(gruppi.map((g) => [g.esercizioId, g._count._all]));
}
