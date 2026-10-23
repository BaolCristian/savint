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
const bloccoSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("argomento"),
    argomento: z.string().min(1).max(200),
    anno: z.number().int().min(1).max(5).optional(),
    difficoltaMax: z.number().int().min(1).max(3).optional(),
    quanti: z.number().int().positive().max(100),
  }),
  z.object({
    tipo: z.literal("raccolta"),
    contenitoreId: z.string().min(1).max(100),
    quanti: z.number().int().positive().max(100),
  }),
  z.object({
    tipo: z.literal("scelti"),
    esercizioIds: z.array(z.string().min(1).max(100)).max(200),
  }),
]);

export const blocchiSchema = z.array(bloccoSchema).max(30);

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
