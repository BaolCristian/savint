import { prisma } from "@/lib/db/client";
import { ruoliEsercizi } from "./accesso";

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
 * rompe anche se nel frattempo l'esercizio è tornato privato. Iscrizione e
 * ritiro si leggono come in `compitiDelloStudente`.
 */
export async function esercizioApribileDaStudente(studentId: string, esercizioId: string): Promise<boolean> {
  if ((await ruoliEsercizi("scuola")).has(esercizioId)) return true;

  const versioni = await prisma.esercizioVersione.findMany({ where: { esercizioId }, select: { id: true } });
  if (versioni.length === 0) return false;

  const iscrizioni = await prisma.classeStudente.findMany({ where: { studentId }, select: { classeId: true } });
  if (iscrizioni.length === 0) return false;

  const compito = await prisma.compito.findFirst({
    where: {
      classeId: { in: iscrizioni.map((i) => i.classeId) },
      ritiratoAt: null,
      drawnVersionIds: { hasSome: versioni.map((v) => v.id) },
    },
    select: { id: true },
  });
  return compito != null;
}
