import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { statisticheDelCompito, andamentoDellaClasse } from "../statistiche";

// Prefisso proprio di questo file (vedi il commento in seed.test.ts): i file
// di test girano in parallelo sullo stesso database, e ogni cancellazione
// qui sotto filtra su questo prefisso per non toccare righe di altri file.
const P = "statistichetest-";

let assegnatore: string;      // ha assegnato il compito E insegna la classe
let exAssegnatore: string;    // l'ha assegnato, ma non insegna più la classe
let estraneo: string;         // né l'una né l'altra cosa
let anna: string;
let bruno: string;
let carla: string;
let uscito: string;           // ha lavorato al compito, poi è uscito dalla classe
let classeId: string;
let altraClasseId: string;
let batteriaId: string;
// Tre esercizi: due di "frazioni", uno di "equazioni"; più un quarto MAI
// pescato dal compito, per i tentativi non pertinenti.
let v1: string;
let v2: string;
let v3: string;
let vFuori: string;

async function nuovoCompito(
  dati: { versioni?: string[]; assignedById?: string; classe?: string; ritirato?: boolean; apreIl?: Date } = {},
) {
  return (await prisma.compito.create({
    data: {
      batteriaId,
      classeId: dati.classe ?? classeId,
      assignedById: dati.assignedById ?? assegnatore,
      drawSeed: "seme",
      drawnVersionIds: dati.versioni ?? [v1, v2, v3],
      ritiratoAt: dati.ritirato ? new Date() : null,
      opensAt: dati.apreIl ?? null,
    },
  })).id;
}

async function tentativo(
  studentId: string,
  compitoId: string | null,
  esercizioVersioneId: string,
  dati: { status?: "IN_PROGRESS" | "COMPLETED" | "ABANDONED"; score?: number; maxScore?: number } = {},
) {
  await prisma.tentativo.create({
    data: {
      studentId,
      compitoId,
      esercizioVersioneId,
      seed: "s",
      status: dati.status ?? "COMPLETED",
      score: dati.score ?? 0,
      maxScore: dati.maxScore ?? 10,
    },
  });
}

async function esercizio(nome: string, topic: string) {
  const id = (await prisma.esercizio.create({
    data: { id: `${P}${nome}`, title: `Titolo ${nome}`, yearLevel: 2, topic, tags: [], difficulty: 1 },
  })).id;
  return (await prisma.esercizioVersione.create({
    data: { esercizioId: id, version: 1, content: { testo: nome }, hash: `h-${P}${nome}` },
  })).id;
}

