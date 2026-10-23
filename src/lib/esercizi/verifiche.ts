import type { ModoStrumento, Prisma } from "@prisma/client";
import type { QuestionState } from "@savint/engine";
import { prisma } from "@/lib/db/client";
import { haTitoloSulCompito } from "./compiti";
import { esisteFormulario } from "./formulari";
import { MISURE_VUOTE, haMisure, misurePdpSchema, type MisurePdpValori } from "./misure-pdp";
import {
  GRAZIA_MS,
  durataValida,
  haRisposta,
  posizioniDellaProva,
  scadenzaProva,
  statoVerifica,
  type LayoutBlocco,
  type StatoVerifica,
} from "./verifica-regole";
import { versioniDiTuttiGliStudenti } from "./versioni-compito";

/**
 * Il ciclo di vita di una verifica dal lato del docente: avvio (a mano o
 * programmato), consegne e chiusura automatiche, minuti in più, recuperi,
 * impostazioni in PREPARATA, misure PDP della verifica e monitoraggio.
 *
 * Non c'è un job runner: avvio programmato, consegna alla scadenza e
 * chiusura sono PIGRI. `sincronizzaVerifica` li applica all'inizio di ogni
 * lettura o scrittura, con scritture condizionate (`updateMany` con la
 * precondizione nel `where`), quindi idempotenti anche sotto concorrenza; i
 * valori scritti sono quelli "di diritto" (avvio = orario programmato,
 * consegna = scadenza), non l'ora della lettura.
 *
 * Ogni funzione che dipende dal tempo riceve `ora` (default: adesso), così
 * i test passano orari espliciti.
 */

export type VerificaLetta = {
  compitoId: string;
  classeId: string;
  assignedById: string;
  createdAt: Date;
  durataMinuti: number;
  avvioProgrammatoAt: Date | null;
  avviataAt: Date | null;
  chiusaAt: Date | null;
  pubblicataAt: Date | null;
  minutiExtra: number;
  calcolatrice: ModoStrumento;
  formulario: ModoStrumento;
  formularioFile: string | null;
  layout: LayoutBlocco[];
  stato: StatoVerifica;
};

export type EsitoAzione =
  | { ok: true }
  | { ok: false; motivo: "non_trovata" | "stato_non_valido" | "studenti_non_validi" | "valore_non_valido" };

const NON_TROVATA = { ok: false, motivo: "non_trovata" } as const;
const STATO_NON_VALIDO = { ok: false, motivo: "stato_non_valido" } as const;
const STUDENTI_NON_VALIDI = { ok: false, motivo: "studenti_non_validi" } as const;
const VALORE_NON_VALIDO = { ok: false, motivo: "valore_non_valido" } as const;

const SELEZIONE_MISURE = { tempoExtraPct: true, menoEsercizi: true, calcolatrice: true, formulario: true } as const;

const MINUTI_MAX = 120;

/** La verifica com'è ora nel database, null se non c'è, non è una verifica
 * o è ritirata. Nessuna scrittura. */
async function leggiVerifica(compitoId: string): Promise<VerificaLetta | null> {
  const compito = await prisma.compito.findUnique({ where: { id: compitoId }, include: { verifica: true } });
  if (!compito || compito.ritiratoAt != null || compito.tipo !== "VERIFICA" || !compito.verifica) return null;
  const v = compito.verifica;
  return {
    compitoId,
    classeId: compito.classeId,
    assignedById: compito.assignedById,
    createdAt: v.createdAt,
    durataMinuti: v.durataMinuti,
    avvioProgrammatoAt: v.avvioProgrammatoAt,
    avviataAt: v.avviataAt,
    chiusaAt: v.chiusaAt,
    pubblicataAt: v.pubblicataAt,
    minutiExtra: v.minutiExtra,
    calcolatrice: v.calcolatrice,
    formulario: v.formulario,
    formularioFile: v.formularioFile,
    layout: v.layout as LayoutBlocco[],
    stato: statoVerifica(v),
  };
}

/** La scadenza di una prova, null se la verifica non è avviata. Il tempo si
 * conta dall'avvio della verifica (non dall'ingresso dello studente), più i
 * minuti dati a tutti; un recupero invece parte dal suo `inizioAt` e i
 * minuti dati a tutti non valgono per lui. */
