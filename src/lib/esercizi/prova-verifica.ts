import { randomUUID } from "crypto";
import type { ModoStrumento, ProvaVerifica } from "@prisma/client";
import type { Locale, PartState, QuestionState } from "@savint/engine";
import { prisma } from "@/lib/db/client";
import { haTitoloSulCompito } from "./compiti";
import { ricalcola } from "./marking";
import { MISURE_VUOTE, type MisurePdpValori } from "./misure-pdp";
import {
  GRAZIA_MS,
  contenutoPerVerifica,
  posizioniDellaProva,
  type LayoutBlocco,
} from "./verifica-regole";
import {
  consegnaProvaTx,
  misureDiClasse,
  scadenzaDellaProva,
  sincronizzaVerifica,
  type VerificaLetta,
} from "./verifiche";
import { versioniDelloStudente } from "./versioni-compito";

/**
 * La prova di una verifica dal lato dello studente: l'introduzione, l'elenco
 * delle sue verifiche, l'ingresso, il salvataggio delle risposte, la
 * consegna, le uscite dalla pagina e il formulario.
 *
 * Il server fa rispettare tempi, chiusura e consegna: ogni funzione parte da
 * `sincronizzaVerifica`, che consegna chi ha superato scadenza + grazia e
 * chiude la verifica quando tocca. Niente di ciò che esce da qui porta un
 * punteggio, un feedback o lo svolgimento: il motore corregge sul server,
 * sul contenuto originale, e allo studente torna solo il contenuto ripulito
 * (`contenutoPerVerifica`) e lo stato senza punteggi.
 *
 * Ogni funzione che dipende dal tempo riceve `ora` (default: adesso).
 */

export type StatoProvaStudente = "non_iniziata" | "aperta" | "consegnata" | "chiusa" | "risultati";

export type IntroProva = {
  compitoId: string;
  /** avvioProgrammatoAt ?? avviataAt ?? createdAt */
  quando: Date;
  durataMinuti: number;
  esercizi: number;
  stato: StatoProvaStudente;
  giaEntrato: boolean;
};

export type EsercizioProva = {
  tentativoId: string;
  numero: number;
  seed: string;
  /** Il contenuto ripulito da `contenutoPerVerifica`. */
  content: unknown;
  state: QuestionState | null;
};

export type ProvaAperta = {
  esercizi: EsercizioProva[];
  scadenza: Date;
  oraServer: Date;
  calcolatrice: boolean;
  formulario: boolean;
  formularioTipo: "immagine" | "pdf" | null;
};

export type MotivoProva = "non_trovata" | "non_iniziata" | "chiusa" | "consegnata" | "tempo_scaduto" | "invalid_state";

export type EventoInput = {
  tipo: "USCITA" | "RIENTRO";
  motivo?: "SCHERMO_INTERO" | "SCHEDA" | "FOCUS";
  /** ISO, ora server stimata dal client */
  at: string;
  durataMs?: number;
};

type Rifiuto = { ok: false; motivo: MotivoProva };
const rifiuto = (motivo: MotivoProva): Rifiuto => ({ ok: false, motivo });

/** Quanti eventi al massimo in una chiamata. */
export const MAX_EVENTI = 50;
/** Quanti eventi al massimo per prova: quelli in più si ignorano. */
export const MAX_EVENTI_PROVA = 500;
/** Dopo la consegna gli eventi si accettano ancora per questo tempo: un
 * rientro arriva spesso dopo. Oltre si ignorano. */
export const EVENTI_DOPO_CONSEGNA_MS = 2 * 60_000;

const iscritto = async (classeId: string, studentId: string) =>
  (await prisma.classeStudente.findUnique({ where: { classeId_studentId: { classeId, studentId } } })) != null;

const leggiProva = (compitoId: string, studentId: string) =>
  prisma.provaVerifica.findUnique({ where: { compitoId_studentId: { compitoId, studentId } } });