beforeEach(async () => {
  await prisma.tentativo.deleteMany({ where: { student: { email: { startsWith: P } } } });
  await prisma.compito.deleteMany({ where: { batteria: { name: { startsWith: P } } } });
  await prisma.batteria.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.classeStudente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.classeDocente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.classe.deleteMany({ where: { googleGroupEmail: { startsWith: P } } });
  await prisma.esercizioVersione.deleteMany({ where: { esercizio: { id: { startsWith: P } } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });

  const utente = async (nome: string, role: "TEACHER" | "STUDENT") =>
    (await prisma.user.create({ data: { email: `${P}${nome}@test.it`, name: nome, role } })).id;
  assegnatore = await utente("assegnatore", "TEACHER");
  exAssegnatore = await utente("ex", "TEACHER");
  estraneo = await utente("estraneo", "TEACHER");
  anna = await utente("anna", "STUDENT");
  bruno = await utente("bruno", "STUDENT");
  carla = await utente("carla", "STUDENT");
  uscito = await utente("uscito", "STUDENT");

  classeId = (await prisma.classe.create({
    data: { googleGroupEmail: `${P}classe@scuola.it`, name: "Classe", yearLevel: 2 },
  })).id;
  altraClasseId = (await prisma.classe.create({
    data: { googleGroupEmail: `${P}altra@scuola.it`, name: "Altra", yearLevel: 2 },
  })).id;
  await prisma.classeDocente.create({ data: { classeId, teacherId: assegnatore } });
  await prisma.classeStudente.createMany({
    data: [anna, bruno, carla].map((studentId) => ({ classeId, studentId })),
  });

  batteriaId = (await prisma.batteria.create({ data: { name: `${P}batteria`, createdById: assegnatore } })).id;
  v1 = await esercizio("e1", "frazioni");
  v2 = await esercizio("e2", "frazioni");
  v3 = await esercizio("e3", "equazioni");
  vFuori = await esercizio("fuori", "frazioni");
});

describe("statisticheDelCompito", () => {
  it("per ogni esercizio, nell'ordine pescato: completati, iniziati senza completare, media percentuale", async () => {
    const id = await nuovoCompito();
    // e1: Anna 8/10, Bruno 6/10 completati, Carla niente → 2 completati, media 70%.
    await tentativo(anna, id, v1, { score: 8 });
    await tentativo(bruno, id, v1, { score: 6 });
    // e2: Anna in corso, Bruno ha abbandonato e basta → 0 completati, 2 iniziati.
    await tentativo(anna, id, v2, { status: "IN_PROGRESS", score: 3 });
    await tentativo(bruno, id, v2, { status: "ABANDONED" });

    const esito = await statisticheDelCompito(id, assegnatore);
    expect(esito).toEqual({
      ok: true,
      iscritti: 3,
      righe: [
        { esercizioId: `${P}e1`, titolo: "Titolo e1", argomento: "frazioni", completati: 2, iniziati: 0, mediaPercentuale: 70 },
        { esercizioId: `${P}e2`, titolo: "Titolo e2", argomento: "frazioni", completati: 0, iniziati: 2, mediaPercentuale: null },
        { esercizioId: `${P}e3`, titolo: "Titolo e3", argomento: "equazioni", completati: 0, iniziati: 0, mediaPercentuale: null },
      ],
    });
  });

  // La stessa regola di `consegneDelCompito`: rifare un esercizio già
  // consegnato apre un tentativo nuovo, e conta il migliore — uno studente
  // vale una volta sola, non una per tentativo.
  it("conta il migliore tentativo completato di ogni studente, una sola volta", async () => {
    const id = await nuovoCompito({ versioni: [v1] });
    await tentativo(anna, id, v1, { score: 2 });
    await tentativo(anna, id, v1, { score: 10 });
    await tentativo(anna, id, v1, { status: "IN_PROGRESS", score: 1 });
    await tentativo(bruno, id, v1, { score: 5 });

    const esito = await statisticheDelCompito(id, assegnatore);
    if (!esito.ok) throw new Error("atteso ok");
    // (100% + 50%) / 2, non (20% + 100% + 50%) / 3.
    expect(esito.righe[0]).toMatchObject({ completati: 2, iniziati: 0, mediaPercentuale: 75 });
  });

  // Il difetto del "5/3" (vedi `consegneDelCompito`): un tentativo che porta
  // questo `compitoId` ma su un esercizio mai pescato non è una consegna.
  // E un tentativo sullo stesso esercizio ma fuori dal compito (esercizio
  // libero, o di un altro compito) nemmeno.
  it("ignora i tentativi fuori da drawnVersionIds e quelli di altri compiti o liberi", async () => {
    const id = await nuovoCompito({ versioni: [v1] });
    const altro = await nuovoCompito({ versioni: [v1] });
    await tentativo(anna, id, vFuori, { score: 10 });
    await tentativo(bruno, altro, v1, { score: 10 });
    await tentativo(carla, null, v1, { score: 10 });

    const esito = await statisticheDelCompito(id, assegnatore);
    if (!esito.ok) throw new Error("atteso ok");
    expect(esito.righe).toHaveLength(1);
    expect(esito.righe[0]).toMatchObject({ esercizioId: `${P}e1`, completati: 0, iniziati: 0, mediaPercentuale: null });
  });

  it("conta solo gli studenti iscritti adesso: chi è uscito non pesa né sui numeri né sulla media", async () => {
    const id = await nuovoCompito({ versioni: [v1] });
    await prisma.classeStudente.create({ data: { classeId, studentId: uscito } });
    await tentativo(uscito, id, v1, { score: 0 });
    await tentativo(anna, id, v1, { score: 10 });
    await prisma.classeStudente.delete({ where: { classeId_studentId: { classeId, studentId: uscito } } });

    const esito = await statisticheDelCompito(id, assegnatore);
    if (!esito.ok) throw new Error("atteso ok");
    expect(esito.iscritti).toBe(3);
    expect(esito.righe[0]).toMatchObject({ completati: 1, mediaPercentuale: 100 });
  });

  it("un completamento con massimo zero conta come completato ma non entra nella media", async () => {
    const id = await nuovoCompito({ versioni: [v1] });
    await tentativo(anna, id, v1, { score: 0, maxScore: 0 });
    const esito = await statisticheDelCompito(id, assegnatore);
    if (!esito.ok) throw new Error("atteso ok");
    expect(esito.righe[0]).toMatchObject({ completati: 1, mediaPercentuale: null });
  });

  describe("autorizzazione: le regole di consegneDelCompito", () => {
    it("chi l'ha assegnato vede le statistiche anche se non insegna più la classe", async () => {
      const id = await nuovoCompito({ assignedById: exAssegnatore });
      expect((await statisticheDelCompito(id, exAssegnatore)).ok).toBe(true);
    });

    it("un docente estraneo riceve lo stesso 'non trovato' di un id inesistente", async () => {
      const id = await nuovoCompito();
      expect(await statisticheDelCompito(id, estraneo)).toEqual({ ok: false, motivo: "compito_non_trovato" });
      expect(await statisticheDelCompito(`${P}nessuno`, assegnatore)).toEqual({ ok: false, motivo: "compito_non_trovato" });
    });

    it("un compito ritirato è inesistente anche qui", async () => {
      const id = await nuovoCompito({ ritirato: true });
      expect(await statisticheDelCompito(id, assegnatore)).toEqual({ ok: false, motivo: "compito_non_trovato" });
    });
  });
});

describe("andamentoDellaClasse", () => {
  it("raggruppa per argomento tutti i compiti della classe, dal più debole", async () => {
    const c1 = await nuovoCompito({ versioni: [v1, v3] });
    const c2 = await nuovoCompito({ versioni: [v2] });
    // frazioni: 2 esercizi assegnati (e1 in c1, e2 in c2) × 3 iscritti = 6
    // coppie attese; completate: Anna e1 (100%), Bruno e1 (50%), Anna e2
    // (60%) → 3/6 = 50%, media 70%.
    await tentativo(anna, c1, v1, { score: 10 });
    await tentativo(bruno, c1, v1, { score: 5 });
    await tentativo(anna, c2, v2, { score: 6 });
    // equazioni: 1 esercizio × 3 = 3 attese; completate: Carla (20%) → 1/3.
    await tentativo(carla, c1, v3, { score: 2 });
    // In corso: non è un completamento.
    await tentativo(anna, c1, v3, { status: "IN_PROGRESS", score: 9 });

    const esito = await andamentoDellaClasse(classeId, assegnatore);
    expect(esito).toEqual({
      ok: true,
      classe: { id: classeId, nome: "Classe" },
      iscritti: 3,
      compiti: 2,
      righe: [
        { argomento: "equazioni", esercizi: 1, completate: 1, attese: 3, percentualeCompletamento: 33, mediaPercentuale: 20 },
        { argomento: "frazioni", esercizi: 2, completate: 3, attese: 6, percentualeCompletamento: 50, mediaPercentuale: 70 },
      ],
    });
  });

  it("lo stesso esercizio in due compiti conta due volte: sono due assegnazioni distinte", async () => {
    const c1 = await nuovoCompito({ versioni: [v1] });
    await nuovoCompito({ versioni: [v1] });
    await tentativo(anna, c1, v1, { score: 10 });
    const esito = await andamentoDellaClasse(classeId, assegnatore);
    if (!esito.ok) throw new Error("atteso ok");
    expect(esito.righe).toEqual([
      { argomento: "frazioni", esercizi: 2, completate: 1, attese: 6, percentualeCompletamento: 17, mediaPercentuale: 100 },
    ]);
  });

  // Un compito che si apre fra una settimana non è ancora stato visto da
  // nessuno: contarlo abbasserebbe il completamento di un argomento che la
  // classe sta facendo bene.
  it("un compito non ancora aperto non conta", async () => {
    await nuovoCompito({ versioni: [v1] });
    await nuovoCompito({ versioni: [v3], apreIl: new Date(Date.now() + 7 * 864e5) });
    const esito = await andamentoDellaClasse(classeId, assegnatore);
    if (!esito.ok) throw new Error("atteso ok");
    expect(esito.compiti).toBe(1);
    expect(esito.righe.map((r) => r.argomento)).toEqual(["frazioni"]);
  });

  it("un compito ritirato non conta, nemmeno con i tentativi già svolti", async () => {
    await nuovoCompito({ versioni: [v1] });
    const ritirato = await nuovoCompito({ versioni: [v3], ritirato: true });
    await tentativo(anna, ritirato, v3, { score: 10 });
    const esito = await andamentoDellaClasse(classeId, assegnatore);
    if (!esito.ok) throw new Error("atteso ok");
    expect(esito.compiti).toBe(1);
    expect(esito.righe.map((r) => r.argomento)).toEqual(["frazioni"]);
  });

  it("ignora tentativi fuori da drawnVersionIds, di altre classi e di studenti non più iscritti", async () => {
    const c1 = await nuovoCompito({ versioni: [v1] });
    const altrove = await nuovoCompito({ versioni: [v1], classe: altraClasseId });
    await tentativo(anna, c1, vFuori, { score: 10 });
    await tentativo(bruno, altrove, v1, { score: 10 });
    await prisma.classeStudente.create({ data: { classeId, studentId: uscito } });
    await tentativo(uscito, c1, v1, { score: 10 });
    await prisma.classeStudente.delete({ where: { classeId_studentId: { classeId, studentId: uscito } } });

    const esito = await andamentoDellaClasse(classeId, assegnatore);
    if (!esito.ok) throw new Error("atteso ok");
    expect(esito.righe).toEqual([
      { argomento: "frazioni", esercizi: 1, completate: 0, attese: 3, percentualeCompletamento: 0, mediaPercentuale: null },
    ]);
  });

  // Il caso che il filtro sull'unione delle versioni (nella query) non
  // ferma: v3 è pescata da un ALTRO compito della stessa classe, ma il
  // tentativo porta il `compitoId` del primo, che v3 non l'ha mai pescata.
  it("un tentativo su una versione pescata da un altro compito della classe non conta per il proprio", async () => {
    const c1 = await nuovoCompito({ versioni: [v1] });
    await nuovoCompito({ versioni: [v3] });
    await tentativo(anna, c1, v3, { score: 10 });
    const esito = await andamentoDellaClasse(classeId, assegnatore);
    if (!esito.ok) throw new Error("atteso ok");
    expect(esito.righe.find((r) => r.argomento === "equazioni")).toMatchObject({ completate: 0, mediaPercentuale: null });
  });

  it("senza compiti l'elenco è vuoto", async () => {
    const esito = await andamentoDellaClasse(classeId, assegnatore);
    expect(esito).toMatchObject({ ok: true, compiti: 0, righe: [] });
  });

  describe("autorizzazione: le regole di verificaInsegnaClasse", () => {
    it("chi non insegna la classe non la vede, anche se ci ha assegnato un compito", async () => {
      await nuovoCompito({ assignedById: exAssegnatore });
      expect(await andamentoDellaClasse(classeId, exAssegnatore)).toEqual({ ok: false, motivo: "non_trovata" });
      expect(await andamentoDellaClasse(classeId, estraneo)).toEqual({ ok: false, motivo: "non_trovata" });
    });

    it("una classe inesistente ha la stessa risposta di una non insegnata", async () => {
      expect(await andamentoDellaClasse(`${P}nessuna`, assegnatore)).toEqual({ ok: false, motivo: "non_trovata" });
    });
  });
});
