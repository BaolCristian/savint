import { z } from "zod";

/** Testo semplice con formule fra `\( \)`: mai marcatori HTML. Il player
 * rende questo testo com'è nella pagina di ogni studente della scuola, quindi
 * un `<` o `>` qui non è un errore di battitura tollerabile: è HTML che
 * finirebbe iniettato. Lo schema è anche la validazione delle rotte, non solo
 * dell'interfaccia, quindi il rifiuto vive qui e non nel form. */
const testoSenzaMarcatori = (messaggio: string) =>
  z.string().refine((v) => !v.includes("<") && !v.includes(">"), {
    message: `${messaggio}: niente marcatori HTML, scrivi le formule fra \\( \\) invece.`,
  });

const identificatore = z
  .string()
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "nome di variabile non valido: deve essere un identificatore");

export type Tolleranza =
  | { tipo: "esatta" }
  | { tipo: "margine"; margine: string } // espressione JME, es. "0.01"
  | { tipo: "decimali"; cifre: number }; // 0..6

const tolleranzaSchema: z.ZodType<Tolleranza> = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("esatta") }),
  z.object({ tipo: z.literal("margine"), margine: z.string().min(1) }),
  z.object({ tipo: z.literal("decimali"), cifre: z.number().int().min(0).max(6) }),
]);

export type ParteEditor =
  | { tipo: "numerica"; consegna: string; punti: number; valore: string; tolleranza: Tolleranza }
  | {
      tipo: "scelta";
      consegna: string;
      punti: number;
      risposte: string[];
      indiceGiusta: number;
      // Il commento che lo studente legge dopo aver scelto una risposta
      // sbagliata (il campo `distractors` di Numbas): una voce per ogni
      // risposta, "" quando il docente non ne ha scritto uno. Campo
      // opzionale — assente equivale a nessuna spiegazione per nessuna
      // risposta — così le parti a scelta scritte prima di questo campo
      // restano valide senza doverlo aggiungere ovunque.
      spiegazioni?: string[];
    }
  | { tipo: "espressione"; consegna: string; punti: number; risposta: string };

/** Una parte da zero punti non ha senso in un esercizio: per una parte a
 * scelta multipla produrrebbe una matrice di marcatura tutta a zero, e la
 * posizione della risposta giusta smetterebbe di essere ricostruibile dal
 * file (vedi da-numbas.ts). Ogni parte vale quindi almeno un punto. */
const puntiSchema = z.number().min(1, "ogni parte deve valere almeno un punto");

const parteNumericaSchema = z.object({
  tipo: z.literal("numerica"),
  consegna: testoSenzaMarcatori("consegna"),
  punti: puntiSchema,
  valore: z.string().min(1),
  tolleranza: tolleranzaSchema,
});

const parteSceltaSchema = z
  .object({
    tipo: z.literal("scelta"),
    consegna: testoSenzaMarcatori("consegna"),
    punti: puntiSchema,
    risposte: z.array(testoSenzaMarcatori("risposta")).min(2).max(6),
    indiceGiusta: z.number().int().nonnegative(),
    spiegazioni: z.array(testoSenzaMarcatori("spiegazione")).optional(),
  })
  .refine((v) => v.indiceGiusta < v.risposte.length, {
    message: "indiceGiusta deve indicare una risposta fra quelle elencate",
    path: ["indiceGiusta"],
  })
  .refine((v) => v.spiegazioni === undefined || v.spiegazioni.length === v.risposte.length, {
    message: "spiegazioni, se presente, deve avere una voce per ogni risposta",
    path: ["spiegazioni"],
  });

const parteEspressioneSchema = z.object({
  tipo: z.literal("espressione"),
  consegna: testoSenzaMarcatori("consegna"),
  punti: puntiSchema,
  risposta: z.string().min(1),
});

const parteEditorSchema: z.ZodType<ParteEditor> = z.union([
  parteNumericaSchema,
  parteSceltaSchema,
  parteEspressioneSchema,
]);

export type VariabileEditor = {
  nome: string;
  definizione: string;
  descrizione: string;
};

const variabileEditorSchema: z.ZodType<VariabileEditor> = z.object({
  nome: identificatore,
  definizione: z.string().min(1),
  descrizione: testoSenzaMarcatori("descrizione della variabile"),
});

export type EsercizioEditor = {
  meta: {
    titolo: string;
    descrizione: string;
    anno: number;
    argomento: string;
    tag: string[];
    difficolta: number;
  };
  testo: string; // la consegna generale (statement)
  suggerimento: string; // advice, "" se assente
  variabili: VariabileEditor[];
  condizione: string; // variablesTest.condition, "" se assente
  parti: ParteEditor[]; // almeno una
};

export const esercizioEditorSchema: z.ZodType<EsercizioEditor> = z.object({
  meta: z.object({
    titolo: z.string().min(1),
    descrizione: z.string(),
    anno: z.number().int().min(1).max(5),
    argomento: z.string().min(1),
    tag: z.array(z.string()),
    difficolta: z.number().int().min(1).max(3),
  }),
  testo: testoSenzaMarcatori("testo"),
  suggerimento: testoSenzaMarcatori("suggerimento"),
  variabili: z.array(variabileEditorSchema),
  condizione: z.string(),
  parti: z.array(parteEditorSchema).min(1),
});
