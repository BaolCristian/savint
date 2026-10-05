import { prisma } from "@/lib/db/client";

export type EsercizioPercorsoCompito = {
  esercizioId: string;
  titolo: string;
  indice: number;
  completato: boolean;
};

export type PercorsoCompitoStudente = {
  titolo: string;
  totale: number;
  esercizi: EsercizioPercorsoCompito[];
  prossimo: EsercizioPercorsoCompito | null;
};

/** Legge il percorso congelato di un compito per uno studente attualmente
 * iscritto. I completamenti sono intenzionalmente legati sia al compito sia
 * alle versioni pescate: una vecchia riga con lo stesso `compitoId` non può
 * far saltare un esercizio che non era stato assegnato. */
export async function percorsoCompitoStudente(
  compitoId: string,
  studentId: string,
): Promise<PercorsoCompitoStudente | null> {
  const compito = await prisma.compito.findUnique({
    where: { id: compitoId },
    include: { batteria: { select: { name: true } } },
  });
  // `ritiratoAt`: un compito ritirato dal docente non si apre più, nemmeno
  // con l'id scritto a mano in /studente/compito/[id] (vedi `ritiraCompito`).
  if (
    !compito ||
    compito.ritiratoAt != null ||
    (compito.opensAt && compito.opensAt > new Date()) ||
    compito.drawnVersionIds.length === 0
  ) return null;

  const iscrizione = await prisma.classeStudente.findUnique({
    where: { classeId_studentId: { classeId: compito.classeId, studentId } },
  });
  if (!iscrizione) return null;

  const versioni = await prisma.esercizioVersione.findMany({
    where: { id: { in: compito.drawnVersionIds } },
    include: { esercizio: { select: { title: true } } },
  });
  const versionePerId = new Map(versioni.map((versione) => [versione.id, versione]));
  if (versionePerId.size !== compito.drawnVersionIds.length) return null;

  const completati = await prisma.tentativo.findMany({
    where: {
      studentId,
      compitoId,
      status: "COMPLETED",
      esercizioVersioneId: { in: compito.drawnVersionIds },
    },
    select: { esercizioVersioneId: true },
    distinct: ["esercizioVersioneId"],
  });
  const completatiPerVersione = new Set(completati.map((tentativo) => tentativo.esercizioVersioneId));
  const esercizi = compito.drawnVersionIds.map((versioneId, indice) => {
    const versione = versionePerId.get(versioneId)!;
    return {
      esercizioId: versione.esercizioId,
      titolo: versione.esercizio.title,
      indice: indice + 1,
      completato: completatiPerVersione.has(versioneId),
    };
  });

  return {
    titolo: compito.batteria.name,
    totale: esercizi.length,
    esercizi,
    prossimo: esercizi.find((esercizio) => !esercizio.completato) ?? null,
  };
}
