import { prisma } from "@/lib/db/client";
import { ruoliEsercizi } from "./accesso";
import { estrazioniDegliStudenti } from "./versioni-compito";

/**
 * Pratica libera degli studenti (spec "Pratica libera degli studenti").
 * L'elenco libero mostra solo ciò che "tutta la scuola" vede per una strada
 * qualunque (diretta, argomento, raccolta con la regola delle raccolte): un
 * esercizio privato o condiviso con pochi è lavoro in corso, non va agli
 * studenti.
 */
export async function eserciziPraticaLibera(): Promise<Set<string>> {
  return new Set((await ruoliEsercizi("scuola")).keys());
}

/**
 * Vero se lo studente può aprire l'esercizio dal link libero (senza
 * `compitoId`): perché la scuola lo vede, oppure perché l'ha avuto in un
 * compito non ritirato di una sua classe — così "esercitati di nuovo" non si
 * rompe anche se nel frattempo l'esercizio è tornato privato. Iscrizione,
 * ritiro e apertura si leggono come in `compitiDelloStudente` e
 * `compitoApribile`: un compito non ancora aperto non svela i suoi esercizi.
 * "L'ha avuto" vuol dire nelle SUE versioni: `drawnVersionIds` nel modo
 * CLASSE, la sua estrazione nel modo STUDENTE — l'esercizio pescato a un
 * compagno non gli apre niente.
 */
export async function esercizioApribileDaStudente(studentId: string, esercizioId: string): Promise<boolean> {
  if ((await ruoliEsercizi("scuola")).has(esercizioId)) return true;

  const versioni = await prisma.esercizioVersione.findMany({ where: { esercizioId }, select: { id: true } });
  if (versioni.length === 0) return false;

  const iscrizioni = await prisma.classeStudente.findMany({ where: { studentId }, select: { classeId: true } });
  if (iscrizioni.length === 0) return false;

  const dove = {
    classeId: { in: iscrizioni.map((i) => i.classeId) },
    ritiratoAt: null,
    OR: [{ opensAt: null }, { opensAt: { lte: new Date() } }],
  };
  const ids = versioni.map((v) => v.id);
  const diClasse = await prisma.compito.findFirst({
    where: { ...dove, modo: "CLASSE", drawnVersionIds: { hasSome: ids } },
    select: { id: true },
  });
  if (diClasse) return true;

  const perStudente = await prisma.compito.findMany({
    where: { ...dove, modo: "STUDENTE" },
    select: { id: true, modo: true, drawSeed: true, bacini: true, drawnVersionIds: true },
  });
  if (perStudente.length === 0) return false;
  const estrazioni = await estrazioniDegliStudenti(perStudente, [studentId]);
  return [...estrazioni.values()].some((m) => (m.get(studentId) ?? []).some((v) => ids.includes(v)));
}
