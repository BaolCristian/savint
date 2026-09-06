import { randomUUID } from "crypto";
import seedrandom from "seedrandom";
import { prisma } from "@/lib/db/client";

type MotivoAssegna =
  | "batteria_non_trovata"
  | "classe_non_trovata"
  | "non_insegni_questa_classe"
  | "esercizi_insufficienti";

/** Assegna una batteria a una classe: pesca UNA volta, con un seme nuovo, e
 * fissa il risultato nel Compito. Da quel momento in poi nessuna modifica al
 * contenitore, alle versioni degli esercizi o una nuova assegnazione della
 * stessa batteria può cambiare cosa quella classe ha ricevuto: il seme e le
 * versioni pescate sono già scritte nella riga.
 *
 * Tutti i controlli (batteria, classe, insegnamento, capienza dei
 * contenitori) avvengono PRIMA di qualunque scrittura: un fallimento non
 * lascia nessun Compito a metà. */
export async function assegna(
  batteriaId: string,
  classeId: string,
  assignedById: string,
  opzioni?: { opensAt?: Date; dueAt?: Date },
): Promise<
  | { ok: true; compitoId: string }
  | { ok: false; motivo: MotivoAssegna; dettaglio?: unknown }
> {
  const batteria = await prisma.batteria.findUnique({
    where: { id: batteriaId },
    include: {
      regole: {
        orderBy: { order: "asc" },
        include: { contenitore: { include: { esercizi: true } } },
      },
    },
  });
  if (!batteria) return { ok: false, motivo: "batteria_non_trovata" };

  const classe = await prisma.classe.findUnique({ where: { id: classeId } });
  if (!classe) return { ok: false, motivo: "classe_non_trovata" };

  const insegna = await prisma.classeDocente.findUnique({
    where: { classeId_teacherId: { classeId, teacherId: assignedById } },
  });
  if (!insegna) return { ok: false, motivo: "non_insegni_questa_classe" };

  const drawSeed = randomUUID();
  const rng = seedrandom(drawSeed);
  const drawnVersionIds: string[] = [];
  // Un esercizio già pescato da una regola non può essere ripescato da
  // un'altra regola della stessa batteria: due contenitori possono
  // condividere un esercizio (Task 3), e senza questa esclusione un compito
  // "5 da Equazioni, 3 da Sistemi" potrebbe consegnare meno di 8 esercizi
  // distinti se il sorteggio pesca lo stesso esercizio da entrambi i lati.
  const giaPescati = new Set<string>();

  for (const regola of batteria.regole) {
    const candidati = regola.contenitore.esercizi
      .map((e) => e.esercizioId)
      .filter((esercizioId) => !giaPescati.has(esercizioId))
      .sort();
    if (candidati.length < regola.count) {
      return {
        ok: false,
        motivo: "esercizi_insufficienti",
        dettaglio: {
          contenitore: regola.contenitore.name,
          richiesti: regola.count,
          disponibili: candidati.length,
        },
      };
    }

    // Fisher-Yates seminato: stabile per lo stesso seme, diverso ad ogni
    // nuova assegnazione perché il seme è nuovo ogni volta.
    const mescolati = [...candidati];
    for (let i = mescolati.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [mescolati[i], mescolati[j]] = [mescolati[j]!, mescolati[i]!];
    }

    for (const esercizioId of mescolati.slice(0, regola.count)) {
      giaPescati.add(esercizioId);
      const versione = await prisma.esercizioVersione.findFirst({
        where: { esercizioId },
        orderBy: { version: "desc" },
      });
      if (versione) drawnVersionIds.push(versione.id);
    }
  }

  const compito = await prisma.compito.create({
    data: {
      batteriaId,
      classeId,
      assignedById,
      drawSeed,
      drawnVersionIds,
      opensAt: opzioni?.opensAt,
      dueAt: opzioni?.dueAt,
    },
  });

  return { ok: true, compitoId: compito.id };
}

/** I compiti assegnati a una classe, per la vista del docente. */
export async function compitiDellaClasse(
  classeId: string,
): Promise<{ id: string; batteria: string; dueAt: Date | null; esercizi: number }[]> {
  const righe = await prisma.compito.findMany({
    where: { classeId },
    include: { batteria: true },
    orderBy: { createdAt: "desc" },
  });
  return righe.map((c) => ({
    id: c.id,
    batteria: c.batteria.name,
    dueAt: c.dueAt,
    esercizi: c.drawnVersionIds.length,
  }));
}

/** I compiti che uno studente vede, con i titoli degli esercizi pescati e
 * quanti ne ha completati. Guarda le classi CORRENTI dello studente, non uno
 * snapshot al momento dell'assegnazione: chi entra in classe dopo vede
 * comunque il compito. */
export async function compitiDelloStudente(studentId: string): Promise<
  { id: string; batteria: string; dueAt: Date | null; esercizi: { esercizioId: string; title: string }[]; fatti: number }[]
> {
  const iscrizioni = await prisma.classeStudente.findMany({ where: { studentId }, select: { classeId: true } });
  const classeIds = iscrizioni.map((i) => i.classeId);
  if (classeIds.length === 0) return [];

  const compiti = await prisma.compito.findMany({
    where: { classeId: { in: classeIds } },
    include: { batteria: true },
    orderBy: { createdAt: "desc" },
  });

  const risultati: Awaited<ReturnType<typeof compitiDelloStudente>> = [];
  for (const c of compiti) {
    const versioni = await prisma.esercizioVersione.findMany({
      where: { id: { in: c.drawnVersionIds } },
      include: { esercizio: true },
    });
    const perId = new Map(versioni.map((v) => [v.id, v]));
    const esercizi = c.drawnVersionIds
      .map((vid) => perId.get(vid))
      .filter((v): v is NonNullable<typeof v> => v != null)
      .map((v) => ({ esercizioId: v.esercizioId, title: v.esercizio.title }));

    const fatti = await prisma.tentativo.count({
      where: { studentId, compitoId: c.id, status: "COMPLETED" },
    });

    risultati.push({ id: c.id, batteria: c.batteria.name, dueAt: c.dueAt, esercizi, fatti });
  }
  return risultati;
}

/** Le consegne di un compito: parte dagli iscritti ATTUALI alla classe, non
 * dai tentativi, così chi non ha ancora iniziato compare comunque con zero.
 * Chi è uscito dalla classe sparisce da qui, ma i suoi tentativi restano nel
 * database (il compito li referenzia comunque). */
export async function consegneDelCompito(
  compitoId: string,
): Promise<{ studentId: string; nome: string; fatti: number; totali: number; punteggio: number; massimo: number }[]> {
  const compito = await prisma.compito.findUnique({ where: { id: compitoId } });
  if (!compito) return [];

  const iscritti = await prisma.classeStudente.findMany({
    where: { classeId: compito.classeId },
    include: { studente: true },
    orderBy: { studente: { name: "asc" } },
  });

  const totali = compito.drawnVersionIds.length;

  const righe = [];
  for (const i of iscritti) {
    const tentativi = await prisma.tentativo.findMany({ where: { studentId: i.studentId, compitoId } });
    const fatti = tentativi.filter((t) => t.status === "COMPLETED").length;
    const punteggio = tentativi.reduce((s, t) => s + t.score, 0);
    const massimo = tentativi.reduce((s, t) => s + t.maxScore, 0);
    righe.push({
      studentId: i.studentId,
      nome: i.studente.name ?? i.studente.email,
      fatti,
      totali,
      punteggio,
      massimo,
    });
  }
  return righe;
}