/** La scadenza di uno studente: dalla sua riga, o — se non ce l'ha ancora —
 * con le misure della classe, le stesse che riceverà entrando. */
function scadenzaPer(v: VerificaLetta, prova: ProvaVerifica | null, misure: MisurePdpValori): Date | null {
  return scadenzaDellaProva(v, prova ?? { inizioAt: null, recupero: false, tempoExtraPct: misure.tempoExtraPct, minutiExtra: 0 });
}

/** Lo stato della verifica per lo studente (dopo `sincronizzaVerifica`).
 * Una riga con le sole misure copiate (mai entrata, non di recupero) vale
 * come nessuna riga: a verifica chiusa non fa entrare. A verifica in corso
 * chi non è mai entrato può farlo solo prima della SUA scadenza; chi è
 * entrato resta «aperta» fino alla consegna (anche automatica). */
function statoPerStudente(v: VerificaLetta, prova: ProvaVerifica | null, scadenza: Date | null, ora: Date): StatoProvaStudente {
  if (prova?.pubblicataAt) return "risultati";
  if (v.stato === "PREPARATA") return "non_iniziata";
  if (prova?.consegnataAt) return "consegnata";
  if (prova?.recupero) return "aperta";
  if (v.stato === "IN_CORSO") {
    if (prova?.entrataAt) return "aperta";
    return scadenza && ora.getTime() < scadenza.getTime() ? "aperta" : "chiusa";
  }
  return "chiusa";
}

/** Quanti esercizi avrà la prova di uno studente che non è ancora entrato,
 * senza leggere la sua estrazione (che per il modo STUDENTE si
 * memorizzerebbe). È lo stesso conteggio di `posizioniDellaProva`: un blocco
 * casuale dà `quantiPdp` posizioni con «meno esercizi»; un blocco scelti
 * mette nell'estrazione ogni suo esercizio una volta, e `nonPerPdp` è un
 * sottoinsieme dei suoi esercizi (lo controlla la creazione), quindi ne
 * restano `quanti − nonPerPdp`. */
function quantiEsercizi(layout: LayoutBlocco[], menoEsercizi: boolean): number {
  return layout.reduce((somma, b) => {
    if (!menoEsercizi) return somma + b.quanti;
    return somma + (b.scelti ? b.quanti - b.nonPerPdp.length : b.quantiPdp);
  }, 0);
}

const spetta = (modo: ModoStrumento, misura: boolean) => modo === "TUTTI" || (modo === "SOLO_PDP" && misura);

/** Lo stato salvato come lo può rivedere lo studente: risposte e parti
 * risposte sì, punteggi no (il motore li ricalcola dalle risposte, e la
 * prova non li mostra). */
function senzaPunteggi(state: QuestionState | null): QuestionState | null {
  if (!state) return null;
  const parte = (p: PartState): PartState => ({ ...p, score: 0, ...(p.gaps ? { gaps: p.gaps.map(parte) } : {}) });
  return { ...state, score: 0, parts: state.parts.map(parte) };
}

/** L'introduzione della verifica: quando, quanto dura, quanti esercizi
 * avrà lui (con «meno esercizi» il numero ridotto: lo vede solo lui) e a
 * che punto è. Nessuna misura PDP esposta: la durata è quella della
 * verifica. Null se non iscritto, ritirata o non una verifica. */
export async function introProva(compitoId: string, studentId: string, ora: Date = new Date()): Promise<IntroProva | null> {
  const v = await sincronizzaVerifica(compitoId, ora);
  if (!v || !(await iscritto(v.classeId, studentId))) return null;
  const prova = await leggiProva(compitoId, studentId);
  const misure = prova ?? (await misureDiClasse(v.classeId, studentId));
  return {
    compitoId,
    quando: v.avvioProgrammatoAt ?? v.avviataAt ?? v.createdAt,
    durataMinuti: v.durataMinuti,
    esercizi: prova && prova.posizioni.length > 0 ? prova.posizioni.length : quantiEsercizi(v.layout, misure.menoEsercizi),
    stato: statoPerStudente(v, prova, scadenzaPer(v, prova, misure), ora),
    giaEntrato: prova?.entrataAt != null,
  };
}

