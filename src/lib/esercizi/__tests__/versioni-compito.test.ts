import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { assegnaCompito, compitoApribile, compitiDellaClasse, compitiDelloStudente, consegneDelCompito, type InputAssegna } from "../compiti";
import { versioniDelloStudente, versioniDiTuttiGliStudenti, estrazioneDaBaciniCongelati, type BacinoCongelato } from "../versioni-compito";
import { percorsoCompitoStudente } from "../percorso-compito";
import { esercizioApribileDaStudente } from "../pratica";
import { statisticheDelCompito, andamentoDellaClasse } from "../statistiche";
import { datiStampaCompito, fogliDiStampa } from "../stampa";

// Prefisso proprio di questo file: un blocco "argomento" interroga l'intera
// tabella Esercizio, quindi l'argomento deve essere unico (vedi il commento
// sul prefisso in assegna-diretto.test.ts).
const P = "versionicomp-";
const TOPIC = `${P}topic`;
const e = (n: number) => `${P}e${n}`;

let docenteId: string;
let classeId: string;
let studenti: string[];

async function pulisci() {
  await prisma.tentativo.deleteMany({ where: { student: { email: { startsWith: P } } } });
  await prisma.compito.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.batteria.deleteMany({ where: { createdBy: { email: { startsWith: P } } } });
  await prisma.classe.deleteMany({ where: { googleGroupEmail: { startsWith: P } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
}

beforeEach(async () => {
  await pulisci();
  docenteId = (await prisma.user.create({ data: { email: `${P}d@test.it`, name: "D", role: "TEACHER" } })).id;
  studenti = [];
  for (let i = 0; i < 5; i++) {
    studenti.push((await prisma.user.create({ data: { email: `${P}s${i}@test.it`, name: `S${i}`, role: "STUDENT" } })).id);
  }
  classeId = (await prisma.classe.create({ data: { name: "3B", yearLevel: 2, googleGroupEmail: `${P}3b@test.it` } })).id;
  await prisma.classeDocente.create({ data: { classeId, teacherId: docenteId } });
  await prisma.classeStudente.createMany({ data: studenti.map((studentId) => ({ classeId, studentId })) });

  // Sei esercizi della scuola, una versione ciascuno.
  const base = { yearLevel: 2, tags: [], difficulty: 1, accessoScuola: "EDITOR" as const, authorId: docenteId };
  for (let n = 1; n <= 6; n++) {
    await prisma.esercizio.create({ data: { id: e(n), title: `E${n}`, topic: TOPIC, ...base } });
  }
  await prisma.esercizioVersione.createMany({
    data: Array.from({ length: 6 }, (_, i) => ({ esercizioId: e(i + 1), version: 1, content: { i }, hash: `${P}h${i}` })),
  });
});

const input = (over: Partial<InputAssegna>): InputAssegna => ({
  classeId,
  teacherId: docenteId,
  blocchi: [{ tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 2 }],
  modo: "STUDENTE",
  seme: "seme-v",
  ...over,
});

async function assegna(over: Partial<InputAssegna> = {}) {
  const esito = await assegnaCompito(input(over));
  if (!esito.ok) throw new Error(esito.motivo);
  return prisma.compito.findUniqueOrThrow({ where: { id: esito.compitoId } });
}

async function nuovoStudente(nome: string) {
  const id = (await prisma.user.create({ data: { email: `${P}${nome}@test.it`, name: nome, role: "STUDENT" } })).id;
  await prisma.classeStudente.create({ data: { classeId, studentId: id } });
  return id;
}

async function esercizioDi(versioneId: string) {
  return (await prisma.esercizioVersione.findUniqueOrThrow({ where: { id: versioneId } })).esercizioId;
}

async function completa(studentId: string, compitoId: string, esercizioVersioneId: string, score = 10) {
  await prisma.tentativo.create({
    data: { studentId, compitoId, esercizioVersioneId, seed: "s", status: "COMPLETED", score, maxScore: 10 },
  });
}

describe("versioniDelloStudente", () => {
  it("STUDENTE: la stessa estrazione a due chiamate", async () => {
    const c = await assegna();
    const a = await versioniDelloStudente(c.id, studenti[0]!);
    const b = await versioniDelloStudente(c.id, studenti[0]!);
    expect(a).toHaveLength(2);
    expect(b).toEqual(a);
  });

  it("STUDENTE: chi si iscrive dopo pesca dal bacino congelato, anche se un esercizio del bacino è diventato privato", async () => {
    // Bacino = tutti e sei, se ne pescano sei: l'estrazione li contiene tutti.
    const c = await assegna({ blocchi: [{ tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 6 }] });
    await prisma.esercizio.update({ where: { id: e(1) }, data: { accessoScuola: null } });
    const tardivo = await nuovoStudente("tardivo");
    const v = await versioniDelloStudente(c.id, tardivo);
    expect(v).toHaveLength(6);
    const privata = (await prisma.esercizioVersione.findFirstOrThrow({ where: { esercizioId: e(1) } })).id;
    expect(v).toContain(privata);
    expect(v).toEqual(estrazioneDaBaciniCongelati(c.bacini as BacinoCongelato[], `seme-v:${tardivo}`));
  });

  it("STUDENTE: studenti diversi ricevono in generale estrazioni diverse", async () => {
    const c = await assegna();
    const estrazioni = await Promise.all(studenti.map((s) => versioniDelloStudente(c.id, s)));
    expect(new Set(estrazioni.map((x) => x!.join(","))).size).toBeGreaterThan(1);
  });

  it("CLASSE: sono drawnVersionIds", async () => {
    const c = await assegna({ modo: "CLASSE" });
    expect(c.drawnVersionIds).toHaveLength(2);
    expect(await versioniDelloStudente(c.id, studenti[0]!)).toEqual(c.drawnVersionIds);
  });

  it("compito inesistente ⇒ null", async () => {
    expect(await versioniDelloStudente(`${P}nessuno`, studenti[0]!)).toBeNull();
  });
});

describe("versioniDiTuttiGliStudenti", () => {
  it("STUDENTE: una voce per iscritto, uguale alla sua estrazione; chi manca viene calcolato e memorizzato", async () => {
    const c = await assegna();
    const tardivo = await nuovoStudente("tardivo");
    const tutte = await versioniDiTuttiGliStudenti(c.id);
    expect([...tutte.keys()].sort()).toEqual([...studenti, tardivo].sort());
    const salvata = await prisma.estrazioneStudente.findUniqueOrThrow({
      where: { compitoId_studentId: { compitoId: c.id, studentId: tardivo } },
    });
    expect(tutte.get(tardivo)).toEqual(salvata.versionIds);
    for (const s of studenti) expect(tutte.get(s)).toEqual(await versioniDelloStudente(c.id, s));
  });

  it("CLASSE: ogni iscritto ha drawnVersionIds", async () => {
    const c = await assegna({ modo: "CLASSE" });
    const tutte = await versioniDiTuttiGliStudenti(c.id);
    expect(tutte.size).toBe(studenti.length);
    for (const v of tutte.values()) expect(v).toEqual(c.drawnVersionIds);
    expect(await prisma.estrazioneStudente.count({ where: { compitoId: c.id } })).toBe(0);
  });
});

describe("le letture del compito nel modo STUDENTE", () => {
  it("compitoApribile apre solo le versioni dello studente", async () => {
    const c = await assegna();
    const mie = (await versioniDelloStudente(c.id, studenti[0]!))!;
    for (const v of mie) expect(await compitoApribile(c.id, studenti[0]!, await esercizioDi(v))).toBe(v);
    const altre = (await prisma.esercizioVersione.findMany({ where: { esercizioId: { startsWith: P } } }))
      .filter((v) => !mie.includes(v.id));
    expect(altre.length).toBe(4);
    for (const v of altre) expect(await compitoApribile(c.id, studenti[0]!, v.esercizioId)).toBeNull();
  });

  it("esercizioApribileDaStudente: l'eccezione del compito guarda le versioni dello studente", async () => {
    const c = await assegna();
    const tutte = await versioniDiTuttiGliStudenti(c.id);
    const mia = tutte.get(studenti[0]!)![0]!;
    const esercizio = await esercizioDi(mia);
    await prisma.esercizio.update({ where: { id: esercizio }, data: { accessoScuola: null } });
    expect(await esercizioApribileDaStudente(studenti[0]!, esercizio)).toBe(true);
    const senza = studenti.find((s) => !tutte.get(s)!.includes(mia));
    if (senza) expect(await esercizioApribileDaStudente(senza, esercizio)).toBe(false);
  });

  it("compitiDellaClasse: esercizi = somma dei count dei blocchi", async () => {
    await assegna({ blocchi: [{ tipo: "scelti", esercizioIds: [e(6)] }, { tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 2 }] });
    const [riga] = await compitiDellaClasse(classeId);
    expect(riga!.esercizi).toBe(3);
  });

  it("compitiDelloStudente, percorso e consegne usano le versioni dello studente", async () => {
    const c = await assegna();
    const mie = (await versioniDelloStudente(c.id, studenti[0]!))!;
    const titoli = await Promise.all(mie.map(async (v) =>
      (await prisma.esercizioVersione.findUniqueOrThrow({ where: { id: v }, include: { esercizio: true } })).esercizio.title));

    const [compito] = await compitiDelloStudente(studenti[0]!);
    expect(compito!.esercizi.map((x) => x.title)).toEqual(titoli);

    const percorso = await percorsoCompitoStudente(c.id, studenti[0]!);
    expect(percorso!.esercizi.map((x) => x.titolo)).toEqual(titoli);

    await completa(studenti[0]!, c.id, mie[0]!);
    const consegne = await consegneDelCompito(c.id, docenteId);
    if (!consegne.ok) throw new Error(consegne.motivo);
    expect(consegne.righe).toHaveLength(studenti.length);
    for (const r of consegne.righe) expect(r.totali).toBe(2);
    expect(consegne.righe.find((r) => r.studentId === studenti[0])!.fatti).toBe(1);
  });

  it("statistiche: una riga per versione estratta ad almeno uno studente, con assegnatoA", async () => {
    const c = await assegna();
    const tutte = await versioniDiTuttiGliStudenti(c.id);
    const conteggi = new Map<string, number>();
    for (const v of tutte.values()) for (const id of v) conteggi.set(id, (conteggi.get(id) ?? 0) + 1);
    const primo = tutte.get(studenti[0]!)![0]!;
    await completa(studenti[0]!, c.id, primo, 5);

    const esito = await statisticheDelCompito(c.id, docenteId);
    if (!esito.ok) throw new Error(esito.motivo);
    expect(esito.iscritti).toBe(studenti.length);
    expect(esito.righe).toHaveLength(conteggi.size);
    for (const r of esito.righe) {
      const versione = await prisma.esercizioVersione.findFirstOrThrow({ where: { esercizioId: r.esercizioId } });
      expect(r.assegnatoA).toBe(conteggi.get(versione.id));
    }
    const esercizioPrimo = await esercizioDi(primo);
    expect(esito.righe.find((r) => r.esercizioId === esercizioPrimo)).toMatchObject({ completati: 1, mediaPercentuale: 50 });
  });

  it("statistiche CLASSE: assegnatoA = iscritti", async () => {
    const c = await assegna({ modo: "CLASSE" });
    const esito = await statisticheDelCompito(c.id, docenteId);
    if (!esito.ok) throw new Error(esito.motivo);
    expect(esito.righe).toHaveLength(2);
    for (const r of esito.righe) expect(r.assegnatoA).toBe(studenti.length);
  });

  it("andamento della classe: gli attesi sono le coppie studente×esercizio davvero assegnate", async () => {
    const c = await assegna();
    const primo = (await versioniDelloStudente(c.id, studenti[0]!))![0]!;
    await completa(studenti[0]!, c.id, primo);
    const esito = await andamentoDellaClasse(classeId, docenteId);
    if (!esito.ok) throw new Error(esito.motivo);
    expect(esito.righe).toHaveLength(1);
    expect(esito.righe[0]).toMatchObject({ argomento: TOPIC, completate: 1, attese: studenti.length * 2 });
  });

  it("stampa: un foglio per studente con le sue versioni, anche se si chiedono versioni a file", async () => {
    const c = await assegna();
    const dati = (await datiStampaCompito(c.id, docenteId))!;
    expect(dati.modo).toBe("STUDENTE");
    const tutte = await versioniDiTuttiGliStudenti(c.id);
    for (const scelta of [{ tipo: "file", quante: 3 } as const, { tipo: "studenti" } as const]) {
      const fogli = fogliDiStampa(dati, scelta);
      expect(fogli).toHaveLength(studenti.length);
      for (const f of fogli) {
        expect(f.nominativo).toBe(true);
        const s = dati.studenti.find((x) => x.nome === f.etichetta)!;
        const attese = await Promise.all(tutte.get(s.id)!.map(async (v) => {
          const versione = await prisma.esercizioVersione.findUniqueOrThrow({ where: { id: v }, include: { esercizio: true } });
          return { titolo: versione.esercizio.title, content: versione.content };
        }));
        expect(f.esercizi).toEqual(attese);
      }
    }
  });
});
