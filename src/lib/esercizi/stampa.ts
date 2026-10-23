/**
 * La stampa di un compito come verifica su carta: gli esercizi estratti per
 * il compito, in più versioni con numeri diversi. Ogni versione ha un seme
 * fisso, quindi ristampare dà gli stessi fogli e lo stesso correttore.
 */
import { prisma } from "@/lib/db/client";
import type { ModoEstrazione } from "@prisma/client";
import { haTitoloSulCompito } from "./compiti";
import { versioniDiTuttiGliStudenti } from "./versioni-compito";

/** Quante versioni si possono chiedere, oltre a "una per studente". */
export const MAX_VERSIONI = 6;

export type SceltaVersioni = { tipo: "file"; quante: number } | { tipo: "studenti" };

export type FoglioStampa = {
  /** "A", "B"... oppure il nome dello studente. */
  etichetta: string;
  /** Vero se l'etichetta è il nome di uno studente. */
  nominativo: boolean;
  seme: string;
  /** Solo nel modo STUDENTE: gli esercizi di QUESTO foglio, cioè le
   * versioni del suo studente. Assente = gli esercizi comuni
   * (`DatiStampa.esercizi`). */
  esercizi?: EsercizioStampa[];
};

export type EsercizioStampa = { titolo: string; content: unknown };

export type DatiStampa = {
  compitoId: string;
  titolo: string;
  classe: string;
  /** CLASSE: gli esercizi del compito, uguali su ogni foglio. STUDENTE:
   * vuoto — gli esercizi sono per studente (`eserciziPerStudente`). */
  modo: ModoEstrazione;
  esercizi: EsercizioStampa[];
  /** Solo nel modo STUDENTE: studente → le sue versioni da stampare. */
  eserciziPerStudente: Record<string, EsercizioStampa[]> | null;
  studenti: { id: string; nome: string }[];
};

/** Il valore di `?versioni=`: "studenti" oppure un numero da 1 a MAX_VERSIONI (2 se manca o non vale). */
export function leggiSceltaVersioni(valore: string | undefined): SceltaVersioni {
  if (valore === "studenti") return { tipo: "studenti" };
  const n = Number(valore);
  return { tipo: "file", quante: Number.isInteger(n) && n >= 1 && n <= MAX_VERSIONI ? n : 2 };
}

/** I fogli da stampare. Il seme dipende dal compito e dalla versione (o dallo
 * studente), mai dall'ordine: aggiungere uno studente non cambia i fogli degli altri.
 *
 * Nel modo STUDENTE la scelta "file" non esiste: ogni studente ha esercizi
 * suoi, quindi un foglio A uguale per più studenti non corrisponderebbe al
 * compito di nessuno. Si stampa sempre un foglio per studente, con le sue
 * versioni, qualunque cosa chieda la scelta. */
export function fogliDiStampa(
  dati: Pick<DatiStampa, "compitoId" | "studenti"> & Partial<Pick<DatiStampa, "modo" | "eserciziPerStudente">>,
  scelta: SceltaVersioni,
): FoglioStampa[] {
  if (dati.modo === "STUDENTE") {
    return dati.studenti.map((s) => ({
      etichetta: s.nome,
      nominativo: true,
      seme: `${dati.compitoId}:${s.id}`,
      esercizi: dati.eserciziPerStudente?.[s.id] ?? [],
    }));
  }
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

  const studenti = compito.classe.studenti
    .map(({ studente }) => ({ id: studente.id, nome: studente.name ?? studente.email }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "it"));
  const base = { compitoId: compito.id, titolo: compito.batteria.name, classe: compito.classe.name, studenti };

  // Nel modo STUDENTE le versioni di ogni iscritto (chi non ha ancora
  // un'estrazione la riceve ora): un foglio per studente con le SUE.
  const perStudente = compito.modo === "STUDENTE" ? await versioniDiTuttiGliStudenti(compito.id) : null;
  const ids = perStudente ? [...new Set([...perStudente.values()].flat())] : compito.drawnVersionIds;

  const versioni = await prisma.esercizioVersione.findMany({
    where: { id: { in: ids } },
    include: { esercizio: { select: { title: true } } },
  });
  const perId = new Map(versioni.map((v) => [v.id, v]));
  const daStampare = (pescate: string[]): EsercizioStampa[] => pescate.flatMap((id) => {
    const v = perId.get(id);
    return v ? [{ titolo: v.esercizio.title, content: v.content as unknown }] : [];
  });

  if (perStudente) {
    const eserciziPerStudente = Object.fromEntries(studenti.map((s) => [s.id, daStampare(perStudente.get(s.id) ?? [])]));
    return { ...base, modo: "STUDENTE", esercizi: [], eserciziPerStudente };
  }
  return { ...base, modo: "CLASSE", esercizi: daStampare(compito.drawnVersionIds), eserciziPerStudente: null };
}