/** Le verifiche non ritirate delle classi dello studente, più recenti
 * prima, con lo stato per lui. */
export async function verificheDelloStudente(
  studentId: string,
  ora: Date = new Date(),
): Promise<{ id: string; quando: Date; stato: StatoProvaStudente }[]> {
  const iscrizioni = await prisma.classeStudente.findMany({ where: { studentId }, select: { classeId: true } });
  if (iscrizioni.length === 0) return [];
  const classeIds = iscrizioni.map((i) => i.classeId);
  const compiti = await prisma.compito.findMany({
    where: { classeId: { in: classeIds }, ritiratoAt: null, tipo: "VERIFICA" },
    select: { id: true },
  });
  if (compiti.length === 0) return [];

  const verifiche: VerificaLetta[] = [];
  for (const c of compiti) {
    const v = await sincronizzaVerifica(c.id, ora);
    if (v) verifiche.push(v);
  }
  const prove = new Map(
    (await prisma.provaVerifica.findMany({ where: { studentId, compitoId: { in: verifiche.map((v) => v.compitoId) } } }))
      .map((p) => [p.compitoId, p]),
  );
  const misure = new Map(
    (await prisma.misurePdp.findMany({ where: { studentId, classeId: { in: classeIds } } })).map((m) => [m.classeId, m]),
  );

  return verifiche
    .map((v) => {
      const prova = prove.get(v.compitoId) ?? null;
      const m = prova ?? misure.get(v.classeId) ?? MISURE_VUOTE;
      return {
        id: v.compitoId,
        quando: v.avvioProgrammatoAt ?? v.avviataAt ?? v.createdAt,
        stato: statoPerStudente(v, prova, scadenzaPer(v, prova, m), ora),
      };
    })
    .sort((a, b) => b.quando.getTime() - a.quando.getTime());
}

/**
 * Lo studente entra nella prova (o ci torna). Al primo ingresso si fissano
 * le posizioni (con «meno esercizi» quelle ridotte) e si crea un tentativo
 * per esercizio, con un seme nuovo; le volte successive — anche in un
 * recupero — si rilegge ciò che è salvato: stesse domande, stessi semi.
 *
 * Due ingressi concorrenti: la riga nasce una volta (`skipDuplicates`), e
 * la transazione del primo ingresso scrive `entrataAt` condizionata a
 * `entrataAt: null` prima dei tentativi. La seconda transazione aspetta il
 * blocco della riga, non la trova più da entrare e non crea niente; i
 * tentativi si rileggono dopo, quindi entrambe le risposte sono uguali.
 *
 * Un «Chiudi» del docente arrivato fra la lettura e l'ingresso: la
 * transazione prende per prima il blocco della riga della verifica (un
 * `updateMany` senza effetti, condizionato a «non chiusa», come
 * `salvaMisureVerifica`). Se il «Chiudi» è passato prima, non la trova e lo
 * studente non entra (`chiusa`), salvo un recupero aperto; se passa dopo,
 * aspetta, e la sua lettura delle prove aperte trova questa già entrata.
 */
