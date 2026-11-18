import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import path from "path";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import { prisma } from "@/lib/db/client";
import { esercizioFileSchema, hashContenuto, type EsercizioFile } from "./format/schema";
import { CARTELLA_IMMAGINI, NOME_FILE_IMMAGINE } from "./immagini";

export interface RisultatoSeed { creati: number; aggiornati: number; invariati: number; lasciati: number }

/** `soloNuovi`: crea gli esercizi che mancano e lascia com'è ogni esercizio
 * già presente — versioni, titolo, argomento, etichette. È il modo sicuro su
 * un'installazione in uso: le versioni non registrano chi le ha scritte, e un
 * file cambiato sopra un esercizio corretto da un docente cancellerebbe la sua
 * correzione con una versione nuova. Senza l'opzione, il comportamento di
 * sempre (utile in sviluppo): un file cambiato aggiorna l'esercizio. */
export interface OpzioniSeed {
  soloNuovi?: boolean;
  /** Dove l'installazione tiene le immagini degli esercizi: la stessa
   * cartella in cui scrive la rotta di caricamento. Facoltativa, per i test. */
  cartellaImmagini?: string;
}

/** Le immagini che accompagnano gli esercizi pronti stanno accanto ai file,
 * in `<cartella>/immagini/`, col nome che avrebbero se le avesse caricate un
 * docente (un UUID). Il seed le copia nella cartella dei caricamenti
 * dell'installazione quando mancano: senza, un esercizio seminato su
 * un'installazione nuova mostrerebbe un'immagine rotta. */
const SOTTOCARTELLA_IMMAGINI = "immagini";

function cartellaImmaginiPredefinita(): string {
  return path.join(process.env.APP_ROOT || process.cwd(), "public", "uploads", CARTELLA_IMMAGINI);
}

/** I nomi delle immagini che il contenuto di un esercizio nomina (vedi
 * `testoVersoHtml`, immagini-testo.ts). */
function immaginiNominate(question: unknown): string[] {
  const nomi = new Set<string>();
  for (const m of JSON.stringify(question).matchAll(/data-savint-immagine=\\"([^"\\]+)\\"/g)) {
    nomi.add(m[1]!);
  }
  return [...nomi];
}

/** Un file dell'esercizio, già validato: involucro conforme allo schema e
 * contenuto caricabile dal motore. */
interface EsercizioValidato {
  nome: string;
  chiave: string;
  savint: EsercizioFile["savint"];
  question: unknown;
  hash: string;
  immagini: string[];
}

/** Legge e valida un file: l'involucro contro lo schema, il contenuto contro
 * il motore (l'unico giudice: se non lo carica, la domanda è rotta). Non
 * scrive nulla nel database. */
function valida(dir: string, nome: string, cartellaImmagini: string): EsercizioValidato {
  const grezzo: unknown = JSON.parse(readFileSync(path.join(dir, nome), "utf8"));
  const parsed = esercizioFileSchema.safeParse(grezzo);
  if (!parsed.success) {
    throw new Error(`${nome}: involucro SAVINT non valido — ${parsed.error.message}`);
  }
  const { savint, question } = parsed.data;

  try {
    loadQuestion(question as NumbasQuestionJSON, { seed: "verifica-seed" });
  } catch (e) {
    throw new Error(`${nome}: il motore non carica la domanda — ${e instanceof Error ? e.message : String(e)}`);
  }

  // Ogni immagine nominata deve arrivare da qualche parte: dalla cartella
  // degli esercizi pronti o, già presente, dai caricamenti.
  const immagini = immaginiNominate(question);
  for (const file of immagini) {
    if (!NOME_FILE_IMMAGINE.test(file)) {
      throw new Error(`${nome}: nome di immagine non valido — ${file}`);
    }
    if (!existsSync(path.join(dir, SOTTOCARTELLA_IMMAGINI, file)) && !existsSync(path.join(cartellaImmagini, file))) {
      throw new Error(`${nome}: manca l'immagine ${file} (attesa in ${SOTTOCARTELLA_IMMAGINI}/)`);
    }
  }

  return { nome, chiave: nome.replace(/\.json$/, ""), savint, question, hash: hashContenuto(question), immagini };
}