export function scadenzaDellaProva(
  v: VerificaLetta,
  p: { inizioAt: Date | null; recupero: boolean; tempoExtraPct: number; minutiExtra: number },
): Date | null {
  if (!v.avviataAt) return null;
  const inizio = p.recupero ? p.inizioAt : v.avviataAt;
  if (!inizio) return null;
  return scadenzaProva({
    inizio,
    durataMinuti: v.durataMinuti,
    tempoExtraPct: p.tempoExtraPct,
    minutiExtra: p.minutiExtra + (p.recupero ? 0 : v.minutiExtra),
  });
}

/** Consegna una prova alla data `quando`: la riga (solo se non era già
 * consegnata) e i suoi tentativi ancora in corso. False se un'altra
 * richiesta l'aveva già consegnata: allora i tentativi non si toccano. */
export async function consegnaProvaTx(
  tx: Prisma.TransactionClient,
  provaId: string,
  quando: Date,
  automatica: boolean,
): Promise<boolean> {
  const { count } = await tx.provaVerifica.updateMany({
    where: { id: provaId, consegnataAt: null },
    data: { consegnataAt: quando, consegnaAutomatica: automatica },
  });
  if (count === 0) return false;
  await tx.tentativo.updateMany({
    where: { provaId, status: "IN_PROGRESS" },
    data: { status: "COMPLETED", completedAt: quando },
  });
  return true;
}

/** All'avvio: una `ProvaVerifica` con le misure copiate per ogni iscritto
 * che ha `MisurePdp` e ancora nessuna riga. Le righe già create in
 * PREPARATA dal docente («Modifica per questa verifica») restano come sono,
 * e `skipDuplicates` rende la copia ripetibile. Da qui in poi la prova non
 * segue più le misure della classe. */
async function copiaMisureAllAvvio(tx: Prisma.TransactionClient, compitoId: string, classeId: string): Promise<void> {
  const misure = await tx.misurePdp.findMany({
    where: { classeId, studente: { classi: { some: { classeId } } } },
    select: { studentId: true, ...SELEZIONE_MISURE },
  });
  if (misure.length === 0) return;
  await tx.provaVerifica.createMany({
    data: misure.map((m) => ({ compitoId, ...m })),
    skipDuplicates: true,
  });
}

/** Le misure della classe per uno studente (vuote se non ne ha). */
async function misureDiClasse(classeId: string, studentId: string): Promise<MisurePdpValori> {
  const m = await prisma.misurePdp.findUnique({
    where: { classeId_studentId: { classeId, studentId } },
    select: SELEZIONE_MISURE,
  });
  return m ?? MISURE_VUOTE;
}

/** Una prova è «aperta» se lo studente ci sta lavorando o può farlo: non
 * consegnata, e entrata o di recupero. Una riga creata solo per le misure
 * (all'avvio o dal docente) e mai entrata conta come nessuna prova. */
const aperta = (p: { consegnataAt: Date | null; entrataAt: Date | null; recupero: boolean }) =>
  p.consegnataAt == null && (p.entrataAt != null || p.recupero);

/**
 * Porta la verifica allo stato di diritto a `ora`, in ordine:
 * 1. avvio programmato passato ⇒ `avviataAt = avvioProgrammatoAt` e copia
 *    delle misure;
 * 2. prove aperte oltre scadenza + grazia ⇒ consegnate alla scadenza,
 *    automaticamente;
 * 3. verifica in corso in cui ogni iscritto ha consegnato o ha la scadenza
 *    + grazia alle spalle ⇒ `chiusaAt` = la più tarda fra consegne e
 *    scadenze (o `ora` se hanno consegnato tutti).
 * Null se non esiste, non è una verifica o è ritirata.
 */
