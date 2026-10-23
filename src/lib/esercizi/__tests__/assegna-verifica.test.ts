import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { prisma } from "@/lib/db/client";
import { assegnaCompito, layoutDaBlocchi, type InputAssegna } from "../compiti";
import { caricaModello } from "../batterie";
import type { Blocco } from "../estrazione";

// Modalità verifica, Task 4: creare una verifica. Prefisso proprio (un
// blocco "argomento" o una raccolta interrogano tabelle condivise).
const P = "assegnaverificatest-";
const e = (n: number) => `${P}e${n}`;

let docenteId: string;
let classeId: string;
let raccoltaId: string;
let studenti: string[];

async function pulisci() {
  await prisma.compito.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.batteria.deleteMany({ where: { createdBy: { email: { startsWith: P } } } });
  await prisma.classe.deleteMany({ where: { googleGroupEmail: { startsWith: P } } });
  await prisma.contenitore.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
}

async function righe() {
  return {
    compiti: await prisma.compito.count({ where: { classeId } }),
    verifiche: await prisma.verifica.count({ where: { compito: { classeId } } }),
    batterie: await prisma.batteria.count({ where: { createdById: docenteId } }),
  };
}

beforeEach(async () => {
  await pulisci();
  docenteId = (await prisma.user.create({ data: { email: `${P}d@test.it`, name: "D", role: "TEACHER" } })).id;
  studenti = [];
  for (let i = 0; i < 2; i++) {
    studenti.push((await prisma.user.create({ data: { email: `${P}s${i}@test.it`, name: `S${i}`, role: "STUDENT" } })).id);
  }
  classeId = (await prisma.classe.create({ data: { name: "3B", yearLevel: 3, googleGroupEmail: `${P}3b@test.it` } })).id;
  await prisma.classeDocente.create({ data: { classeId, teacherId: docenteId } });
  await prisma.classeStudente.createMany({ data: studenti.map((studentId) => ({ classeId, studentId })) });

  const base = { topic: `${P}topic`, yearLevel: 3, tags: [], difficulty: 1, accessoScuola: "EDITOR" as const, authorId: docenteId };
  for (let n = 1; n <= 6; n++) await prisma.esercizio.create({ data: { id: e(n), title: `E${n}`, ...base } });
  await prisma.esercizioVersione.createMany({
    data: Array.from({ length: 6 }, (_, i) => ({ esercizioId: e(i + 1), version: 1, content: { i }, hash: `${P}h${i}` })),
  });
  raccoltaId = (await prisma.contenitore.create({ data: { name: `${P}Raccolta`, createdById: docenteId } })).id;
  await prisma.contenitoreEsercizio.createMany({ data: [1, 2, 3, 4].map((n) => ({ contenitoreId: raccoltaId, esercizioId: e(n) })) });
});

// Un blocco raccolta da 3 (2 per chi ha «meno esercizi», 2 punti l'uno) e un
// blocco scelti [e5, e6] con e6 escluso per i PDP.
const blocchiVerifica = (): Blocco[] => [
  { tipo: "raccolta", contenitoreId: raccoltaId, quanti: 3, quantiPdp: 2, punti: 2 },
  { tipo: "scelti", esercizioIds: [e(5), e(6)], nonPerPdp: [e(6)], punti: 1 },
];

const fra = (minuti: number) => new Date(Date.now() + minuti * 60_000);

const input = (over: Partial<InputAssegna>): InputAssegna => ({
  classeId,
  teacherId: docenteId,
  blocchi: blocchiVerifica(),
  modo: "CLASSE",
  seme: "seme-v",
  tipo: "VERIFICA",
  verifica: { durataMinuti: 50, calcolatrice: "SOLO_PDP", formulario: "NESSUNO" },
  ...over,
});

const layoutAtteso = () => [
  { quanti: 3, punti: 2, quantiPdp: 2, scelti: false, nonPerPdp: [] },
  { quanti: 2, punti: 1, quantiPdp: 1, scelti: true, nonPerPdp: [e(6)] },
];

