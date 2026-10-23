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
 * versioni anche nel caso peggiore — tolti `count` esercizi per ogni blocco
 * precedente che lo tocca — quindi l'estrazione non può risultare corta,
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
  if (compito.modo === "CLASSE") return compito.drawnVersionIds;

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