export async function entraNellaProva(
  compitoId: string,
  studentId: string,
  ora: Date = new Date(),
): Promise<{ ok: true; prova: ProvaAperta } | Rifiuto> {
  const v = await sincronizzaVerifica(compitoId, ora);
  if (!v || !(await iscritto(v.classeId, studentId))) return rifiuto("non_trovata");
  if (v.stato === "PREPARATA") return rifiuto("non_iniziata");

  let prova = await leggiProva(compitoId, studentId);
  const misure = prova ?? (await misureDiClasse(v.classeId, studentId));
  const scadenza = scadenzaPer(v, prova, misure);
  const stato = statoPerStudente(v, prova, scadenza, ora);
  if (stato === "consegnata" || stato === "risultati") return rifiuto("consegnata");
  if (stato === "chiusa") return rifiuto(v.stato === "IN_CORSO" ? "tempo_scaduto" : "chiusa");

  if (!prova) {
    await prisma.provaVerifica.createMany({
      data: [{
        compitoId,
        studentId,
        tempoExtraPct: misure.tempoExtraPct,
        menoEsercizi: misure.menoEsercizi,
        calcolatrice: misure.calcolatrice,
        formulario: misure.formulario,
      }],
      skipDuplicates: true,
    });
    prova = (await leggiProva(compitoId, studentId))!;
  }

  const versioni = (await versioniDelloStudente(compitoId, studentId)) ?? [];
  if (prova.entrataAt == null) {
    const esercizioDi = new Map(
      (await prisma.esercizioVersione.findMany({ where: { id: { in: versioni } }, select: { id: true, esercizioId: true } }))
        .map((x) => [x.id, x.esercizioId]),
    );
    const posizioni = posizioniDellaProva(v.layout, versioni.map((id) => esercizioDi.get(id) ?? ""), prova.menoEsercizi)
      .map((p) => p.posizione);
    const provaId = prova.id;
    const recuperoAperto = prova.recupero && prova.consegnataAt == null;
    const entrato = await prisma.$transaction(async (tx) => {
      const { count: aperta } = await tx.verifica.updateMany({
        where: { compitoId, chiusaAt: null },
        data: { minutiExtra: { increment: 0 } },
      });
      if (aperta === 0 && !recuperoAperto) return false;
      const { count } = await tx.provaVerifica.updateMany({
        where: { id: provaId, entrataAt: null },
        data: { entrataAt: ora, posizioni },
      });
      if (count === 0) return true;
      await tx.tentativo.createMany({
        data: posizioni.map((k) => ({ studentId, esercizioVersioneId: versioni[k]!, compitoId, provaId, seed: randomUUID() })),
        skipDuplicates: true,
      });
      return true;
    });
    if (!entrato) return rifiuto("chiusa");
    prova = (await leggiProva(compitoId, studentId))!;
  }

  const tentativi = await prisma.tentativo.findMany({
    where: { provaId: prova.id },
    include: { versione: { select: { content: true } } },
  });
  const perVersione = new Map(tentativi.map((t) => [t.esercizioVersioneId, t]));
  const esercizi = prova.posizioni.map((k, i): EsercizioProva => {
    const t = perVersione.get(versioni[k] ?? "");
    if (!t) throw new Error("Prova senza il tentativo di una sua posizione");
    return {
      tentativoId: t.id,
      numero: i + 1,
      seed: t.seed,
      content: contenutoPerVerifica(t.versione.content),
      state: senzaPunteggi(t.state as QuestionState | null),
    };
  });

  const formulario = v.formularioFile != null && spetta(v.formulario, prova.formulario);
  return {
    ok: true,
    prova: {
      esercizi,
      scadenza: scadenzaDellaProva(v, prova)!,
      oraServer: ora,
      calcolatrice: spetta(v.calcolatrice, prova.calcolatrice),
      formulario,
      formularioTipo: formulario ? (v.formularioFile!.endsWith(".pdf") ? "pdf" : "immagine") : null,
    },
  };
}