describe("layoutDaBlocchi", () => {
  it("valori di default: punti 1, quantiPdp = quanti, nonPerPdp vuoto", () => {
    expect(
      layoutDaBlocchi(
        [
          { tipo: "argomento", argomento: "x", quanti: 4 },
          { tipo: "scelti", esercizioIds: ["a", "b", "c"] },
        ],
        [4, 3],
      ),
    ).toEqual([
      { quanti: 4, punti: 1, quantiPdp: 4, scelti: false, nonPerPdp: [] },
      { quanti: 3, punti: 1, quantiPdp: 3, scelti: true, nonPerPdp: [] },
    ]);
  });
});

describe("assegnaCompito — tipo VERIFICA", () => {
  it("modo CLASSE: Compito VERIFICA senza date e Verifica col layout dei blocchi", async () => {
    const avvio = fra(60);
    const esito = await assegnaCompito(input({ verifica: { durataMinuti: 50, avvioProgrammatoAt: avvio, calcolatrice: "TUTTI", formulario: "SOLO_PDP" } }));
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    const c = await prisma.compito.findUniqueOrThrow({ where: { id: esito.compitoId }, include: { verifica: true } });
    expect(c.tipo).toBe("VERIFICA");
    expect(c.opensAt).toBeNull();
    expect(c.dueAt).toBeNull();
    expect(c.drawnVersionIds).toHaveLength(5);
    expect(c.verifica).not.toBeNull();
    expect(c.verifica!.durataMinuti).toBe(50);
    expect(c.verifica!.avvioProgrammatoAt).toEqual(avvio);
    expect(c.verifica!.calcolatrice).toBe("TUTTI");
    expect(c.verifica!.formulario).toBe("SOLO_PDP");
    expect(c.verifica!.formularioFile).toBeNull();
    expect(c.verifica!.layout).toEqual(layoutAtteso());
  });

  it("modo STUDENTE: stessa verifica, bacini congelati e un'estrazione per iscritto", async () => {
    const esito = await assegnaCompito(input({ modo: "STUDENTE" }));
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    const c = await prisma.compito.findUniqueOrThrow({ where: { id: esito.compitoId }, include: { verifica: true } });
    expect(c.tipo).toBe("VERIFICA");
    expect(c.modo).toBe("STUDENTE");
    expect(c.bacini).not.toBeNull();
    expect(c.verifica!.layout).toEqual(layoutAtteso());
    const estrazioni = await prisma.estrazioneStudente.findMany({ where: { compitoId: c.id } });
    expect(estrazioni).toHaveLength(2);
    for (const x of estrazioni) expect(x.versionIds).toHaveLength(5);
  });

  it("nessun esercizio per chi ha «meno esercizi» ⇒ pdp_senza_esercizi, nessuna riga", async () => {
    const prima = await righe();
    const esito = await assegnaCompito(
      input({
        blocchi: [
          { tipo: "raccolta", contenitoreId: raccoltaId, quanti: 3, quantiPdp: 0 },
          { tipo: "scelti", esercizioIds: [e(5), e(6)], nonPerPdp: [e(5), e(6)] },
        ],
      }),
    );
    expect(esito).toMatchObject({ ok: false, motivo: "pdp_senza_esercizi" });
    expect(await righe()).toEqual(prima);
  });

  it("durata fuori intervallo o avvio nel passato ⇒ verifica_non_valida, nessuna riga", async () => {
    const prima = await righe();
    for (const verifica of [
      { durataMinuti: 0, calcolatrice: "NESSUNO" as const, formulario: "NESSUNO" as const },
      { durataMinuti: 301, calcolatrice: "NESSUNO" as const, formulario: "NESSUNO" as const },
      { durataMinuti: 50, avvioProgrammatoAt: fra(-5), calcolatrice: "NESSUNO" as const, formulario: "NESSUNO" as const },
    ]) {
      expect(await assegnaCompito(input({ verifica }))).toMatchObject({ ok: false, motivo: "verifica_non_valida" });
    }
    // Senza i dati della verifica, o con le date di un compito.
    expect(await assegnaCompito(input({ verifica: undefined }))).toMatchObject({ ok: false, motivo: "verifica_non_valida" });
    expect(await assegnaCompito(input({ dueAt: fra(600) }))).toMatchObject({ ok: false, motivo: "verifica_non_valida" });
    expect(await righe()).toEqual(prima);
  });

  it("nonPerPdp fuori dagli scelti o quantiPdp oltre quanti ⇒ blocchi_non_validi, nessuna riga", async () => {
    const prima = await righe();
    for (const blocchi of [
      [{ tipo: "scelti" as const, esercizioIds: [e(5)], nonPerPdp: [e(6)] }],
      [{ tipo: "raccolta" as const, contenitoreId: raccoltaId, quanti: 2, quantiPdp: 3 }],
    ]) {
      expect(await assegnaCompito(input({ blocchi }))).toMatchObject({ ok: false, motivo: "blocchi_non_validi" });
    }
    expect(await righe()).toEqual(prima);
  });

  describe("formulario", () => {
    let radice: string;
    let appRoot: string | undefined;
    beforeEach(() => {
      appRoot = process.env.APP_ROOT;
      radice = mkdtempSync(path.join(tmpdir(), "assegna-verifica-"));
      process.env.APP_ROOT = radice;
    });
    afterEach(() => {
      if (appRoot === undefined) delete process.env.APP_ROOT;
      else process.env.APP_ROOT = appRoot;
      rmSync(radice, { recursive: true, force: true });
    });

    const NOME = "0f3c2a1e-1b2c-4d5e-8f90-a1b2c3d4e5f6.pdf";

    it("un file che non esiste o un nome non valido ⇒ formulario_non_trovato", async () => {
      const prima = await righe();
      for (const formularioFile of [NOME, "../segreto.pdf"]) {
        const esito = await assegnaCompito(
          input({ verifica: { durataMinuti: 50, calcolatrice: "NESSUNO", formulario: "TUTTI", formularioFile } }),
        );
        expect(esito).toMatchObject({ ok: false, motivo: "formulario_non_trovato" });
      }
      expect(await righe()).toEqual(prima);
    });

    it("un file caricato si collega alla verifica", async () => {
      const cartella = path.join(radice, "public", "uploads", "privati", "formulari");
      mkdirSync(cartella, { recursive: true });
      writeFileSync(path.join(cartella, NOME), "%PDF-1.4 x");
      const esito = await assegnaCompito(
        input({ verifica: { durataMinuti: 50, calcolatrice: "NESSUNO", formulario: "TUTTI", formularioFile: NOME } }),
      );
      expect(esito.ok).toBe(true);
      if (!esito.ok) return;
      const v = await prisma.verifica.findUniqueOrThrow({ where: { compitoId: esito.compitoId } });
      expect(v.formularioFile).toBe(NOME);
    });
  });

  it("«Salva anche come modello» porta punti, quantiPdp e nonPerPdp nelle regole", async () => {
    const esito = await assegnaCompito(input({ salvaModello: { nome: `${P}modello` } }));
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    const c = await prisma.compito.findUniqueOrThrow({ where: { id: esito.compitoId } });
    const regole = await prisma.batteriaRegola.findMany({ where: { batteriaId: c.modelloId! }, orderBy: { order: "asc" } });
    expect(regole.map((r) => [r.punti, r.quantiPdp, r.nonPerPdp])).toEqual([
      [2, 2, []],
      [1, null, [e(6)]],
    ]);
    const modello = await caricaModello(c.modelloId!);
    expect(modello!.blocchi).toEqual(blocchiVerifica());
  });
});

describe("assegnaCompito — un compito normale ignora i campi della verifica", () => {
  it("stessi blocchi, tipo COMPITO, nessuna Verifica e regole senza punti", async () => {
    const esito = await assegnaCompito(input({ tipo: undefined, verifica: undefined, salvaModello: { nome: `${P}m2` } }));
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    const c = await prisma.compito.findUniqueOrThrow({ where: { id: esito.compitoId }, include: { verifica: true } });
    expect(c.tipo).toBe("COMPITO");
    expect(c.verifica).toBeNull();
    const regole = await prisma.batteriaRegola.findMany({ where: { batteriaId: { in: [c.batteriaId, c.modelloId!] } } });
    for (const r of regole) {
      expect(r.punti).toBeNull();
      expect(r.quantiPdp).toBeNull();
      expect(r.nonPerPdp).toEqual([]);
    }
  });
});
