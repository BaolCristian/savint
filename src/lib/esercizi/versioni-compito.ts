import { Prisma, type ModoEstrazione } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { estraiDaBacini } from "./estrazione";

/** Un blocco del bacino congelato di un compito "diverse per studente"
 * (`Compito.bacini`, Decisioni punto 4): le versioni candidate di quel
 * blocco e quante pescarne. `scelti` marca un blocco "scelti a mano": i
 * suoi esercizi si assegnano tutti, NELL'ORDINE del docente, senza
 * mescolarli — lo stesso significato che ha in `estraiConDettaglio`. Senza
 * il segno, un blocco scelti congelato verrebbe trattato come casuale e
 * mescolato (pescare `count` su `count` dà gli stessi esercizi, ma in un
 * ordine diverso per ogni studente). Assente = blocco casuale. È un campo
 * in più rispetto a `{ count, versionIds }` descritto nello schema: il
 * JSON lo accetta, e chi legge solo quei due campi continua a funzionare. */
export type BacinoCongelato = { count: number; versionIds: string[]; scelti?: true };

/** L'estrazione di uno studente dal bacino congelato, con il seme
 * `${drawSeed}:${studentId}` già composto da chi chiama. Pura: la usa
 * `assegnaCompito` (compiti.ts) per gli iscritti, dentro la sua
 * transazione, e `estrazioneDelloStudente` per chi arriva dopo — una sola
 * copia del calcolo, quindi lo stesso studente riceve la stessa estrazione
 * da qualunque delle due porte entri.
 *
 * Il sorteggio è `estraiDaBacini` (estrazione.ts), sugli id VERSIONE invece
 * che sugli id esercizio (ogni esercizio ha una sola versione nel bacino,
 * l'ultima). I bacini casuali possono SOVRAPPORSI (una raccolta e un
 * argomento con esercizi in comune): è `estraiDaBacini` a togliere a ogni
 * blocco ciò che i precedenti hanno già preso per QUESTO studente. La
 * riserva degli scelti qui non toglie niente: congelando, gli scelti sono
 * già stati tolti dai bacini casuali. All'assegnazione
 * (`riepilogoPerModo`, compiti.ts) ogni blocco casuale ha almeno `count`
 * versioni anche nel caso peggiore — tolti, per ogni blocco casuale
 * precedente, `count` esercizi o quelli in comune se sono meno — quindi
 * l'estrazione non può risultare corta,
 * con nessun seme. Se lo fosse — un
 * `Compito.bacini` scritto a mano, o rotto — si lancia: uno studente con
 * meno esercizi è proprio il caso che il bacino congelato esiste per
 * escludere, non un esito da salvare. */
export function estrazioneDaBaciniCongelati(bacini: BacinoCongelato[], seme: string): string[] {
  const estratti = estraiDaBacini(
    bacini.map((b) => ({ candidati: b.versionIds, richiesti: b.count, scelti: b.scelti === true })),
    seme,
  );
  if (!estratti) throw new Error("Bacino congelato insufficiente: un blocco ha meno versioni di quante ne chiede");
  return estratti;
}

/** Legge `Compito.bacini` (JSON) controllandone la forma: un JSON che non è
 * un array di `{ count, versionIds }` è un compito rotto, e si lancia
 * invece di estrarre da un bacino indovinato. */
function baciniCongelati(json: unknown): BacinoCongelato[] {
  if (!Array.isArray(json)) throw new Error("Compito STUDENTE senza bacino congelato");
  return json.map((b) => {
    const r = b as { count?: unknown; versionIds?: unknown; scelti?: unknown };
    if (
      typeof r.count !== "number" ||
      !Array.isArray(r.versionIds) ||
      !r.versionIds.every((v) => typeof v === "string")
    ) {
      throw new Error("Compito.bacini malformato");
    }
    return { count: r.count, versionIds: r.versionIds as string[], ...(r.scelti === true ? { scelti: true as const } : {}) };
  });
}

