import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { prisma } from "@/lib/db/client";
import { seedEsercizi } from "../seed";

// Prefisso unico di questo file: Vitest esegue i file di test in parallelo e
// più file toccano le stesse tabelle. Un `deleteMany()` senza filtro (come
// c'era qui prima) cancella anche le righe che un altro file sta scrivendo
// nello stesso istante — vedi `tentativo.test.ts`, che ci è cascato dentro.
// Filtrando ogni cancellazione e ogni asserzione su questo prefisso, il file
// possiede le proprie righe e non tocca quelle di nessun altro.
const PREFIX = "seedtest-";

function scriviEsercizio(dir: string, nome: string, titolo: string, question: unknown) {
  writeFileSync(path.join(dir, `${PREFIX}${nome}`), JSON.stringify({
    savint: { version: 1, title: titolo, yearLevel: 1, topic: "prova", tags: [], difficulty: 1 },
    question,
  }));
}

const domanda = { name: "Prova", statement: "<p>Quanto fa 1+1?</p>", variables: {}, parts: [
  { type: "numberentry", marks: 1, minValue: "2", maxValue: "2" },
] };

describe("seed degli esercizi", () => {
  beforeEach(async () => {
    // L'eliminazione a cascata (Esercizio → EsercizioVersione → Tentativo) è
    // a livello di database (vedi le migrazioni): basta cancellare Esercizio.
    // Questo file non crea comunque nessun Tentativo.
    await prisma.esercizio.deleteMany({ where: { id: { startsWith: PREFIX } } });
  });

  // La pulizia c'era solo PRIMA di ogni test: le righe dell'ultimo
  // sopravvivevano alla corsa e restavano nel database di sviluppo (vedi il
  // commento gemello in `tentativo.test.ts`, dove un esercizio residuo è
  // finito sotto gli occhi di uno studente).
  afterAll(async () => {
    await prisma.esercizio.deleteMany({ where: { id: { startsWith: PREFIX } } });
  });

  it("crea esercizio e prima versione", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "es-"));
    scriviEsercizio(dir, "01-prova.json", "Prova", domanda);
    const r = await seedEsercizi(dir);
    expect(r).toEqual({ creati: 1, aggiornati: 0, invariati: 0, lasciati: 0 });
    const versioni = await prisma.esercizioVersione.findMany({ where: { esercizioId: { startsWith: PREFIX } } });
    expect(versioni).toHaveLength(1);
    expect(versioni[0]!.version).toBe(1);
  });

  it("un secondo giro con lo stesso contenuto non crea versioni", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "es-"));
    scriviEsercizio(dir, "01-prova.json", "Prova", domanda);
    await seedEsercizi(dir);
    const r = await seedEsercizi(dir);
    expect(r).toEqual({ creati: 0, aggiornati: 0, invariati: 1, lasciati: 0 });
    expect(await prisma.esercizioVersione.count({ where: { esercizioId: { startsWith: PREFIX } } })).toBe(1);
  });

  it("un contenuto cambiato alza la versione e lascia la vecchia", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "es-"));
    scriviEsercizio(dir, "01-prova.json", "Prova", domanda);
    await seedEsercizi(dir);
    scriviEsercizio(dir, "01-prova.json", "Prova", { ...domanda, statement: "<p>Cambiato</p>" });
    const r = await seedEsercizi(dir);
    expect(r).toEqual({ creati: 0, aggiornati: 1, invariati: 0, lasciati: 0 });
    const versioni = await prisma.esercizioVersione.findMany({
      where: { esercizioId: { startsWith: PREFIX } },
      orderBy: { version: "asc" },
    });
    expect(versioni.map((v) => v.version)).toEqual([1, 2]);
  });

  // In un'installazione in uso un docente può aver corretto un esercizio
  // seminato: le versioni non registrano chi le ha scritte, quindi il seed non
  // sa distinguere una sua modifica da una versione vecchia del file. Con
  // `soloNuovi` crea quello che manca e non tocca niente di esistente —
  // né le versioni né titolo, argomento ed etichette.
  it("con soloNuovi crea solo gli esercizi che mancano e lascia intatti gli altri", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "es-"));
    scriviEsercizio(dir, "01-prova.json", "Prova", domanda);
    await seedEsercizi(dir);
    // Il docente ha cambiato l'argomento, e il file nel frattempo è cambiato.
    await prisma.esercizio.update({ where: { id: `${PREFIX}01-prova` }, data: { topic: "scelto dal docente" } });
    scriviEsercizio(dir, "01-prova.json", "Prova nuova", { ...domanda, statement: "<p>Cambiato</p>" });
    scriviEsercizio(dir, "02-nuovo.json", "Nuovo", domanda);

    const r = await seedEsercizi(dir, { soloNuovi: true });

    expect(r).toEqual({ creati: 1, aggiornati: 0, invariati: 0, lasciati: 1 });
    const esistente = await prisma.esercizio.findUniqueOrThrow({ where: { id: `${PREFIX}01-prova` } });
    expect(esistente.topic).toBe("scelto dal docente");
    expect(esistente.title).toBe("Prova");
    expect(await prisma.esercizioVersione.count({ where: { esercizioId: `${PREFIX}01-prova` } })).toBe(1);
    expect(await prisma.esercizioVersione.count({ where: { esercizioId: `${PREFIX}02-nuovo` } })).toBe(1);
  });

  it("rifiuta un file che il motore non sa caricare", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "es-"));
    scriviEsercizio(dir, "01-rotta.json", "Rotta", { name: "x", partsMode: "explore", parts: [] });
    await expect(seedEsercizi(dir)).rejects.toThrow(/01-rotta\.json/);
  });

  it("un file rotto non lascia scritti nel database i file gia' validati nello stesso giro", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "es-"));
    scriviEsercizio(dir, "01-buono.json", "Buono", domanda);
    scriviEsercizio(dir, "02-rotta.json", "Rotta", { name: "x", partsMode: "explore", parts: [] });
    await expect(seedEsercizi(dir)).rejects.toThrow(/02-rotta\.json/);
    expect(await prisma.esercizio.count({ where: { id: { startsWith: PREFIX } } })).toBe(0);
    expect(await prisma.esercizioVersione.count({ where: { esercizioId: { startsWith: PREFIX } } })).toBe(0);
  });
});
