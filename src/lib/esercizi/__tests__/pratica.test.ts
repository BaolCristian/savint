import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { chiaveArgomento } from "../accesso";
import { esercizioApribileDaStudente, eserciziPraticaLibera } from "../pratica";

// Prefisso proprio: il database di sviluppo è condiviso con le altre suite,
// e l'insieme "scuola" vede tutte le righe — si controllano solo i nostri id.
const P = "praticatest-";
let A: string;
let B: string;
let studente: string;
let studenteAltro: string;
let classe: string;
let classeAltra: string;
let batteria: string;

const base = { yearLevel: 2, tags: [], difficulty: 1 };

async function utente(nome: string, role: "TEACHER" | "STUDENT") {
  return (await prisma.user.create({ data: { email: `${P}${nome}@test.it`, name: nome, role } })).id;
}

// Un esercizio con una versione; restituisce gli id di entrambi.
async function esercizio(id: string, authorId: string, topic = "prova", accessoScuola?: "VISUALIZZATORE") {
  const e = await prisma.esercizio.create({ data: { id: `${P}${id}`, title: id, authorId, topic, accessoScuola, ...base } });
  const v = await prisma.esercizioVersione.create({
    data: { esercizioId: e.id, version: 1, content: { testo: id }, hash: `h-${P}${id}` },
  });
  return { esercizioId: e.id, versioneId: v.id };
}

async function compito(classeId: string, drawnVersionIds: string[], ritiratoAt: Date | null = null) {
  return prisma.compito.create({
    data: { batteriaId: batteria, classeId, assignedById: A, drawSeed: "s", drawnVersionIds, ritiratoAt },
  });
}

beforeEach(async () => {
  await prisma.compito.deleteMany({ where: { batteria: { name: { startsWith: P } } } });
  await prisma.batteria.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.classe.deleteMany({ where: { googleGroupEmail: { startsWith: P } } });
  await prisma.esercizioVersione.deleteMany({ where: { esercizio: { id: { startsWith: P } } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });

  A = await utente("a", "TEACHER");
  B = await utente("b", "TEACHER");
  studente = await utente("s1", "STUDENT");
  studenteAltro = await utente("s2", "STUDENT");
  classe = (await prisma.classe.create({ data: { googleGroupEmail: `${P}classe@scuola.it`, name: "C1" } })).id;
  classeAltra = (await prisma.classe.create({ data: { googleGroupEmail: `${P}altra@scuola.it`, name: "C2" } })).id;
  await prisma.classeStudente.create({ data: { classeId: classe, studentId: studente } });
  await prisma.classeStudente.create({ data: { classeId: classeAltra, studentId: studenteAltro } });
  batteria = (await prisma.batteria.create({ data: { name: `${P}batteria`, createdById: A } })).id;
});

describe("pratica libera degli studenti", () => {
  it("un esercizio privato avuto in un compito della propria classe si riapre", async () => {
    const privato = await esercizio("privato", A);
    await compito(classe, [privato.versioneId]);
    expect(await esercizioApribileDaStudente(studente, privato.esercizioId)).toBe(true);
    // Ma non entra nell'elenco libero.
    expect((await eserciziPraticaLibera()).has(privato.esercizioId)).toBe(false);
  });

  it("lo stesso esercizio privato non si apre per lo studente di un'altra classe", async () => {
    const privato = await esercizio("privato", A);
    await compito(classe, [privato.versioneId]);
    expect(await esercizioApribileDaStudente(studenteAltro, privato.esercizioId)).toBe(false);
  });

  it("un compito ritirato non conta: è come se non esistesse", async () => {
    const privato = await esercizio("privato", A);
    await compito(classe, [privato.versioneId], new Date());
    expect(await esercizioApribileDaStudente(studente, privato.esercizioId)).toBe(false);
  });

  it("un esercizio condiviso con la scuola per argomento è nella pratica libera", async () => {
    await prisma.condivisioneArgomento.create({
      data: { ownerId: A, chiave: chiaveArgomento("Frazioni"), argomento: "Frazioni", ruolo: "VISUALIZZATORE" },
    });
    const frazioni = await esercizio("frazioni", A, "Frazioni");
    expect((await eserciziPraticaLibera()).has(frazioni.esercizioId)).toBe(true);
    expect(await esercizioApribileDaStudente(studenteAltro, frazioni.esercizioId)).toBe(true);
  });

  it("un esercizio condiviso con la scuola direttamente è nella pratica libera", async () => {
    const aperto = await esercizio("aperto", A, "prova", "VISUALIZZATORE");
    expect((await eserciziPraticaLibera()).has(aperto.esercizioId)).toBe(true);
    expect(await esercizioApribileDaStudente(studente, aperto.esercizioId)).toBe(true);
  });

  it("un esercizio condiviso solo con B non è nella pratica libera e non si apre", async () => {
    const soloB = await esercizio("solo-b", A);
    await prisma.condivisioneEsercizio.create({ data: { esercizioId: soloB.esercizioId, userId: B, ruolo: "EDITOR" } });
    expect((await eserciziPraticaLibera()).has(soloB.esercizioId)).toBe(false);
    expect(await esercizioApribileDaStudente(studente, soloB.esercizioId)).toBe(false);
  });

  it("un esercizio che non esiste non si apre", async () => {
    expect(await esercizioApribileDaStudente(studente, `${P}inesistente`)).toBe(false);
  });
});