/** Le versioni che uno studente riceve da un compito, nell'ordine dei
 * blocchi.
 *
 * CLASSE ("stesse domande"): `drawnVersionIds`, uguale per tutti; nessuna
 * scrittura.
 *
 * STUDENTE ("diverse per studente"): la sua `EstrazioneStudente`. Se non
 * c'è ancora (si è iscritto dopo l'assegnazione: gli iscritti di allora
 * l'hanno ricevuta subito da `assegnaCompito`), si calcola ORA dal bacino
 * congelato con seme `${drawSeed}:${studentId}` e si memorizza: da quel
 * momento non cambia più, qualunque cosa succeda agli esercizi (spec,
 * "Modo diverse per studente").
 *
 * Due richieste insieme per lo stesso studente (due schede aperte, il
 * docente che apre l'anteprima mentre lo studente apre il compito) possono
 * non trovare entrambe la riga e provare entrambe a crearla: la seconda
 * urta la chiave primaria (P2002) e rilegge quella della prima. Il calcolo
 * è deterministico, quindi le due avrebbero scritto la stessa cosa; ma
 * rileggere invece di fidarsi del proprio calcolo fa sì che il valore
 * restituito sia SEMPRE quello memorizzato.
 *
 * Non controlla che `studentId` sia iscritto alla classe né che il compito
 * sia aperto: è compito di chi chiama (le letture di Task 4), come
 * `compitoApribile` fa oggi prima di guardare `drawnVersionIds`. */
export async function estrazioneDelloStudente(
  compito: { id: string; modo: ModoEstrazione; drawSeed: string; bacini: unknown; drawnVersionIds: string[] },
  studentId: string,
): Promise<string[]> {
  // `!== "STUDENTE"` e non `=== "CLASSE"`: nel database `modo` c'è sempre
  // (default CLASSE), ma una lettura che non l'ha selezionato deve ricadere
  // sul comportamento di sempre, non su un'estrazione per studente.
  if (compito.modo !== "STUDENTE") return compito.drawnVersionIds;

  const chiave = { compitoId_studentId: { compitoId: compito.id, studentId } };
  const esistente = await prisma.estrazioneStudente.findUnique({ where: chiave, select: { versionIds: true } });
  if (esistente) return esistente.versionIds;

  const versionIds = estrazioneDaBaciniCongelati(baciniCongelati(compito.bacini), `${compito.drawSeed}:${studentId}`);
  try {
    await prisma.estrazioneStudente.create({ data: { compitoId: compito.id, studentId, versionIds } });
    return versionIds;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const vincitrice = await prisma.estrazioneStudente.findUniqueOrThrow({ where: chiave, select: { versionIds: true } });
      return vincitrice.versionIds;
    }
    throw e;
  }
}

/** Ciò che serve di un compito per sapere le versioni dei suoi studenti. */
export type CompitoConVersioni = {
  id: string;
  modo: ModoEstrazione;
  drawSeed: string;
  bacini: unknown;
  drawnVersionIds: string[];
};

/** Quanti esercizi riceve ogni studente: `drawnVersionIds.length` nel modo
 * CLASSE, la somma dei `count` dei blocchi congelati nel modo STUDENTE
 * (ognuno riceve esattamente quel numero: è ciò che il bacino congelato
 * garantisce). Per gli elenchi del docente, senza leggere le estrazioni. */
export function eserciziPerStudente(compito: Pick<CompitoConVersioni, "modo" | "bacini" | "drawnVersionIds">): number {
  if (compito.modo !== "STUDENTE") return compito.drawnVersionIds.length;
  return baciniCongelati(compito.bacini).reduce((somma, b) => somma + b.count, 0);
}

/** Le versioni di più compiti per più studenti in un colpo solo: compito →
 * studente → versioni. È la forma "a lotti" di `estrazioneDelloStudente`,
 * per le pagine che coprono molti compiti (la home dello studente,
 * l'andamento della classe) o molti studenti (consegne, statistiche,
 * stampa): una query per le estrazioni già memorizzate, il calcolo dal
 * bacino congelato solo per chi manca, una scrittura per tutti i mancanti.
 *
 * `createMany` con `skipDuplicates`: se nel frattempo un'altra richiesta ha
 * memorizzato la stessa coppia, la sua riga resta e qui si rilegge — come
 * il P2002 di `estrazioneDelloStudente`, il valore restituito è sempre
 * quello memorizzato.
 *
 * Come `estrazioneDelloStudente`, non controlla iscrizione né apertura: chi
 * chiama passa solo studenti iscritti ORA alla classe del compito, perché
 * un'estrazione si memorizza per sempre. */
