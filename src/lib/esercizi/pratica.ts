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
 *
 * Una verifica non conta come compito: un suo esercizio si riapre solo dopo
 * che i risultati della SUA prova sono stati pubblicati (`pubblicataAt`),
 * e sempre come tentativo libero (nessun `compitoId`). Prima, avere in
 * mano gli esercizi della verifica in corso o non ancora corretta non deve
 * dare un modo di allenarcisi sopra.
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
    tipo: "COMPITO" as const,
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
  if (perStudente.length > 0) {
    const estrazioni = await estrazioniDegliStudenti(perStudente, [studentId]);
    if ([...estrazioni.values()].some((m) => (m.get(studentId) ?? []).some((v) => ids.includes(v)))) return true;
  }

  return inUnaProvaPubblicata(studentId, ids);
}

/** Vero se una delle versioni `ids` è fra gli esercizi di una prova di
 * verifica dello studente già pubblicata (verifica non ritirata). Gli
 * esercizi della prova sono le `posizioni` della sua estrazione; senza
 * posizioni fissate, l'estrazione intera. */
async function inUnaProvaPubblicata(studentId: string, ids: string[]): Promise<boolean> {
  const prove = await prisma.provaVerifica.findMany({
    where: { studentId, pubblicataAt: { not: null }, compito: { tipo: "VERIFICA", ritiratoAt: null } },
    select: {
      posizioni: true,
      compito: { select: { id: true, modo: true, drawSeed: true, bacini: true, drawnVersionIds: true } },
    },
  });
  if (prove.length === 0) return false;
  const estrazioni = await estrazioniDegliStudenti(prove.map((p) => p.compito), [studentId]);
  return prove.some((p) => {
    const estratte = estrazioni.get(p.compito.id)!.get(studentId) ?? [];
    const dellaProva = p.posizioni.length > 0 ? p.posizioni.map((i) => estratte[i]) : estratte;
    return dellaProva.some((v) => v != null && ids.includes(v));
  });
}