export async function sincronizzaVerifica(compitoId: string, ora: Date = new Date()): Promise<VerificaLetta | null> {
  let v = await leggiVerifica(compitoId);
  if (!v) return null;

  // 1. Avvio programmato. La data scritta è quella letta: se nel frattempo
  // il docente l'ha cambiata (o un'altra lettura ha già avviato), il
  // `where` non trova la riga e non si scrive niente.
  if (!v.avviataAt && v.avvioProgrammatoAt && v.avvioProgrammatoAt <= ora) {
    const programmato = v.avvioProgrammatoAt;
    const classeId = v.classeId;
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.verifica.updateMany({
        where: { compitoId, avviataAt: null, avvioProgrammatoAt: programmato },
        data: { avviataAt: programmato },
      });
      if (count === 1) await copiaMisureAllAvvio(tx, compitoId, classeId);
    });
    v = await leggiVerifica(compitoId);
    if (!v) return null;
  }
  if (!v.avviataAt) return v;

  // 2. Consegna pigra di chi ha superato scadenza + grazia.
  const prove = await prisma.provaVerifica.findMany({ where: { compitoId } });
  let consegnate = false;
  for (const p of prove) {
    if (!aperta(p)) continue;
    const scadenza = scadenzaDellaProva(v, p);
    if (!scadenza || ora.getTime() <= scadenza.getTime() + GRAZIA_MS) continue;
    const fatta = await prisma.$transaction((tx) => consegnaProvaTx(tx, p.id, scadenza, true));
    if (fatta) {
      p.consegnataAt = scadenza;
      consegnate = true;
    }
  }

  // 3. Chiusura automatica. Le prove e gli iscritti letti sopra sono una
  // fotografia: una consegna o un ingresso arrivati nel frattempo non ci
  // sono. Va bene così: la fotografia può solo far chiudere più tardi (un
  // consegnato visto come aperto), mai prima, perché chi non ha consegnato
  // conta solo con la scadenza + grazia già alle spalle, dopo la quale il
  // server non accetta più niente da lui; e la scrittura è condizionata a
  // `chiusaAt: null`, quindi una chiusura concorrente non si sovrascrive.
  if (v.stato === "IN_CORSO") {
    const chiusura = await chiusuraDiDiritto(v, prove, ora);
    if (chiusura) {
      await prisma.verifica.updateMany({
        where: { compitoId, avviataAt: { not: null }, chiusaAt: null },
        data: { chiusaAt: chiusura },
      });
      return leggiVerifica(compitoId);
    }
  }
  return consegnate ? leggiVerifica(compitoId) : v;
}

/** Quando la verifica in corso è chiusa di diritto, null se c'è ancora
 * qualcuno che può lavorare. Per un iscritto senza riga la scadenza è
 * quella con le misure della classe e i minuti dati a tutti. Con la classe
 * vuota vale la scadenza base: una verifica non si chiude da sola appena
 * avviata. */
async function chiusuraDiDiritto(
  v: VerificaLetta,
  prove: { studentId: string; consegnataAt: Date | null; entrataAt: Date | null; inizioAt: Date | null; recupero: boolean; tempoExtraPct: number; minutiExtra: number }[],
  ora: Date,
): Promise<Date | null> {
  const iscritti = await prisma.classeStudente.findMany({ where: { classeId: v.classeId }, select: { studentId: true } });
  const misure = new Map(
    (await prisma.misurePdp.findMany({ where: { classeId: v.classeId }, select: { studentId: true, tempoExtraPct: true } }))
      .map((m) => [m.studentId, m.tempoExtraPct]),
  );
  const perStudente = new Map(prove.map((p) => [p.studentId, p]));
  const passata = (d: Date) => ora.getTime() > d.getTime() + GRAZIA_MS;

  if (iscritti.length === 0) {
    const base = scadenzaDellaProva(v, { inizioAt: null, recupero: false, tempoExtraPct: 0, minutiExtra: 0 })!;
    return passata(base) ? base : null;
  }

  let tutteConsegnate = true;
  let piuTarda = 0;
  for (const { studentId } of iscritti) {
    const p = perStudente.get(studentId);
    if (p?.consegnataAt) {
      piuTarda = Math.max(piuTarda, p.consegnataAt.getTime());
      continue;
    }
    tutteConsegnate = false;
    const scadenza = scadenzaDellaProva(
      v,
      p ?? { inizioAt: null, recupero: false, tempoExtraPct: misure.get(studentId) ?? 0, minutiExtra: 0 },
    );
    if (!scadenza || !passata(scadenza)) return null;
    piuTarda = Math.max(piuTarda, scadenza.getTime());
  }
  return tutteConsegnate ? ora : new Date(piuTarda);
}

