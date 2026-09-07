import { z } from "zod";
import { createHash } from "crypto";

/** L'involucro SAVINT attorno a una domanda Numbas. Il contenuto della
 * domanda non viene interpretato qui: lo valida il motore al caricamento. */
export const esercizioFileSchema = z.object({
  savint: z.object({
    version: z.literal(1),
    title: z.string().min(1),
    description: z.string().optional(),
    yearLevel: z.number().int().min(1).max(5),
    topic: z.string().min(1),
    tags: z.array(z.string()),
    difficulty: z.number().int().min(1).max(3),
  }),
  question: z.unknown(),
});

export type EsercizioFile = z.infer<typeof esercizioFileSchema>;

/** Serializzazione stabile: le chiavi in ordine, così l'hash non cambia se
 * cambia solo l'ordine con cui sono scritte nel file. Esportata perché è
 * anche la base del confronto strutturale in editor/da-numbas.ts: la stessa
 * nozione di uguaglianza usata per l'hash, non una seconda scritta a mano. */
export function stabile(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stabile).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stabile(o[k])}`).join(",")}}`;
}

export function hashContenuto(question: unknown): string {
  return createHash("sha256").update(stabile(question)).digest("hex");
}