/**
 * Salva lo stato di un esercizio della prova. Il motore corregge qui, sul
 * contenuto ORIGINALE e col seme del tentativo (quello dello stato non
 * conta); punteggio e stato ricalcolato restano sul tentativo, al client
 * torna solo l'ora del salvataggio e la scadenza.
 *
 * Oltre scadenza + grazia ⇒ `tempo_scaduto` (la prova l'ha già consegnata
 * `sincronizzaVerifica`). La scrittura è condizionata al tentativo ancora
 * in corso: un «Chiudi» del docente o una «Consegna» da un'altra scheda
 * arrivati nel frattempo la fanno cadere (`consegnata`), senza toccare lo
 * stato salvato prima.
 *
 * Lo studente tolto dalla classe non salva più (`non_trovata`). A verifica
 * non più in corso salva solo un recupero aperto: una prova aperta sfuggita
 * al «Chiudi» si consegna qui, automaticamente, all'ora della chiusura
 * (`chiusa`).
 */
export async function salvaRisposta(
  compitoId: string,
  studentId: string,
  tentativoId: string,
  state: QuestionState,
  ora: Date = new Date(),
  locale: Locale = "it",
): Promise<{ ok: true; salvatoAt: Date; scadenza: Date } | Rifiuto> {
  const v = await sincronizzaVerifica(compitoId, ora);
  if (!v || !(await iscritto(v.classeId, studentId))) return rifiuto("non_trovata");
  const t = await prisma.tentativo.findUnique({
    where: { id: tentativoId },
    include: { prova: true, versione: { select: { content: true } } },
  });
  if (!t || !t.prova || t.prova.compitoId !== compitoId || t.prova.studentId !== studentId || t.studentId !== studentId) {
    return rifiuto("non_trovata");
  }
  const scadenza = scadenzaDellaProva(v, t.prova);
  if (!scadenza) return rifiuto("non_trovata");
  if (ora.getTime() > scadenza.getTime() + GRAZIA_MS) return rifiuto("tempo_scaduto");
  if (t.prova.consegnataAt) return rifiuto("consegnata");
  if (v.stato !== "IN_CORSO" && !t.prova.recupero) {
    const provaId = t.prova.id;
    await prisma.$transaction((tx) => consegnaProvaTx(tx, provaId, v.chiusaAt ?? ora, true));
    return rifiuto("chiusa");
  }

  let esito;
  try {
    esito = ricalcola(t.versione.content, t.seed, state, locale);
  } catch {
    return rifiuto("invalid_state");
  }
  const { count } = await prisma.tentativo.updateMany({
    where: { id: t.id, status: "IN_PROGRESS" },
    data: { state: esito.state as object, score: esito.score, maxScore: esito.maxScore },
  });
  if (count === 0) return rifiuto("consegnata");
  await prisma.provaVerifica.update({ where: { id: t.prova.id }, data: { ultimoSalvataggioAt: ora } });
  return { ok: true, salvatoAt: ora, scadenza };
}

/** Lo studente consegna. Idempotente: una prova già consegnata (da lui,
 * dal docente o alla scadenza) è un successo, non un errore.
 *
 * `automatica`: la consegna che il client fa da sé allo zero del suo
 * orologio. Vale solo a scadenza passata: se nel frattempo il docente ha
 * dato minuti in più, il server rifiuta (`non_scaduta`) con la scadenza
 * nuova e lo studente torna alla prova. */
export async function consegnaProva(
  compitoId: string,
  studentId: string,
  ora: Date = new Date(),
  automatica = false,
): Promise<{ ok: true } | Rifiuto | { ok: false; motivo: "non_scaduta"; scadenza: Date }> {
  const v = await sincronizzaVerifica(compitoId, ora);
  if (!v) return rifiuto("non_trovata");
  const prova = await leggiProva(compitoId, studentId);
  if (!prova?.entrataAt) return rifiuto("non_trovata");
  if (prova.consegnataAt) return { ok: true };
  if (automatica) {
    const scadenza = scadenzaDellaProva(v, prova);
    if (scadenza && ora.getTime() < scadenza.getTime()) return { ok: false, motivo: "non_scaduta", scadenza };
  }
  await prisma.$transaction((tx) => consegnaProvaTx(tx, prova.id, ora, automatica));
  return { ok: true };
}