/** La verifica sincronizzata, se `teacherId` ha titolo sul compito (chi la
 * insegna o chi l'ha assegnata, come per i compiti). Null altrimenti: le
 * rotte ne fanno un 404, mai un 403. */
async function verificaDelDocente(compitoId: string, teacherId: string, ora: Date): Promise<VerificaLetta | null> {
  const v = await leggiVerifica(compitoId);
  if (!v || !(await haTitoloSulCompito(v, teacherId))) return null;
  return sincronizzaVerifica(compitoId, ora);
}

/** Avvia una verifica preparata adesso, e copia le misure PDP. */
export async function avviaVerifica(compitoId: string, teacherId: string, ora: Date = new Date()): Promise<EsitoAzione> {
  const v = await verificaDelDocente(compitoId, teacherId, ora);
  if (!v) return NON_TROVATA;
  if (v.stato !== "PREPARATA") return STATO_NON_VALIDO;
  const avviata = await prisma.$transaction(async (tx) => {
    const { count } = await tx.verifica.updateMany({ where: { compitoId, avviataAt: null }, data: { avviataAt: ora } });
    if (count === 0) return false;
    await copiaMisureAllAvvio(tx, compitoId, v.classeId);
    return true;
  });
  return avviata ? { ok: true } : STATO_NON_VALIDO;
}

/** Chiude la verifica in corso per tutti: ogni prova aperta, recuperi
 * compresi, si consegna adesso (anche chi aveva ancora tempo extra). La
 * chiusura si scrive per prima: è la riga della verifica che mette in fila
 * due chiusure concorrenti, e la seconda trova `chiusaAt` già scritto. */
export async function chiudiVerifica(compitoId: string, teacherId: string, ora: Date = new Date()): Promise<EsitoAzione> {
  const v = await verificaDelDocente(compitoId, teacherId, ora);
  if (!v) return NON_TROVATA;
  if (v.stato !== "IN_CORSO") return STATO_NON_VALIDO;
  const chiusa = await prisma.$transaction(async (tx) => {
    const { count } = await tx.verifica.updateMany({
      where: { compitoId, avviataAt: { not: null }, chiusaAt: null },
      data: { chiusaAt: ora },
    });
    if (count === 0) return false;
    const prove = await tx.provaVerifica.findMany({
      where: { compitoId, consegnataAt: null },
      select: { id: true, consegnataAt: true, entrataAt: true, recupero: true },
    });
    for (const p of prove.filter(aperta)) await consegnaProvaTx(tx, p.id, ora, true);
    return true;
  });
  return chiusa ? { ok: true } : STATO_NON_VALIDO;
}

/** Minuti in più: senza studente a tutti (`Verifica.minutiExtra`, non vale
 * per i recuperi), con lo studente solo a lui. Solo a verifica avviata e su
 * una prova non consegnata; a uno studente senza riga la si crea con le
 * misure della classe, le stesse che riceverebbe entrando. */
export async function aggiungiMinuti(
  compitoId: string,
  teacherId: string,
  minuti: number,
  studentId?: string,
  ora: Date = new Date(),
): Promise<EsitoAzione> {
  if (!Number.isInteger(minuti) || minuti < 1 || minuti > MINUTI_MAX) return VALORE_NON_VALIDO;
  const v = await verificaDelDocente(compitoId, teacherId, ora);
  if (!v) return NON_TROVATA;
  if (v.stato === "PREPARATA") return STATO_NON_VALIDO;

  if (studentId === undefined) {
    if (v.stato !== "IN_CORSO") return STATO_NON_VALIDO;
    const { count } = await prisma.verifica.updateMany({
      where: { compitoId, avviataAt: { not: null }, chiusaAt: null },
      data: { minutiExtra: { increment: minuti } },
    });
    return count === 1 ? { ok: true } : STATO_NON_VALIDO;
  }

  const iscritto = await prisma.classeStudente.findUnique({
    where: { classeId_studentId: { classeId: v.classeId, studentId } },
  });
  if (!iscritto) return STUDENTI_NON_VALIDI;
  const prova = await prisma.provaVerifica.findUnique({ where: { compitoId_studentId: { compitoId, studentId } } });
  // A verifica chiusa resta solo chi è in recupero.
  if (v.stato !== "IN_CORSO" && !prova?.recupero) return STATO_NON_VALIDO;
  if (!prova) {
    const misure = await misureDiClasse(v.classeId, studentId);
    await prisma.provaVerifica.createMany({ data: [{ compitoId, studentId, ...misure }], skipDuplicates: true });
  }
  const { count } = await prisma.provaVerifica.updateMany({
    where: { compitoId, studentId, consegnataAt: null },
    data: { minutiExtra: { increment: minuti } },
  });
  return count === 1 ? { ok: true } : STATO_NON_VALIDO;
}

