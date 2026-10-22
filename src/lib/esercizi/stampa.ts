/**
 * La stampa di un compito come verifica su carta: gli esercizi estratti per
 * il compito, in più versioni con numeri diversi. Ogni versione ha un seme
 * fisso, quindi ristampare dà gli stessi fogli e lo stesso correttore.
 */
import { prisma } from "@/lib/db/client";
import { haTitoloSulCompito } from "./compiti";

/** Quante versioni si possono chiedere, oltre a "una per studente". */
export const MAX_VERSIONI = 6;

export type SceltaVersioni = { tipo: "file"; quante: number } | { tipo: "studenti" };

export type FoglioStampa = {
  /** "A", "B"... oppure il nome dello studente. */
  etichetta: string;
  /** Vero se l'etichetta è il nome di uno studente. */
  nominativo: boolean;
  seme: string;
};

export type DatiStampa = {
  compitoId: string;
  titolo: string;
  classe: string;
  esercizi: { titolo: string; content: unknown }[];
  studenti: { id: string; nome: string }[];
};

/** Il valore di `?versioni=`: "studenti" oppure un numero da 1 a MAX_VERSIONI (2 se manca o non vale). */
export function leggiSceltaVersioni(valore: string | undefined): SceltaVersioni {
  if (valore === "studenti") return { tipo: "studenti" };
  const n = Number(valore);
  return { tipo: "file", quante: Number.isInteger(n) && n >= 1 && n <= MAX_VERSIONI ? n : 2 };
}

/** I fogli da stampare. Il seme dipende dal compito e dalla versione (o dallo
 * studente), mai dall'ordine: aggiungere uno studente non cambia i fogli degli altri. */
export function fogliDiStampa(dati: Pick<DatiStampa, "compitoId" | "studenti">, scelta: SceltaVersioni): FoglioStampa[] {
  if (scelta.tipo === "studenti") {
    return dati.studenti.map((s) => ({ etichetta: s.nome, nominativo: true, seme: `${dati.compitoId}:${s.id}` }));
  }
  return Array.from({ length: scelta.quante }, (_, i) => {
    const lettera = String.fromCharCode(65 + i);
    return { etichetta: lettera, nominativo: false, seme: `${dati.compitoId}:${lettera}` };
  });
}

/** Quello che serve alla stampa, oppure null se il compito non c'è, è
 * ritirato o il docente non ha titolo su di esso (stessa regola delle consegne). */
export async function datiStampaCompito(compitoId: string, teacherId: string): Promise<DatiStampa | null> {
  const compito = await prisma.compito.findUnique({
    where: { id: compitoId },
    include: {
      batteria: { select: { name: true } },
      classe: {
        select: {
          name: true,
          studenti: { select: { studente: { select: { id: true, name: true, email: true } } } },
        },
      },
    },
  });
  if (!compito || compito.ritiratoAt != null) return null;
  if (!(await haTitoloSulCompito(compito, teacherId))) return null;

  const versioni = await prisma.esercizioVersione.findMany({
    where: { id: { in: compito.drawnVersionIds } },
    include: { esercizio: { select: { title: true } } },
  });
  const perId = new Map(versioni.map((v) => [v.id, v]));
  const esercizi = compito.drawnVersionIds.flatMap((id) => {
    const v = perId.get(id);
    return v ? [{ titolo: v.esercizio.title, content: v.content as unknown }] : [];
  });

  const studenti = compito.classe.studenti
    .map(({ studente }) => ({ id: studente.id, nome: studente.name ?? studente.email }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "it"));

  return { compitoId: compito.id, titolo: compito.batteria.name, classe: compito.classe.name, esercizi, studenti };
}