export async function estrazioniDegliStudenti(
  compiti: CompitoConVersioni[],
  studentIds: string[],
): Promise<Map<string, Map<string, string[]>>> {
  const risultato = new Map<string, Map<string, string[]>>();
  for (const c of compiti) {
    risultato.set(c.id, new Map(c.modo !== "STUDENTE" ? studentIds.map((s) => [s, c.drawnVersionIds]) : []));
  }
  const perStudente = compiti.filter((c) => c.modo === "STUDENTE");
  if (perStudente.length === 0 || studentIds.length === 0) return risultato;

  const esistenti = await prisma.estrazioneStudente.findMany({
    where: { compitoId: { in: perStudente.map((c) => c.id) }, studentId: { in: studentIds } },
    select: { compitoId: true, studentId: true, versionIds: true },
  });
  for (const r of esistenti) risultato.get(r.compitoId)!.set(r.studentId, r.versionIds);

  const mancanti: { compitoId: string; studentId: string; versionIds: string[] }[] = [];
  for (const c of perStudente) {
    const gia = risultato.get(c.id)!;
    const daCalcolare = studentIds.filter((s) => !gia.has(s));
    if (daCalcolare.length === 0) continue;
    const bacini = baciniCongelati(c.bacini);
    for (const studentId of daCalcolare) {
      mancanti.push({ compitoId: c.id, studentId, versionIds: estrazioneDaBaciniCongelati(bacini, `${c.drawSeed}:${studentId}`) });
    }
  }
  if (mancanti.length === 0) return risultato;

  const scritte = await prisma.estrazioneStudente.createMany({ data: mancanti, skipDuplicates: true });
  if (scritte.count < mancanti.length) {
    const rilette = await prisma.estrazioneStudente.findMany({
      where: { OR: mancanti.map(({ compitoId, studentId }) => ({ compitoId, studentId })) },
      select: { compitoId: true, studentId: true, versionIds: true },
    });
    for (const r of rilette) risultato.get(r.compitoId)!.set(r.studentId, r.versionIds);
  } else {
    for (const m of mancanti) risultato.get(m.compitoId)!.set(m.studentId, m.versionIds);
  }
  return risultato;
}

const selezioneVersioni = { id: true, modo: true, drawSeed: true, bacini: true, drawnVersionIds: true } as const;

/** Le versioni che uno studente riceve da un compito (vedi
 * `estrazioneDelloStudente`), `null` se il compito non esiste. Nessun
 * controllo su iscrizione, ritiro o apertura: li fa chi chiama. */
export async function versioniDelloStudente(compitoId: string, studentId: string): Promise<string[] | null> {
  const compito = await prisma.compito.findUnique({ where: { id: compitoId }, select: selezioneVersioni });
  if (!compito) return null;
  return estrazioneDelloStudente(compito, studentId);
}

/** Le versioni di ogni iscritto ATTUALE alla classe del compito, studente →
 * versioni (per consegne, statistiche e stampa). Chi non ha ancora
 * un'estrazione la riceve ora (`estrazioniDegliStudenti`). Mappa vuota se il
 * compito non esiste. */
export async function versioniDiTuttiGliStudenti(compitoId: string): Promise<Map<string, string[]>> {
  const compito = await prisma.compito.findUnique({ where: { id: compitoId }, select: { ...selezioneVersioni, classeId: true } });
  if (!compito) return new Map();
  const iscritti = await prisma.classeStudente.findMany({ where: { classeId: compito.classeId }, select: { studentId: true } });
  const tutte = await estrazioniDegliStudenti([compito], iscritti.map((i) => i.studentId));
  return tutte.get(compito.id)!;
}