/** Si può dare un recupero a chi non ha una prova (o non ci è mai entrato:
 * vedi `provaPerRecupero`) o l'ha consegnata senza rispondere a niente. */
export function recuperabile(
  p: { consegnataAt: Date | null; recupero: boolean; inizioAt: Date | null } | null,
  risposte: number,
): boolean {
  if (!p) return true;
  return p.consegnataAt != null && risposte === 0;
}

/** La prova come la vede `recuperabile`: una riga mai entrata, non
 * consegnata e non di recupero (le sole misure copiate) vale nessuna prova. */
function provaPerRecupero<T extends { consegnataAt: Date | null; entrataAt: Date | null; recupero: boolean }>(p: T | undefined): T | null {
  if (!p) return null;
  if (p.consegnataAt == null && p.entrataAt == null && !p.recupero) return null;
  return p;
}

/** Quanti esercizi della prova hanno una risposta, per prova. */
async function rispostePerProva(provaIds: string[]): Promise<Map<string, number>> {
  const risultato = new Map<string, number>();
  if (provaIds.length === 0) return risultato;
  const tentativi = await prisma.tentativo.findMany({ where: { provaId: { in: provaIds } }, select: { provaId: true, state: true } });
  for (const t of tentativi) {
    if (haRisposta(t.state as QuestionState | null)) risultato.set(t.provaId!, (risultato.get(t.provaId!) ?? 0) + 1);
  }
  return risultato;
}

/** Riapre la prova di alcuni studenti come recupero, da adesso: assenti
 * (nessuna prova) o consegnati senza risposte. Tutti validi o nessuno: se
 * uno non lo è, niente si scrive. Una riga esistente tiene misure, posizioni
 * e tentativi (stesse domande, stessi semi: i tentativi tornano in corso);
 * per chi non ne ha si crea con le misure della classe. Ogni scrittura è
 * condizionata allo stato letto: se nel frattempo la prova è cambiata, la
 * transazione si annulla. */
export async function avviaRecupero(
  compitoId: string,
  teacherId: string,
  studentIds: string[],
  ora: Date = new Date(),
): Promise<EsitoAzione> {
  if (studentIds.length === 0 || new Set(studentIds).size !== studentIds.length) return STUDENTI_NON_VALIDI;
  const v = await verificaDelDocente(compitoId, teacherId, ora);
  if (!v) return NON_TROVATA;
  if (v.stato === "PREPARATA") return STATO_NON_VALIDO;

  const iscritti = await prisma.classeStudente.count({ where: { classeId: v.classeId, studentId: { in: studentIds } } });
  if (iscritti !== studentIds.length) return STUDENTI_NON_VALIDI;
  const prove = await prisma.provaVerifica.findMany({ where: { compitoId, studentId: { in: studentIds } } });
  const perStudente = new Map(prove.map((p) => [p.studentId, p]));
  const risposte = await rispostePerProva(prove.map((p) => p.id));
  for (const s of studentIds) {
    const p = perStudente.get(s);
    if (!recuperabile(provaPerRecupero(p), p ? risposte.get(p.id) ?? 0 : 0)) return STUDENTI_NON_VALIDI;
  }

  const misure = new Map(
    (await prisma.misurePdp.findMany({
      where: { classeId: v.classeId, studentId: { in: studentIds } },
      select: { studentId: true, ...SELEZIONE_MISURE },
    })).map(({ studentId, ...m }) => [studentId, m]),
  );
  const riapertura = { recupero: true, inizioAt: ora, consegnataAt: null, consegnaAutomatica: false, pubblicataAt: null, minutiExtra: 0 };
  try {
    await prisma.$transaction(async (tx) => {
      for (const s of studentIds) {
        const p = perStudente.get(s);
        if (!p) {
          await tx.provaVerifica.create({ data: { compitoId, studentId: s, ...(misure.get(s) ?? MISURE_VUOTE), ...riapertura } });
          continue;
        }
        const { count } = await tx.provaVerifica.updateMany({
          where: { id: p.id, consegnataAt: p.consegnataAt, recupero: p.recupero, entrataAt: p.entrataAt },
          data: riapertura,
        });
        if (count === 0) throw new ProvaCambiata();
        await tx.tentativo.updateMany({ where: { provaId: p.id }, data: { status: "IN_PROGRESS", completedAt: null } });
      }
    });
  } catch (err) {
    // P2002: una riga nata nel frattempo (lo studente è entrato).
    if (err instanceof ProvaCambiata || (err as { code?: string }).code === "P2002") return STUDENTI_NON_VALIDI;
    throw err;
  }
  return { ok: true };
}

