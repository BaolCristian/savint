import { z } from "zod";
import { prisma } from "@/lib/db/client";
import type { Utente } from "./accesso";

/**
 * Le misure PDP di uno studente in una classe (modalità verifica). Solo
 * misure compensative, mai diagnosi o note: nessun campo di testo libero,
 * qui come nello schema. Le leggono e le cambiano solo i docenti della
 * classe e gli ADMIN; non arrivano mai a uno studente.
 */

export type MisurePdpValori = { tempoExtraPct: number; menoEsercizi: boolean; calcolatrice: boolean; formulario: boolean };

export const MISURE_VUOTE: MisurePdpValori = { tempoExtraPct: 0, menoEsercizi: false, calcolatrice: false, formulario: false };

export const misurePdpSchema = z.object({
  tempoExtraPct: z.number().int().min(0).max(100),
  menoEsercizi: z.boolean(),
  calcolatrice: z.boolean(),
  formulario: z.boolean(),
});

/** Almeno una misura attiva: è ciò che fa comparire il segno «PDP». */
export function haMisure(m: MisurePdpValori): boolean {
  return m.tempoExtraPct > 0 || m.menoEsercizi || m.calcolatrice || m.formulario;
}

const SELEZIONE = { tempoExtraPct: true, menoEsercizi: true, calcolatrice: true, formulario: true } as const;

/** Chi può vedere le misure di questa classe: chi la insegna, oppure un
 * ADMIN. Una classe che non esiste e una classe non propria rispondono
 * allo stesso modo (false): la rotta ne fa un 404, mai un 403. */
async function puoGestire(classeId: string, chi: Utente): Promise<boolean> {
  const classe = await prisma.classe.findUnique({ where: { id: classeId }, select: { id: true } });
  if (!classe) return false;
  if (chi.admin) return true;
  const insegna = await prisma.classeDocente.findUnique({
    where: { classeId_teacherId: { classeId, teacherId: chi.id } },
  });
  return !!insegna;
}

/** Le misure degli iscritti della classe che ne hanno, per studentId.
 * La riga di chi non è (più) iscritto resta nel database — una
 * disiscrizione di allineaClassi può essere temporanea — ma non si mostra. */
export async function misureDellaClasse(classeId: string, chi: Utente): Promise<Map<string, MisurePdpValori> | null> {
  if (!(await puoGestire(classeId, chi))) return null;
  const righe = await prisma.misurePdp.findMany({
    where: { classeId, studente: { classi: { some: { classeId } } } },
    select: { studentId: true, ...SELEZIONE },
  });
  return new Map(righe.map(({ studentId, ...misure }) => [studentId, misure]));
}

/** Salva le misure di un iscritto. Misure tutte vuote cancellano la riga:
 * di un PDP tolto non resta traccia. */
export async function salvaMisurePdp(
  classeId: string,
  studentId: string,
  chi: Utente,
  misure: MisurePdpValori,
): Promise<{ ok: true } | { ok: false; motivo: "non_trovata" | "non_iscritto" }> {
  if (!(await puoGestire(classeId, chi))) return { ok: false, motivo: "non_trovata" };

  const iscritto = await prisma.classeStudente.findUnique({
    where: { classeId_studentId: { classeId, studentId } },
  });
  if (!iscritto) return { ok: false, motivo: "non_iscritto" };

  if (!haMisure(misure)) {
    await prisma.misurePdp.deleteMany({ where: { classeId, studentId } });
    return { ok: true };
  }

  // Solo i quattro campi noti: nessun altro valore del chiamante finisce in riga.
  const dati = {
    tempoExtraPct: misure.tempoExtraPct,
    menoEsercizi: misure.menoEsercizi,
    calcolatrice: misure.calcolatrice,
    formulario: misure.formulario,
  };
  await prisma.misurePdp.upsert({
    where: { classeId_studentId: { classeId, studentId } },
    create: { classeId, studentId, ...dati },
    update: dati,
  });
  return { ok: true };
}
