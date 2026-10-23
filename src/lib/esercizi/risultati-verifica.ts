import type { QuestionState } from "@savint/engine";
import { prisma } from "@/lib/db/client";
import {
  posizioniDellaProva,
  puntiCella,
  punteggioProva,
  totalePieno,
  type LayoutBlocco,
  type StatoVerifica,
} from "./verifica-regole";
import {
  sincronizzaVerifica,
  usciteDellaProva,
  verificaDelDocente,
  type EsitoAzione,
  type VerificaLetta,
} from "./verifiche";
import { versioniDelloStudente, versioniDiTuttiGliStudenti } from "./versioni-compito";

/**
 * Correzione, pubblicazione e risultati di una verifica. Il docente vede la
 * tabella studenti × esercizi solo a verifica CHIUSA o PUBBLICATA (durante la
 * prova nessun punteggio, neanche a lui), rivede ogni risposta, corregge i
 * punti a mano e pubblica. Lo studente vede i suoi risultati solo quando la
 * SUA prova è pubblicata: punti, risposte, correzione e svolgimento, mai le
 * uscite registrate né le misure PDP (solo il totale finale sulla scala
 * della verifica completa).
 *
 * I punti di ogni esercizio non si salvano: si calcolano a ogni lettura da
 * punteggio del motore e punti della posizione (`puntiCella`), salvo quelli
 * dati a mano (`Tentativo.puntiManuali`).
 */

export type CellaRisultato = {
  posizione: number;
  tentativoId: string;
  esercizioId: string;
  titolo: string;
  punti: number;
  puntiMax: number;
  manuale: boolean;
};

export type RigaRisultato = {
  studentId: string;
  nome: string;
  stato: "assente" | "in_corso" | "consegnato" | "consegnato_auto";
  recupero: boolean;
  menoEsercizi: boolean;
  /** Una per posizione del layout pieno; null = posizione non assegnata
   * (meno esercizi) o prova senza punti (assente, recupero in corso). */
  celle: (CellaRisultato | null)[];
  ottenuto: number;
  totaleStudente: number;
  finale: number;
  percentuale: number;
  uscite: number;
  secondiFuori: number;
  eventi: { tipo: "USCITA" | "RIENTRO"; motivo: string | null; at: Date; durataMs: number | null }[];
  pubblicata: boolean;
};

export type Risultati = {
  stato: StatoVerifica;
  totalePieno: number;
  colonne: { posizione: number; punti: number }[];
  righe: RigaRisultato[];
};

export type EsercizioRisultato = {
  numero: number;
  esercizioId: string;
  titolo: string;
  punti: number;
  puntiMax: number;
  seed: string;
  /** Il contenuto originale, con lo svolgimento. */
  content: unknown;
  state: QuestionState | null;
};

export type RisultatiStudente = {
  finale: number;
  totalePieno: number;
  percentuale: number;
  esercizi: EsercizioRisultato[];
};

type MotivoRisultati = "non_trovata" | "stato_non_valido";
type MotivoPunti = MotivoRisultati | "valore_non_valido";

const corretta = (v: VerificaLetta) => v.stato === "CHIUSA" || v.stato === "PUBBLICATA";
const arrotonda2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const nomeDi = (s: { name: string | null; email: string }) => s.name ?? s.email;

/** I punti di ogni posizione del layout pieno, in ordine. */
const colonneDi = (layout: LayoutBlocco[]) => posizioniDellaProva(layout, [], false);

/** Un tentativo della prova con quanto serve per una cella. */
type TentativoLetto = {
  id: string;
  esercizioVersioneId: string;
  seed: string;
  state: unknown;
  score: number;
  maxScore: number;
  puntiManuali: number | null;
  versione: { esercizioId: string; content: unknown; esercizio: { title: string } };
};

const INCLUDI_VERSIONE = {
  versione: { select: { esercizioId: true, content: true, esercizio: { select: { title: true } } } },
} as const;

/** Le celle di una prova consegnata, nell'ordine delle sue posizioni: la
 * posizione k ha il tentativo della versione k della sua estrazione. */
function celleDellaProva(
  posizioni: number[],
  versioni: string[],
  tentativi: TentativoLetto[],
  colonne: { posizione: number; punti: number }[],
): { cella: CellaRisultato; tentativo: TentativoLetto; esatti: number }[] {
  const perVersione = new Map(tentativi.map((t) => [t.esercizioVersioneId, t]));
  const risultato = [];
  for (const k of posizioni) {
    const t = perVersione.get(versioni[k] ?? "");
    const puntiMax = colonne[k]?.punti;
    if (!t || puntiMax === undefined) continue;
    const punti = puntiCella({ punti: puntiMax, score: t.score, maxScore: t.maxScore, puntiManuali: t.puntiManuali });
    risultato.push({
      tentativo: t,
      esatti: punti,
      cella: {
        posizione: k,
        tentativoId: t.id,
        esercizioId: t.versione.esercizioId,
        titolo: t.versione.esercizio.title,
        punti: arrotonda2(punti),
        puntiMax,
        manuale: t.puntiManuali !== null,
      },
    });
  }
  return risultato;
}