class ProvaCambiata extends Error {}

/** Consegna (come automatica) le prove di recupero ancora aperte di questi
 * studenti. Uno studente senza recupero rende la richiesta non valida; un
 * recupero già consegnato (alla scadenza, o da un'altra scheda) no. */
export async function chiudiRecupero(
  compitoId: string,
  teacherId: string,
  studentIds: string[],
  ora: Date = new Date(),
): Promise<EsitoAzione> {
  if (studentIds.length === 0) return STUDENTI_NON_VALIDI;
  const v = await verificaDelDocente(compitoId, teacherId, ora);
  if (!v) return NON_TROVATA;
  if (v.stato === "PREPARATA") return STATO_NON_VALIDO;
  const prove = await prisma.provaVerifica.findMany({
    where: { compitoId, studentId: { in: studentIds }, recupero: true },
    select: { id: true, consegnataAt: true },
  });
  if (prove.length !== new Set(studentIds).size) return STUDENTI_NON_VALIDI;
  await prisma.$transaction(async (tx) => {
    for (const p of prove) if (!p.consegnataAt) await consegnaProvaTx(tx, p.id, ora, true);
  });
  return { ok: true };
}

/** Cambia le impostazioni di una verifica non ancora avviata, con le stesse
 * regole della creazione: durata 5–300, avvio nel futuro, formulario
 * caricato. Esercizi e punti non si cambiano: per quelli si ritira la
 * verifica e se ne crea un'altra. */
export async function modificaVerificaPreparata(
  compitoId: string,
  teacherId: string,
  campi: {
    durataMinuti?: number;
    avvioProgrammatoAt?: Date | null;
    calcolatrice?: ModoStrumento;
    formulario?: ModoStrumento;
    formularioFile?: string | null;
  },
  ora: Date = new Date(),
): Promise<EsitoAzione> {
  const v = await verificaDelDocente(compitoId, teacherId, ora);
  if (!v) return NON_TROVATA;
  if (v.stato !== "PREPARATA") return STATO_NON_VALIDO;

  const d = campi.durataMinuti;
  if (d !== undefined && !durataValida(d)) return VALORE_NON_VALIDO;
  const avvio = campi.avvioProgrammatoAt;
  if (avvio && !(avvio.getTime() > ora.getTime())) return VALORE_NON_VALIDO;
  const file = campi.formularioFile;
  if (file && !(await esisteFormulario(file))) return VALORE_NON_VALIDO;

  const { count } = await prisma.verifica.updateMany({
    where: { compitoId, avviataAt: null },
    data: {
      durataMinuti: campi.durataMinuti,
      avvioProgrammatoAt: campi.avvioProgrammatoAt,
      calcolatrice: campi.calcolatrice,
      formulario: campi.formulario,
      formularioFile: campi.formularioFile,
    },
  });
  return count === 1 ? { ok: true } : STATO_NON_VALIDO;
}

const nomeDi = (s: { name: string | null; email: string }) => s.name ?? s.email;

/** Gli iscritti che hanno misure per questa verifica: quelle della classe,
 * o quelle della loro riga di prova (`personalizzate`), che vincono — anche
 * se vuote, «niente misure per questa verifica». */