/** Carica gli esercizi da una cartella. Il nome del file, senza estensione, è
 * la chiave stabile dell'esercizio: rinominarlo crea un esercizio nuovo.
 *
 * La cartella si valida tutta prima di scrivere qualsiasi cosa: un file
 * rotto in fondo all'ordine alfabetico non deve lasciare a metà nel database
 * i file già validati prima di lui nello stesso giro. Si raccolgono tutti i
 * fallimenti della prima passata (invece di fermarsi al primo) così il
 * messaggio nomina ogni file rotto, non solo il primo incontrato; solo se
 * quella passata è completamente pulita si passa alla seconda, che scrive. */
export async function seedEsercizi(dir: string, opzioni: OpzioniSeed = {}): Promise<RisultatoSeed> {
  const nomi = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

  const cartellaImmagini = opzioni.cartellaImmagini ?? cartellaImmaginiPredefinita();
  const validati: EsercizioValidato[] = [];
  const errori: string[] = [];
  for (const nome of nomi) {
    try {
      validati.push(valida(dir, nome, cartellaImmagini));
    } catch (e) {
      errori.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (errori.length > 0) {
    throw new Error(errori.join("\n"));
  }

  const out: RisultatoSeed = { creati: 0, aggiornati: 0, invariati: 0, lasciati: 0 };

  // Le immagini prima delle righe: un esercizio scritto nel database deve
  // trovare le sue immagini già al loro posto. Anche per gli esercizi già
  // presenti — un volume dei caricamenti ricreato le avrebbe perse. Un file
  // già presente non si tocca.
  for (const file of new Set(validati.flatMap((v) => v.immagini))) {
    const destinazione = path.join(cartellaImmagini, file);
    if (existsSync(destinazione)) continue;
    mkdirSync(cartellaImmagini, { recursive: true });
    copyFileSync(path.join(dir, SOTTOCARTELLA_IMMAGINI, file), destinazione);
  }

  if (opzioni.soloNuovi) {
    const esistenti = new Set(
      (await prisma.esercizio.findMany({
        where: { id: { in: validati.map((v) => v.chiave) } },
        select: { id: true },
      })).map((e) => e.id),
    );
    for (let i = validati.length - 1; i >= 0; i--) {
      if (esistenti.has(validati[i]!.chiave)) {
        validati.splice(i, 1);
        out.lasciati++;
      }
    }
  }

  for (const { chiave, savint, question, hash } of validati) {
    const esercizio = await prisma.esercizio.upsert({
      where: { id: chiave },
      create: {
        id: chiave, title: savint.title, description: savint.description ?? null,
        yearLevel: savint.yearLevel, topic: savint.topic, tags: savint.tags, difficulty: savint.difficulty,
        // Il catalogo di partenza è della scuola: ogni docente lo può modificare.
        accessoScuola: "EDITOR",
      },
      update: {
        title: savint.title, description: savint.description ?? null,
        yearLevel: savint.yearLevel, topic: savint.topic, tags: savint.tags, difficulty: savint.difficulty,
      },
    });

    const ultima = await prisma.esercizioVersione.findFirst({
      where: { esercizioId: esercizio.id },
      orderBy: { version: "desc" },
    });

    if (!ultima) {
      await prisma.esercizioVersione.create({
        data: { esercizioId: esercizio.id, version: 1, content: question as object, hash },
      });
      out.creati++;
    } else if (ultima.hash !== hash) {
      await prisma.esercizioVersione.create({
        data: { esercizioId: esercizio.id, version: ultima.version + 1, content: question as object, hash },
      });
      out.aggiornati++;
    } else {
      out.invariati++;
    }
  }

  return out;
}