/** Il punteggio di una prova dalle sue celle: i punti esatti, non quelli
 * arrotondati per la tabella. */
const punteggioDi = (celle: { cella: CellaRisultato; esatti: number }[], pieno: number) =>
  punteggioProva(celle.map((c) => ({ punti: c.cella.puntiMax, score: 0, maxScore: 0, puntiManuali: c.esatti })), pieno);

/** La tabella dei risultati per il docente. Solo a verifica CHIUSA o
 * PUBBLICATA: durante la prova nessun punteggio, neanche a lui. */
export async function risultatiVerifica(
  compitoId: string,
  teacherId: string,
  ora: Date = new Date(),
): Promise<{ ok: true; risultati: Risultati } | { ok: false; motivo: MotivoRisultati }> {
  const v = await verificaDelDocente(compitoId, teacherId, ora);
  if (!v) return { ok: false, motivo: "non_trovata" };
  if (!corretta(v)) return { ok: false, motivo: "stato_non_valido" };

  const colonne = colonneDi(v.layout);
  const pieno = totalePieno(v.layout);
  const iscritti = await prisma.classeStudente.findMany({
    where: { classeId: v.classeId },
    include: { studente: { select: { name: true, email: true } } },
    orderBy: { studente: { name: "asc" } },
  });
  const prove = await prisma.provaVerifica.findMany({
    where: { compitoId },
    include: {
      eventi: { select: { tipo: true, motivo: true, at: true, durataMs: true }, orderBy: { at: "asc" } },
      tentativi: { include: INCLUDI_VERSIONE },
    },
  });
  const perStudente = new Map(prove.map((p) => [p.studentId, p]));
  const versioni = await versioniDiTuttiGliStudenti(compitoId);

  const righe: RigaRisultato[] = iscritti.map((i) => {
    const p = perStudente.get(i.studentId);
    const consegnata = p?.consegnataAt != null;
    const aperta = !!p && !consegnata && (p.entrataAt != null || p.recupero);
    const stato: RigaRisultato["stato"] = consegnata
      ? (p!.consegnaAutomatica ? "consegnato_auto" : "consegnato")
      : aperta ? "in_corso" : "assente";

    const dellaProva = consegnata ? celleDellaProva(p!.posizioni, versioni.get(i.studentId) ?? [], p!.tentativi, colonne) : [];
    const celle: (CellaRisultato | null)[] = colonne.map(() => null);
    for (const { cella } of dellaProva) celle[cella.posizione] = cella;
    const punteggio = punteggioDi(dellaProva, pieno);
    const eventi = p?.eventi ?? [];
    return {
      studentId: i.studentId,
      nome: nomeDi(i.studente),
      stato,
      recupero: p?.recupero ?? false,
      menoEsercizi: p?.menoEsercizi ?? false,
      celle,
      ...punteggio,
      ...usciteDellaProva(eventi, p?.consegnataAt ?? null, ora),
      eventi: eventi.map((ev) => ({ tipo: ev.tipo, motivo: ev.motivo, at: ev.at, durataMs: ev.durataMs })),
      pubblicata: p?.pubblicataAt != null,
    };
  });

  return { ok: true, risultati: { stato: v.stato, totalePieno: pieno, colonne, righe } };
}

/** Un tentativo di una prova consegnata di questa verifica, con la sua
 * cella. Null se il tentativo non è di questa verifica o la prova non è
 * consegnata. */
async function tentativoCorretto(v: VerificaLetta, tentativoId: string) {
  const t = await prisma.tentativo.findUnique({
    where: { id: tentativoId },
    include: { prova: true, ...INCLUDI_VERSIONE },
  });
  if (!t?.prova || t.prova.compitoId !== v.compitoId || !t.prova.consegnataAt) return null;
  const versioni = (await versioniDelloStudente(v.compitoId, t.prova.studentId)) ?? [];
  const [trovata] = celleDellaProva(t.prova.posizioni, versioni, [t], colonneDi(v.layout));
  return trovata ?? null;
}

/** La risposta di uno studente a un esercizio, per la revisione del
 * docente: contenuto originale (con lo svolgimento), seme e stato. */
export async function dettaglioRisposta(
  compitoId: string,
  teacherId: string,
  tentativoId: string,
): Promise<{ seed: string; content: unknown; state: QuestionState | null; punti: number; puntiMax: number; manuale: boolean } | null> {
  const v = await verificaDelDocente(compitoId, teacherId, new Date());
  if (!v || !corretta(v)) return null;
  const trovato = await tentativoCorretto(v, tentativoId);
  if (!trovato) return null;
  const { cella, tentativo } = trovato;
  return {
    seed: tentativo.seed,
    content: tentativo.versione.content,
    state: tentativo.state as QuestionState | null,
    punti: cella.punti,
    puntiMax: cella.puntiMax,
    manuale: cella.manuale,
  };
}