export async function misureDellaVerifica(
  compitoId: string,
  teacherId: string,
): Promise<{ studentId: string; nome: string; misure: MisurePdpValori; personalizzate: boolean }[] | null> {
  const v = await verificaDelDocente(compitoId, teacherId, new Date());
  if (!v) return null;
  const iscritti = await prisma.classeStudente.findMany({
    where: { classeId: v.classeId },
    include: { studente: { select: { name: true, email: true } } },
    orderBy: { studente: { name: "asc" } },
  });
  const diClasse = new Map(
    (await prisma.misurePdp.findMany({ where: { classeId: v.classeId }, select: { studentId: true, ...SELEZIONE_MISURE } }))
      .map(({ studentId, ...m }) => [studentId, m]),
  );
  const diProva = new Map(
    (await prisma.provaVerifica.findMany({ where: { compitoId }, select: { studentId: true, ...SELEZIONE_MISURE } }))
      .map(({ studentId, ...m }) => [studentId, m]),
  );
  const risultato = [];
  for (const i of iscritti) {
    const classe = diClasse.get(i.studentId);
    const prova = diProva.get(i.studentId);
    if (!(classe && haMisure(classe)) && !(prova && haMisure(prova))) continue;
    risultato.push({ studentId: i.studentId, nome: nomeDi(i.studente), misure: prova ?? classe!, personalizzate: !!prova });
  }
  return risultato;
}

/** Le misure di uno studente per questa sola verifica, prima dell'avvio.
 * La transazione blocca prima la riga della verifica (`updateMany` senza
 * effetti, condizionato a «non avviata»): un avvio concorrente aspetta, e
 * la sua copia delle misure trova questa riga e la lascia com'è. */
export async function salvaMisureVerifica(
  compitoId: string,
  teacherId: string,
  studentId: string,
  misure: MisurePdpValori,
): Promise<EsitoAzione> {
  const v = await verificaDelDocente(compitoId, teacherId, new Date());
  if (!v) return NON_TROVATA;
  if (v.stato !== "PREPARATA") return STATO_NON_VALIDO;
  const valide = misurePdpSchema.safeParse(misure);
  if (!valide.success) return VALORE_NON_VALIDO;
  const iscritto = await prisma.classeStudente.findUnique({
    where: { classeId_studentId: { classeId: v.classeId, studentId } },
  });
  if (!iscritto) return STUDENTI_NON_VALIDI;

  const dati = valide.data;
  const salvate = await prisma.$transaction(async (tx) => {
    const { count } = await tx.verifica.updateMany({
      where: { compitoId, avviataAt: null },
      data: { minutiExtra: { increment: 0 } },
    });
    if (count === 0) return false;
    await tx.provaVerifica.upsert({
      where: { compitoId_studentId: { compitoId, studentId } },
      create: { compitoId, studentId, ...dati },
      update: dati,
    });
    return true;
  });
  return salvate ? { ok: true } : STATO_NON_VALIDO;
}

export type RigaMonitoraggio = {
  studentId: string;
  nome: string;
  stato: "non_entrato" | "in_corso" | "consegnato" | "consegnato_auto";
  recupero: boolean;
  risposti: number;
  totale: number;
  scadenza: Date | null;
  secondiResidui: number | null;
  tempoExtraPct: number;
  minutiExtra: number;
  uscite: number;
  secondiFuori: number;
  ultimoSalvataggioAt: Date | null;
  recuperabile: boolean;
};

export type Monitoraggio = {
  verifica: VerificaLetta;
  titolo: string;
  classe: string;
  oraServer: Date;
  conTempoResiduo: number;
  recuperiAperti: number;
  righe: RigaMonitoraggio[];
};

/** Il monitoraggio del docente: una riga per iscritto, senza alcun
 * punteggio (durante la prova nemmeno il docente lo vede). */