/** Le uscite dalla pagina e i rientri. Mai prima dell'ingresso; accettati
 * anche dopo la consegna, ma solo per `EVENTI_DOPO_CONSEGNA_MS` (un rientro
 * arriva spesso dopo), e al massimo `MAX_EVENTI_PROVA` per prova: il resto
 * si ignora senza errore. L'ora dichiarata dal client è limitata a
 * [ingresso, ora] e la durata a [0, ora − ingresso]: un orologio sbagliato
 * non sposta niente fuori dalla prova. Il conteggio sta in una transazione
 * che blocca prima la riga della prova: due lotti concorrenti non superano
 * il massimo. */
export async function registraEventi(
  compitoId: string,
  studentId: string,
  eventi: EventoInput[],
  ora: Date = new Date(),
): Promise<{ ok: true } | Rifiuto> {
  if (eventi.length > MAX_EVENTI) return rifiuto("invalid_state");
  const v = await sincronizzaVerifica(compitoId, ora);
  if (!v) return rifiuto("non_trovata");
  const prova = await leggiProva(compitoId, studentId);
  if (!prova?.entrataAt) return rifiuto("non_trovata");
  if (eventi.length === 0) return { ok: true };
  if (prova.consegnataAt && ora.getTime() > prova.consegnataAt.getTime() + EVENTI_DOPO_CONSEGNA_MS) return { ok: true };

  const entrata = prova.entrataAt.getTime();
  const fine = Math.max(entrata, ora.getTime());
  const limita = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));
  const provaId = prova.id;
  await prisma.$transaction(async (tx) => {
    await tx.provaVerifica.updateMany({ where: { id: provaId }, data: { minutiExtra: { increment: 0 } } });
    const posto = MAX_EVENTI_PROVA - (await tx.eventoVerifica.count({ where: { provaId } }));
    if (posto <= 0) return;
    await tx.eventoVerifica.createMany({
      data: eventi.slice(0, posto).map((ev) => {
        const at = Date.parse(ev.at);
        return {
          provaId,
          tipo: ev.tipo,
          motivo: ev.motivo ?? null,
          at: new Date(Number.isNaN(at) ? fine : limita(at, entrata, fine)),
          durataMs: ev.durataMs === undefined ? null : Math.round(limita(ev.durataMs, 0, fine - entrata)),
        };
      }),
    });
  });
  return { ok: true };
}

/** Il tempo della prova per il conto alla rovescia del client: null se lo
 * studente non è entrato. */
export async function tempoProva(
  compitoId: string,
  studentId: string,
  ora: Date = new Date(),
): Promise<{ scadenza: Date; oraServer: Date; consegnata: boolean } | null> {
  const v = await sincronizzaVerifica(compitoId, ora);
  if (!v) return null;
  const prova = await leggiProva(compitoId, studentId);
  if (!prova?.entrataAt) return null;
  const scadenza = scadenzaDellaProva(v, prova);
  if (!scadenza) return null;
  return { scadenza, oraServer: ora, consegnata: prova.consegnataAt != null };
}

/** Chi può aprire il formulario di una verifica che ne ha uno: il docente
 * con titolo sul compito sempre; lo studente solo con la prova aperta (non
 * consegnata, entro scadenza + grazia) e se il formulario gli spetta. */
export async function puoVedereFormulario(
  compitoId: string,
  utente: { id: string; role: string },
  ora: Date = new Date(),
): Promise<boolean> {
  const v = await sincronizzaVerifica(compitoId, ora);
  if (!v || !v.formularioFile) return false;
  if (utente.role !== "STUDENT") return haTitoloSulCompito(v, utente.id);

  const prova = await leggiProva(compitoId, utente.id);
  if (!prova?.entrataAt || prova.consegnataAt) return false;
  const scadenza = scadenzaDellaProva(v, prova);
  if (!scadenza || ora.getTime() > scadenza.getTime() + GRAZIA_MS) return false;
  return spetta(v.formulario, prova.formulario);
}
