import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { assegnaCompito, type DatiVerifica } from "../compiti";
import { MISURE_VUOTE } from "../misure-pdp";
import { GRAZIA_MS } from "../verifica-regole";
import {
  aggiungiMinuti,
  avviaRecupero,
  avviaVerifica,
  chiudiRecupero,
  chiudiVerifica,
  misureDellaVerifica,
  modificaVerificaPreparata,
  monitoraggioVerifica,
  recuperabile,
  salvaMisureVerifica,
  scadenzaDellaProva,
  sincronizzaVerifica,
} from "../verifiche";

// Modalità verifica, Task 5: ciclo di vita (avvio, consegne, chiusura,
// minuti, recuperi) e monitoraggio del docente. Ogni funzione che dipende
// dal tempo riceve `ora` esplicita.
const P = "verifichetest-";
const e = (n: number) => `${P}e${n}`;
const MIN = 60_000;

let docenteId: string;
let estraneoId: string;
let classeId: string;
let studenti: string[];

async function pulisci() {
  await prisma.compito.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.batteria.deleteMany({ where: { createdBy: { email: { startsWith: P } } } });
  await prisma.classe.deleteMany({ where: { googleGroupEmail: { startsWith: P } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
}

beforeEach(async () => {
  await pulisci();
  docenteId = (await prisma.user.create({ data: { email: `${P}d@test.it`, name: "D", role: "TEACHER" } })).id;
  estraneoId = (await prisma.user.create({ data: { email: `${P}x@test.it`, name: "X", role: "TEACHER" } })).id;
  studenti = [];
  for (let i = 0; i < 3; i++) {
    studenti.push((await prisma.user.create({ data: { email: `${P}s${i}@test.it`, name: `S${i}`, role: "STUDENT" } })).id);
  }
  classeId = (await prisma.classe.create({ data: { name: "3B", yearLevel: 3, googleGroupEmail: `${P}3b@test.it` } })).id;
  await prisma.classeDocente.create({ data: { classeId, teacherId: docenteId } });
  await prisma.classeStudente.createMany({ data: studenti.map((studentId) => ({ classeId, studentId })) });

  const base = { topic: `${P}topic`, yearLevel: 3, tags: [], difficulty: 1, accessoScuola: "EDITOR" as const, authorId: docenteId };
  for (let n = 1; n <= 3; n++) await prisma.esercizio.create({ data: { id: e(n), title: `E${n}`, ...base } });
  await prisma.esercizioVersione.createMany({
    data: [1, 2, 3].map((n) => ({ esercizioId: e(n), version: 1, content: { n }, hash: `${P}h${n}` })),
  });
});

afterAll(pulisci);

async function creaVerifica(over: Partial<DatiVerifica> = {}): Promise<string> {
  const esito = await assegnaCompito({
    classeId,
    teacherId: docenteId,
    blocchi: [{ tipo: "scelti", esercizioIds: [e(1), e(2), e(3)], nonPerPdp: [e(3)] }],
    modo: "CLASSE",
    seme: "seme-v",
    tipo: "VERIFICA",
    verifica: { durataMinuti: 60, calcolatrice: "SOLO_PDP", formulario: "NESSUNO", ...over },
  });
  if (!esito.ok) throw new Error(esito.motivo);
  return esito.compitoId;
}

// Un'ora fissa lontana dal presente: niente nei test dipende dall'orologio.
const T0 = new Date("2030-01-10T10:00:00Z");
const dopo = (minuti: number, da = T0) => new Date(da.getTime() + minuti * MIN);

const stato = (compitoId: string, ora: Date) => sincronizzaVerifica(compitoId, ora).then((v) => v?.stato);

/** Uno studente entra nella prova (in attesa del Task 6): la riga con
 * `entrataAt`, le posizioni e un tentativo per esercizio. */
async function entra(compitoId: string, studentId: string, quando: Date) {
  const compito = await prisma.compito.findUniqueOrThrow({ where: { id: compitoId } });
  const prova = await prisma.provaVerifica.upsert({
    where: { compitoId_studentId: { compitoId, studentId } },
    create: { compitoId, studentId, entrataAt: quando, posizioni: [0, 1, 2] },
    update: { entrataAt: quando, posizioni: [0, 1, 2] },
  });
  for (const [k, esercizioVersioneId] of compito.drawnVersionIds.entries()) {
    await prisma.tentativo.create({
      data: { studentId, esercizioVersioneId, compitoId, provaId: prova.id, seed: `seme-${studentId}-${k}` },
    });
  }
  return prova;
}

const statoRisposto = {
  seed: "s", answered: true, submitted: 1, adviceDisplayed: false, revealed: false, score: 0, marks: 1,
  parts: [{ path: "p0", answered: true, score: 0, marks: 1, answer: "3" }],
};

describe("sincronizzaVerifica — avvio programmato", () => {
  it("avviataAt = orario programmato, non l'ora della lettura; due letture concorrenti copiano le misure una volta", async () => {
    const programmato = new Date(Math.ceil((Date.now() + 60 * MIN) / 1000) * 1000);
    const id = await creaVerifica({ avvioProgrammatoAt: programmato });
    await prisma.misurePdp.create({ data: { classeId, studentId: studenti[0]!, tempoExtraPct: 30 } });

    expect(await stato(id, dopo(-1, programmato))).toBe("PREPARATA");

    const lettura = dopo(1, programmato);
    const [a, b] = await Promise.all([sincronizzaVerifica(id, lettura), sincronizzaVerifica(id, lettura)]);
    expect(a!.stato).toBe("IN_CORSO");
    expect(b!.stato).toBe("IN_CORSO");
    expect(a!.avviataAt).toEqual(programmato);
    const v = await prisma.verifica.findUniqueOrThrow({ where: { compitoId: id } });
    expect(v.avviataAt).toEqual(programmato);
    const prove = await prisma.provaVerifica.findMany({ where: { compitoId: id } });
    expect(prove).toHaveLength(1);
    expect(prove[0]).toMatchObject({ studentId: studenti[0], tempoExtraPct: 30 });
  });

  it("null per un id inesistente, un compito normale o una verifica ritirata", async () => {
    expect(await sincronizzaVerifica("nessuno", T0)).toBeNull();
    const id = await creaVerifica();
    await prisma.compito.update({ where: { id }, data: { ritiratoAt: T0 } });
    expect(await sincronizzaVerifica(id, T0)).toBeNull();
  });
});

describe("avviaVerifica e misure PDP", () => {
  it("copia le misure dei soli iscritti con MisurePdp; una riga vuota creata in PREPARATA resta vuota; le misure di classe dopo l'avvio non cambiano la prova", async () => {
    const id = await creaVerifica();
    await prisma.misurePdp.createMany({
      data: [
        { classeId, studentId: studenti[0]!, tempoExtraPct: 30, calcolatrice: true },
        { classeId, studentId: studenti[1]!, menoEsercizi: true },
      ],
    });
    expect(await salvaMisureVerifica(id, docenteId, studenti[1]!, MISURE_VUOTE)).toEqual({ ok: true });

    expect(await avviaVerifica(id, docenteId, T0)).toEqual({ ok: true });
    expect(await avviaVerifica(id, docenteId, T0)).toEqual({ ok: false, motivo: "stato_non_valido" });

    const prove = await prisma.provaVerifica.findMany({ where: { compitoId: id }, orderBy: { studentId: "asc" } });
    const per = new Map(prove.map((p) => [p.studentId, p]));
    expect(prove).toHaveLength(2);
    expect(per.get(studenti[0]!)).toMatchObject({ tempoExtraPct: 30, calcolatrice: true, menoEsercizi: false });
    expect(per.get(studenti[1]!)).toMatchObject({ tempoExtraPct: 0, menoEsercizi: false, calcolatrice: false, formulario: false });
    expect(per.has(studenti[2]!)).toBe(false);

    await prisma.misurePdp.update({
      where: { classeId_studentId: { classeId, studentId: studenti[0]! } },
      data: { tempoExtraPct: 50 },
    });
    const p0 = await prisma.provaVerifica.findUniqueOrThrow({ where: { id: per.get(studenti[0]!)!.id } });
    expect(p0.tempoExtraPct).toBe(30);
    const v = await sincronizzaVerifica(id, dopo(1));
    expect(scadenzaDellaProva(v!, p0)).toEqual(dopo(78));

    expect(await salvaMisureVerifica(id, docenteId, studenti[2]!, MISURE_VUOTE)).toEqual({ ok: false, motivo: "stato_non_valido" });
  });

  it("misureDellaVerifica: iscritti con misure di classe o riga di prova, `personalizzate` se c'è la riga", async () => {
    const id = await creaVerifica();
    await prisma.misurePdp.create({ data: { classeId, studentId: studenti[0]!, tempoExtraPct: 30 } });
    await prisma.misurePdp.create({ data: { classeId, studentId: studenti[1]!, formulario: true } });
    await salvaMisureVerifica(id, docenteId, studenti[1]!, { ...MISURE_VUOTE, calcolatrice: true });

    const elenco = await misureDellaVerifica(id, docenteId);
    expect(elenco).toEqual([
      { studentId: studenti[0], nome: "S0", misure: { ...MISURE_VUOTE, tempoExtraPct: 30 }, personalizzate: false },
      { studentId: studenti[1], nome: "S1", misure: { ...MISURE_VUOTE, calcolatrice: true }, personalizzate: true },
    ]);
    expect(await misureDellaVerifica(id, estraneoId)).toBeNull();
    expect(await salvaMisureVerifica(id, estraneoId, studenti[0]!, MISURE_VUOTE)).toEqual({ ok: false, motivo: "non_trovata" });
    expect(await salvaMisureVerifica(id, docenteId, docenteId, MISURE_VUOTE)).toEqual({ ok: false, motivo: "studenti_non_validi" });
    expect(await salvaMisureVerifica(id, docenteId, studenti[0]!, { ...MISURE_VUOTE, tempoExtraPct: 500 })).toEqual({
      ok: false,
      motivo: "valore_non_valido",
    });
  });
});

describe("scadenze", () => {
  it("durata 60, prova al 30 %, 5 minuti a tutti ⇒ avvio + 83 min; recupero alle 12:00 ⇒ 13:18 senza i 5 di tutti", async () => {
    const id = await creaVerifica();
    await avviaVerifica(id, docenteId, T0);
    expect(await aggiungiMinuti(id, docenteId, 5, undefined, dopo(1))).toEqual({ ok: true });
    const v = (await sincronizzaVerifica(id, dopo(2)))!;
    expect(v.minutiExtra).toBe(5);
    expect(scadenzaDellaProva(v, { inizioAt: null, recupero: false, tempoExtraPct: 30, minutiExtra: 0 })).toEqual(dopo(83));
    const dodici = new Date("2030-01-10T12:00:00Z");
    expect(scadenzaDellaProva(v, { inizioAt: dodici, recupero: true, tempoExtraPct: 30, minutiExtra: 0 })).toEqual(
      new Date("2030-01-10T13:18:00Z"),
    );
  });

  it("null prima dell'avvio", async () => {
    const id = await creaVerifica();
    const v = (await sincronizzaVerifica(id, T0))!;
    expect(scadenzaDellaProva(v, { inizioAt: null, recupero: false, tempoExtraPct: 0, minutiExtra: 0 })).toBeNull();
  });
});

describe("consegna e chiusura automatiche", () => {
  it("dopo scadenza + 29 s la prova è aperta, dopo + 31 s è consegnata alla scadenza, automatica, tentativi COMPLETED", async () => {
    const id = await creaVerifica();
    await avviaVerifica(id, docenteId, T0);
    const prova = await entra(id, studenti[0]!, dopo(1));
    const scadenza = dopo(60);

    await sincronizzaVerifica(id, new Date(scadenza.getTime() + 29_000));
    expect((await prisma.provaVerifica.findUniqueOrThrow({ where: { id: prova.id } })).consegnataAt).toBeNull();

    await sincronizzaVerifica(id, new Date(scadenza.getTime() + 31_000));
    const p = await prisma.provaVerifica.findUniqueOrThrow({ where: { id: prova.id }, include: { tentativi: true } });
    expect(p.consegnataAt).toEqual(scadenza);
    expect(p.consegnaAutomatica).toBe(true);
    expect(p.tentativi).toHaveLength(3);
    for (const t of p.tentativi) {
      expect(t.status).toBe("COMPLETED");
      expect(t.completedAt).toEqual(scadenza);
    }
  });

  it("tutti consegnati ⇒ CHIUSA", async () => {
    const id = await creaVerifica();
    await avviaVerifica(id, docenteId, T0);
    for (const s of studenti) {
      const p = await entra(id, s, dopo(1));
      await prisma.provaVerifica.update({ where: { id: p.id }, data: { consegnataAt: dopo(10) } });
    }
    const v = await sincronizzaVerifica(id, dopo(11));
    expect(v!.stato).toBe("CHIUSA");
    expect(v!.chiusaAt).toEqual(dopo(11));
  });

  it("un iscritto mai entrato senza misure ⇒ CHIUSA solo dopo avvio + durata + grazia", async () => {
    const id = await creaVerifica();
    await avviaVerifica(id, docenteId, T0);
    for (const s of studenti.slice(0, 2)) {
      const p = await entra(id, s, dopo(1));
      await prisma.provaVerifica.update({ where: { id: p.id }, data: { consegnataAt: dopo(10) } });
    }
    expect(await stato(id, dopo(30))).toBe("IN_CORSO");
    expect(await stato(id, new Date(dopo(60).getTime() + GRAZIA_MS - 1000))).toBe("IN_CORSO");
    const v = await sincronizzaVerifica(id, new Date(dopo(60).getTime() + GRAZIA_MS + 1000));
    expect(v!.stato).toBe("CHIUSA");
    expect(v!.chiusaAt).toEqual(dopo(60));
  });
});

describe("chiudiVerifica", () => {
  it("consegna anche chi ha tempo extra residuo, che conTempoResiduo contava prima", async () => {
    const id = await creaVerifica();
    await prisma.misurePdp.create({ data: { classeId, studentId: studenti[0]!, tempoExtraPct: 50 } });
    await avviaVerifica(id, docenteId, T0);
    const prova = await entra(id, studenti[0]!, dopo(1));

    const m = (await monitoraggioVerifica(id, docenteId, dopo(70)))!;
    expect(m.conTempoResiduo).toBe(1);
    expect(m.righe.find((r) => r.studentId === studenti[0])).toMatchObject({ stato: "in_corso", secondiResidui: 20 * 60 });

    expect(await chiudiVerifica(id, docenteId, dopo(71))).toEqual({ ok: true });
    const p = await prisma.provaVerifica.findUniqueOrThrow({ where: { id: prova.id }, include: { tentativi: true } });
    expect(p.consegnataAt).toEqual(dopo(71));
    expect(p.consegnaAutomatica).toBe(true);
    expect(p.tentativi.every((t) => t.status === "COMPLETED")).toBe(true);
    expect(await stato(id, dopo(72))).toBe("CHIUSA");
    expect(await chiudiVerifica(id, docenteId, dopo(72))).toEqual({ ok: false, motivo: "stato_non_valido" });
    expect((await monitoraggioVerifica(id, docenteId, dopo(72)))!.conTempoResiduo).toBe(0);
  });

  it("in PREPARATA ⇒ stato_non_valido; docente estraneo ⇒ non_trovata", async () => {
    const id = await creaVerifica();
    expect(await chiudiVerifica(id, docenteId, T0)).toEqual({ ok: false, motivo: "stato_non_valido" });
    expect(await avviaVerifica(id, estraneoId, T0)).toEqual({ ok: false, motivo: "non_trovata" });
  });
});

describe("aggiungiMinuti", () => {
  it("a uno studente sposta solo la sua scadenza; a tutti tutte, non i recuperi; su prova consegnata ⇒ stato_non_valido", async () => {
    const id = await creaVerifica();
    await avviaVerifica(id, docenteId, T0);
    await entra(id, studenti[0]!, dopo(1));
    const p1 = await entra(id, studenti[1]!, dopo(1));
    // Un recupero aperto (studenti[2] arrivato tardi) alle 10:30.
    expect(await avviaRecupero(id, docenteId, [studenti[2]!], dopo(30))).toEqual({ ok: true });

    expect(await aggiungiMinuti(id, docenteId, 10, studenti[0]!, dopo(40))).toEqual({ ok: true });
    let m = (await monitoraggioVerifica(id, docenteId, dopo(41)))!;
    const scad = (s: string) => m.righe.find((r) => r.studentId === s)!.scadenza;
    expect(scad(studenti[0]!)).toEqual(dopo(70));
    expect(scad(studenti[1]!)).toEqual(dopo(60));
    expect(scad(studenti[2]!)).toEqual(dopo(90));

    expect(await aggiungiMinuti(id, docenteId, 5, undefined, dopo(42))).toEqual({ ok: true });
    m = (await monitoraggioVerifica(id, docenteId, dopo(43)))!;
    expect(scad(studenti[0]!)).toEqual(dopo(75));
    expect(scad(studenti[1]!)).toEqual(dopo(65));
    expect(scad(studenti[2]!)).toEqual(dopo(90));
    expect(m.righe.find((r) => r.studentId === studenti[0])!.minutiExtra).toBe(10);

    await prisma.provaVerifica.update({ where: { id: p1.id }, data: { consegnataAt: dopo(44) } });
    expect(await aggiungiMinuti(id, docenteId, 5, studenti[1]!, dopo(45))).toEqual({ ok: false, motivo: "stato_non_valido" });
  });

  it("minuti fuori da 1–120 o non interi ⇒ valore_non_valido; in PREPARATA ⇒ stato_non_valido", async () => {
    const id = await creaVerifica();
    expect(await aggiungiMinuti(id, docenteId, 5, undefined, T0)).toEqual({ ok: false, motivo: "stato_non_valido" });
    await avviaVerifica(id, docenteId, T0);
    for (const minuti of [0, 121, 2.5, -3]) {
      expect(await aggiungiMinuti(id, docenteId, minuti, undefined, dopo(1))).toEqual({ ok: false, motivo: "valore_non_valido" });
    }
  });

  it("a uno studente senza riga crea la prova con le misure della classe", async () => {
    const id = await creaVerifica();
    await avviaVerifica(id, docenteId, T0);
    await prisma.misurePdp.create({ data: { classeId, studentId: studenti[2]!, tempoExtraPct: 20 } });
    expect(await aggiungiMinuti(id, docenteId, 7, studenti[2]!, dopo(5))).toEqual({ ok: true });
    const p = await prisma.provaVerifica.findUniqueOrThrow({ where: { compitoId_studentId: { compitoId: id, studentId: studenti[2]! } } });
    expect(p).toMatchObject({ tempoExtraPct: 20, minutiExtra: 7 });
    expect(await aggiungiMinuti(id, docenteId, 7, estraneoId, dopo(5))).toEqual({ ok: false, motivo: "studenti_non_validi" });
  });
});

describe("recuperi", () => {
  it("recuperabile: nessuna prova, o consegnata con zero risposte", () => {
    expect(recuperabile(null, 0)).toBe(true);
    const consegnata = { consegnataAt: T0, recupero: false, inizioAt: null };
    expect(recuperabile(consegnata, 0)).toBe(true);
    expect(recuperabile(consegnata, 1)).toBe(false);
    expect(recuperabile({ ...consegnata, consegnataAt: null }, 0)).toBe(false);
  });

  it("consegnata a zero risposte ⇒ riaperta con le stesse posizioni e gli stessi semi; con una risposta ⇒ studenti_non_validi; chiudiRecupero la riconsegna", async () => {
    const id = await creaVerifica();
    expect(await avviaRecupero(id, docenteId, [studenti[0]!], T0)).toEqual({ ok: false, motivo: "stato_non_valido" });
    await avviaVerifica(id, docenteId, T0);
    const p0 = await entra(id, studenti[0]!, dopo(1));
    const p1 = await entra(id, studenti[1]!, dopo(1));
    await prisma.tentativo.updateMany({ where: { provaId: p1.id }, data: { state: statoRisposto } });
    await prisma.provaVerifica.update({ where: { id: p0.id }, data: { tempoExtraPct: 30 } });
    expect(await chiudiVerifica(id, docenteId, dopo(20))).toEqual({ ok: true });
    const semiPrima = (await prisma.tentativo.findMany({ where: { provaId: p0.id }, orderBy: { seed: "asc" } })).map((t) => t.seed);

    let m = (await monitoraggioVerifica(id, docenteId, dopo(21)))!;
    const riga = (s: string) => m.righe.find((r) => r.studentId === s)!;
    expect(riga(studenti[0]!).recuperabile).toBe(true);
    expect(riga(studenti[1]!).recuperabile).toBe(false);
    expect(riga(studenti[1]!).risposti).toBe(3);
    expect(riga(studenti[2]!).recuperabile).toBe(true);

    expect(await avviaRecupero(id, docenteId, [studenti[0]!, studenti[1]!], dopo(30))).toEqual({
      ok: false,
      motivo: "studenti_non_validi",
    });
    expect((await prisma.provaVerifica.findUniqueOrThrow({ where: { id: p0.id } })).recupero).toBe(false);

    expect(await avviaRecupero(id, docenteId, [studenti[0]!, studenti[2]!], dopo(30))).toEqual({ ok: true });
    const r0 = await prisma.provaVerifica.findUniqueOrThrow({ where: { id: p0.id }, include: { tentativi: { orderBy: { seed: "asc" } } } });
    expect(r0).toMatchObject({ recupero: true, inizioAt: dopo(30), consegnataAt: null, consegnaAutomatica: false, tempoExtraPct: 30, posizioni: [0, 1, 2] });
    expect(r0.tentativi.map((t) => t.seed)).toEqual(semiPrima);
    expect(r0.tentativi.every((t) => t.status === "IN_PROGRESS" && t.completedAt === null)).toBe(true);
    const r2 = await prisma.provaVerifica.findUniqueOrThrow({ where: { compitoId_studentId: { compitoId: id, studentId: studenti[2]! } } });
    expect(r2).toMatchObject({ recupero: true, inizioAt: dopo(30), tempoExtraPct: 0 });

    m = (await monitoraggioVerifica(id, docenteId, dopo(31)))!;
    expect(m.recuperiAperti).toBe(2);
    expect(m.conTempoResiduo).toBe(2);
    expect(riga(studenti[0]!)).toMatchObject({ recupero: true, stato: "in_corso", scadenza: dopo(30 + 78) });

    expect(await chiudiRecupero(id, docenteId, [studenti[0]!], dopo(40))).toEqual({ ok: true });
    const c0 = await prisma.provaVerifica.findUniqueOrThrow({ where: { id: p0.id }, include: { tentativi: true } });
    expect(c0).toMatchObject({ consegnataAt: dopo(40), consegnaAutomatica: true });
    expect(c0.tentativi.every((t) => t.status === "COMPLETED")).toBe(true);
    expect((await monitoraggioVerifica(id, docenteId, dopo(41)))!.recuperiAperti).toBe(1);
  });
});

describe("modificaVerificaPreparata", () => {
  it("cambia durata e strumenti in PREPARATA; valori non validi ⇒ valore_non_valido; dopo l'avvio ⇒ stato_non_valido", async () => {
    const id = await creaVerifica();
    expect(await modificaVerificaPreparata(id, docenteId, { durataMinuti: 45, calcolatrice: "TUTTI" }, T0)).toEqual({ ok: true });
    const v = await prisma.verifica.findUniqueOrThrow({ where: { compitoId: id } });
    expect(v).toMatchObject({ durataMinuti: 45, calcolatrice: "TUTTI", formulario: "NESSUNO" });

    for (const campi of [
      { durataMinuti: 4 },
      { durataMinuti: 301 },
      { avvioProgrammatoAt: dopo(-1) },
      { formularioFile: "00000000-0000-0000-0000-000000000000.pdf" },
    ]) {
      expect(await modificaVerificaPreparata(id, docenteId, campi, T0)).toEqual({ ok: false, motivo: "valore_non_valido" });
    }
    expect(await modificaVerificaPreparata(id, docenteId, { avvioProgrammatoAt: dopo(30) }, T0)).toEqual({ ok: true });
    expect(await modificaVerificaPreparata(id, docenteId, { avvioProgrammatoAt: null }, T0)).toEqual({ ok: true });
    expect(await modificaVerificaPreparata(id, estraneoId, { durataMinuti: 50 }, T0)).toEqual({ ok: false, motivo: "non_trovata" });

    await avviaVerifica(id, docenteId, T0);
    expect(await modificaVerificaPreparata(id, docenteId, { durataMinuti: 50 }, dopo(1))).toEqual({ ok: false, motivo: "stato_non_valido" });
  });
});

describe("monitoraggioVerifica", () => {
  it("non entrato senza riga, uscita aperta contata fino a ora, nessun punteggio, docente estraneo ⇒ null", async () => {
    const id = await creaVerifica();
    await prisma.misurePdp.create({ data: { classeId, studentId: studenti[1]!, menoEsercizi: true } });
    await avviaVerifica(id, docenteId, T0);
    const p0 = await entra(id, studenti[0]!, dopo(1));
    await prisma.tentativo.updateMany({ where: { provaId: p0.id, esercizioVersioneId: (await prisma.compito.findUniqueOrThrow({ where: { id } })).drawnVersionIds[0] }, data: { state: statoRisposto, score: 1, maxScore: 1 } });
    await prisma.provaVerifica.update({ where: { id: p0.id }, data: { ultimoSalvataggioAt: dopo(5) } });
    await prisma.eventoVerifica.createMany({
      data: [
        { provaId: p0.id, tipo: "USCITA", motivo: "SCHEDA", at: dopo(6) },
        { provaId: p0.id, tipo: "RIENTRO", at: dopo(6.5), durataMs: 30_000 },
        { provaId: p0.id, tipo: "USCITA", motivo: "FOCUS", at: new Date(dopo(10).getTime() - 40_000) },
      ],
    });

    const m = (await monitoraggioVerifica(id, docenteId, dopo(10)))!;
    expect(m.titolo).toBeTruthy();
    expect(m.classe).toBe("3B");
    expect(m.oraServer).toEqual(dopo(10));
    expect(m.verifica.stato).toBe("IN_CORSO");
    expect(JSON.stringify(m)).not.toMatch(/score/i);
    const riga = (s: string) => m.righe.find((r) => r.studentId === s)!;
    expect(riga(studenti[0]!)).toMatchObject({
      nome: "S0",
      stato: "in_corso",
      risposti: 1,
      totale: 3,
      uscite: 2,
      secondiFuori: 70,
      secondiResidui: 50 * 60,
      ultimoSalvataggioAt: dopo(5),
      recuperabile: false,
    });
    expect(riga(studenti[1]!)).toMatchObject({ stato: "non_entrato", risposti: 0, totale: 2, uscite: 0, secondiFuori: 0 });
    expect(riga(studenti[2]!)).toMatchObject({ stato: "non_entrato", totale: 3, scadenza: dopo(60), recuperabile: true });
    expect(m.conTempoResiduo).toBe(3);

    expect(await monitoraggioVerifica(id, estraneoId, dopo(10))).toBeNull();
  });
});