export async function monitoraggioVerifica(
  compitoId: string,
  teacherId: string,
  ora: Date = new Date(),
): Promise<Monitoraggio | null> {
  const v = await verificaDelDocente(compitoId, teacherId, ora);
  if (!v) return null;

  const compito = await prisma.compito.findUniqueOrThrow({
    where: { id: compitoId },
    select: { batteria: { select: { name: true } }, classe: { select: { name: true } } },
  });
  const iscritti = await prisma.classeStudente.findMany({
    where: { classeId: v.classeId },
    include: { studente: { select: { name: true, email: true } } },
    orderBy: { studente: { name: "asc" } },
  });
  const diClasse = new Map(
    (await prisma.misurePdp.findMany({ where: { classeId: v.classeId }, select: { studentId: true, ...SELEZIONE_MISURE } }))
      .map(({ studentId, ...m }) => [studentId, m]),
  );
  const prove = await prisma.provaVerifica.findMany({
    where: { compitoId },
    include: { eventi: { select: { tipo: true, at: true, durataMs: true }, orderBy: { at: "asc" } } },
  });
  const perStudente = new Map(prove.map((p) => [p.studentId, p]));
  const risposte = await rispostePerProva(prove.map((p) => p.id));

  // Per chi non ha ancora le posizioni fissate, il numero di esercizi che
  // la prova gli chiederà: dalla sua estrazione e da «meno esercizi».
  const versioni = await versioniDiTuttiGliStudenti(compitoId);
  const esercizioDi = new Map(
    (await prisma.esercizioVersione.findMany({
      where: { id: { in: [...new Set([...versioni.values()].flat())] } },
      select: { id: true, esercizioId: true },
    })).map((x) => [x.id, x.esercizioId]),
  );

  const righe: RigaMonitoraggio[] = [];
  for (const i of iscritti) {
    const p = perStudente.get(i.studentId);
    const misure = p ?? diClasse.get(i.studentId) ?? MISURE_VUOTE;
    const recupero = p?.recupero ?? false;
    const entrata = p?.entrataAt != null;
    const consegnata = p?.consegnataAt != null;
    const stato: RigaMonitoraggio["stato"] = !entrata
      ? "non_entrato"
      : consegnata
        ? (p!.consegnaAutomatica ? "consegnato_auto" : "consegnato")
        : "in_corso";

    const totale = p && p.posizioni.length > 0
      ? p.posizioni.length
      : posizioniDellaProva(
          v.layout,
          (versioni.get(i.studentId) ?? []).map((id) => esercizioDi.get(id) ?? ""),
          misure.menoEsercizi,
        ).length;

    const scadenza = scadenzaDellaProva(
      v,
      p ?? { inizioAt: null, recupero: false, tempoExtraPct: misure.tempoExtraPct, minutiExtra: 0 },
    );
    // Il tempo residuo ha senso solo per chi può ancora lavorare: non
    // consegnato, e a verifica in corso o in recupero.
    const puoLavorare = !consegnata && (v.stato === "IN_CORSO" || recupero);
    const secondiResidui = scadenza && puoLavorare
      ? Math.max(0, Math.round((scadenza.getTime() - ora.getTime()) / 1000))
      : null;

    let uscite = 0;
    let fuoriMs = 0;
    let uscitaAperta: Date | null = null;
    for (const ev of p?.eventi ?? []) {
      if (ev.tipo === "USCITA") {
        uscite++;
        uscitaAperta = ev.at;
      } else {
        fuoriMs += ev.durataMs ?? 0;
        uscitaAperta = null;
      }
    }
    // Un'uscita ancora aperta conta fino a ora, ma non oltre la consegna:
    // chi esce e non torna più non resta «fuori» per giorni.
    if (uscitaAperta) {
      const fine = Math.min(ora.getTime(), p?.consegnataAt?.getTime() ?? ora.getTime());
      fuoriMs += Math.max(0, fine - uscitaAperta.getTime());
    }

    righe.push({
      studentId: i.studentId,
      nome: nomeDi(i.studente),
      stato,
      recupero,
      risposti: p ? risposte.get(p.id) ?? 0 : 0,
      totale,
      scadenza,
      secondiResidui,
      tempoExtraPct: misure.tempoExtraPct,
      minutiExtra: p?.minutiExtra ?? 0,
      uscite,
      secondiFuori: Math.round(fuoriMs / 1000),
      ultimoSalvataggioAt: p?.ultimoSalvataggioAt ?? null,
      recuperabile: recuperabile(provaPerRecupero(p), p ? risposte.get(p.id) ?? 0 : 0),
    });
  }

  return {
    verifica: v,
    titolo: compito.batteria.name,
    classe: compito.classe.name,
    oraServer: ora,
    conTempoResiduo: righe.filter((r) => (r.secondiResidui ?? 0) > 0).length,
    recuperiAperti: righe.filter((r) => r.recupero && perStudente.get(r.studentId)!.consegnataAt == null).length,
    righe,
  };
}
