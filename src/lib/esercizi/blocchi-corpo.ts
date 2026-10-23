import { z } from "zod";
import type { Blocco } from "./estrazione";

/** I blocchi del "Nuovo compito" come arrivano nel corpo di una richiesta
 * (rotte `compiti/estrai` e `compiti`, Task 3): una copia sola dello schema,
 * perché la pagina manda gli stessi blocchi a entrambe — prima per il
 * riepilogo, poi per assegnare — e una differenza fra le due convalide
 * renderebbe assegnabile qualcosa che il riepilogo non sa mostrare, o il
 * contrario.
 *
 * Qui solo la FORMA e dei tetti ragionevoli contro i corpi enormi; le
 * regole di dominio (scelti senza doppioni, quanti positivo) restano dove
 * sono già, in `rifiutoRegole` (batterie.ts), così che `assegnaCompito` le
 * applichi a qualunque chiamante. `quanti` positivo è comunque richiesto
 * anche qui: un riepilogo con "0 esercizi" non ha niente da mostrare. */
const QUANTI_MAX = 100;
const SCELTI_MAX = 200;
const BLOCCHI_MAX = 30;

/** Il compito più grande che questi tetti lasciano passare: ogni blocco al
 * suo massimo. È il tetto di `versioniViste` nella rotta `compiti`, che
 * deve poter contenere qualunque estrazione il riepilogo abbia mostrato —
 * un tetto più basso rifiuterebbe come corpo non valido un compito che il
 * riepilogo dava per assegnabile. */
export const TOTALE_MAX = BLOCCHI_MAX * Math.max(QUANTI_MAX, SCELTI_MAX);

const bloccoSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("argomento"),
    argomento: z.string().min(1).max(200),
    anno: z.number().int().min(1).max(5).optional(),
    difficoltaMax: z.number().int().min(1).max(3).optional(),
    quanti: z.number().int().positive().max(QUANTI_MAX),
  }),
  z.object({
    tipo: z.literal("raccolta"),
    contenitoreId: z.string().min(1).max(100),
    quanti: z.number().int().positive().max(QUANTI_MAX),
  }),
  z.object({
    tipo: z.literal("scelti"),
    esercizioIds: z.array(z.string().min(1).max(100)).max(SCELTI_MAX),
  }),
]);

export const blocchiSchema = z.array(bloccoSchema).max(BLOCCHI_MAX);

/** Il seme dell'estrazione: lo genera la pagina ("Estrai di nuovo" = seme
 * nuovo), qui serve solo che sia una stringa sensata. */
export const semeSchema = z.string().min(1).max(100);

/** I blocchi con l'anno della classe (ruling del Task 3, come
 * `compiti/diretto`): un blocco "argomento" senza `anno` prende
 * `yearLevel` della classe — si pesca per anno, mescolare anni diversi
 * sarebbe sbagliato. Un blocco che l'anno lo porta già lo tiene (un
 * modello composto per un altro anno resta quello). `null` se un blocco
 * argomento resta senza anno perché la classe non ne ha uno: la rotta
 * risponde `classe_senza_anno` (422), come `compiti/diretto`. */
export function blocchiConAnno(blocchi: Blocco[], yearLevel: number | null): Blocco[] | null {
  const pieni: Blocco[] = [];
  for (const b of blocchi) {
    if (b.tipo !== "argomento" || b.anno != null) {
      pieni.push(b);
      continue;
    }
    if (yearLevel == null) return null;
    pieni.push({ ...b, anno: yearLevel });
  }
  return pieni;
}