/** Un valore di punti valido: in [0, massimo], a passi di 0,25. */
function puntiValidi(punti: number, massimo: number): boolean {
  if (!Number.isFinite(punti) || punti < 0 || punti > massimo) return false;
  return Math.abs(punti * 4 - Math.round(punti * 4)) < 1e-9;
}

/** I punti dati a mano a un esercizio di una prova consegnata; `null` torna
 * al calcolo automatico. A verifica CHIUSA o PUBBLICATA: dopo la
 * pubblicazione lo studente vede il valore aggiornato. */
export async function modificaPunti(
  compitoId: string,
  teacherId: string,
  tentativoId: string,
  punti: number | null,
): Promise<{ ok: true } | { ok: false; motivo: MotivoPunti }> {
  const v = await verificaDelDocente(compitoId, teacherId, new Date());
  if (!v) return { ok: false, motivo: "non_trovata" };
  const t = await prisma.tentativo.findUnique({ where: { id: tentativoId }, include: { prova: true } });
  if (!t?.prova || t.prova.compitoId !== compitoId) return { ok: false, motivo: "non_trovata" };
  if (!corretta(v) || !t.prova.consegnataAt) return { ok: false, motivo: "stato_non_valido" };
  const trovato = await tentativoCorretto(v, tentativoId);
  if (!trovato) return { ok: false, motivo: "non_trovata" };
  if (punti !== null && !puntiValidi(punti, trovato.cella.puntiMax)) return { ok: false, motivo: "valore_non_valido" };

  // Condizionata alla prova ancora consegnata: un recupero aperto nel
  // frattempo (solo per chi non ha risposto a niente) non si corregge.
  const { count } = await prisma.tentativo.updateMany({
    where: { id: tentativoId, prova: { consegnataAt: { not: null } } },
    data: { puntiManuali: punti },
  });
  return count === 1 ? { ok: true } : { ok: false, motivo: "stato_non_valido" };
}

/**
 * Pubblica i risultati: `Verifica.pubblicataAt` alla prima volta, e
 * `ProvaVerifica.pubblicataAt` per le prove consegnate non ancora pubblicate
 * (tutte, o quelle di `studentIds`). Così un secondo «Pubblica» pubblica i
 * recuperi consegnati dopo, e chi era già pubblicato tiene la sua data. Solo
 * a verifica CHIUSA o PUBBLICATA.
 */
export async function pubblicaRisultati(
  compitoId: string,
  teacherId: string,
  studentIds?: string[],
  ora: Date = new Date(),
): Promise<EsitoAzione> {
  if (studentIds && (studentIds.length === 0 || new Set(studentIds).size !== studentIds.length)) {
    return { ok: false, motivo: "studenti_non_validi" };
  }
  const v = await verificaDelDocente(compitoId, teacherId, ora);
  if (!v) return { ok: false, motivo: "non_trovata" };
  if (!corretta(v)) return { ok: false, motivo: "stato_non_valido" };
  if (studentIds) {
    const iscritti = await prisma.classeStudente.count({ where: { classeId: v.classeId, studentId: { in: studentIds } } });
    if (iscritti !== studentIds.length) return { ok: false, motivo: "studenti_non_validi" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.verifica.updateMany({ where: { compitoId, chiusaAt: { not: null }, pubblicataAt: null }, data: { pubblicataAt: ora } });
    await tx.provaVerifica.updateMany({
      where: {
        compitoId,
        consegnataAt: { not: null },
        pubblicataAt: null,
        ...(studentIds ? { studentId: { in: studentIds } } : {}),
      },
      data: { pubblicataAt: ora },
    });
  });
  return { ok: true };
}

/** I risultati di uno studente, null finché la SUA prova non è pubblicata
 * (o se la verifica non c'è più). Punti per esercizio, totale finale sulla
 * scala della verifica completa, risposte e contenuto originale con lo
 * svolgimento; niente uscite, niente misure. */
export async function risultatiDelloStudente(compitoId: string, studentId: string): Promise<RisultatiStudente | null> {
  const v = await sincronizzaVerifica(compitoId);
  if (!v) return null;
  const prova = await prisma.provaVerifica.findUnique({
    where: { compitoId_studentId: { compitoId, studentId } },
    include: { tentativi: { include: INCLUDI_VERSIONE } },
  });
  if (!prova?.pubblicataAt || !prova.consegnataAt) return null;

  const versioni = (await versioniDelloStudente(compitoId, studentId)) ?? [];
  const pieno = totalePieno(v.layout);
  const celle = celleDellaProva(prova.posizioni, versioni, prova.tentativi, colonneDi(v.layout));
  const { finale, percentuale } = punteggioDi(celle, pieno);
  return {
    finale,
    totalePieno: pieno,
    percentuale,
    esercizi: celle.map(({ cella, tentativo }, i) => ({
      numero: i + 1,
      esercizioId: cella.esercizioId,
      titolo: cella.titolo,
      punti: cella.punti,
      puntiMax: cella.puntiMax,
      seed: tentativo.seed,
      content: tentativo.versione.content,
      state: tentativo.state as QuestionState | null,
    })),
  };
}
