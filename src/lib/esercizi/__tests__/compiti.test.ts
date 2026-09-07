import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { creaBatteria as creaBatteriaGrezza, verificaBatteria } from "../batterie";
import { aggiungiEsercizi } from "../contenitori";
import {
  assegna, compitiDellaClasse, compitiDelloStudente, consegneDelCompito,
} from "../compiti";

// `creaBatteria` (Fix round finale, item 5) restituisce ora un rifiuto
// esplicito invece di lasciar scappare un errore di Prisma quando una
// regola nomina un contenitore inesistente — stessa forma delle sue gemelle
// (`assegna`, `eliminaBatteria`). La maggior parte dei test qui non
// riguarda quel rifiuto: questa scorciatoia spacchetta il successo o lancia,
// sullo stesso modello di `righeDi` più sotto.
async function creaBatteria(...args: Parameters<typeof creaBatteriaGrezza>) {
  const r = await creaBatteriaGrezza(...args);
  if (!r.ok) throw new Error(`creaBatteria rifiutata inaspettatamente: ${r.motivo}`);
  return r;
}

const P = "compititest-";
let teacherId: string;
let teacherAltro: string;
let adminId: string;
let studentId: string;
let studentId2: string;
let classeId: string;
let classeAltrui: string;
let contenitoreId: string;
let esercizioExtra: string;
let batteriaId: string;
let batteriaTroppoGrande: string;

async function creaEsercizioConVersione(id: string, title: string) {
  const e = await prisma.esercizio.create({
    data: { id, title, yearLevel: 2, topic: "prova", tags: [], difficulty: 1 },
  });
  await prisma.esercizioVersione.create({
    data: { esercizioId: e.id, version: 1, content: { testo: title }, hash: `h-${id}` },
  });
  return e.id;
}

// Scorciatoia per i test che non riguardano il rifiuto: la maggior parte
// chiama `consegneDelCompito` aspettandosi di vedere le righe, non di
// gestire un `ok: false` che qui non ci si aspetta.
async function righeDi(compitoId: string, chi: string = teacherId) {
  const esito = await consegneDelCompito(compitoId, chi);
  if (!esito.ok) throw new Error(`consegneDelCompito rifiutato inaspettatamente: ${esito.motivo}`);
  return esito.righe;
}

beforeEach(async () => {
  await prisma.tentativo.deleteMany({ where: { student: { email: { startsWith: P } } } });
  await prisma.compito.deleteMany({ where: { batteria: { name: { startsWith: P } } } });
  await prisma.batteriaRegola.deleteMany({ where: { batteria: { name: { startsWith: P } } } });
  await prisma.batteria.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.contenitoreEsercizio.deleteMany({ where: { contenitore: { name: { startsWith: P } } } });
  await prisma.contenitore.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.classeStudente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.classeDocente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.classe.deleteMany({ where: { googleGroupEmail: { startsWith: P } } });
  await prisma.esercizioVersione.deleteMany({ where: { esercizio: { id: { startsWith: P } } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });

  teacherId = (await prisma.user.create({ data: { email: `${P}d@test.it`, name: "D", role: "TEACHER" } })).id;
  teacherAltro = (await prisma.user.create({ data: { email: `${P}d2@test.it`, name: "D2", role: "TEACHER" } })).id;
  adminId = (await prisma.user.create({ data: { email: `${P}admin@test.it`, name: "Admin", role: "ADMIN" } })).id;
  studentId = (await prisma.user.create({ data: { email: `${P}s1@test.it`, name: "S1", role: "STUDENT" } })).id;
  studentId2 = (await prisma.user.create({ data: { email: `${P}s2@test.it`, name: "S2", role: "STUDENT" } })).id;

  classeId = (await prisma.classe.create({
    data: { googleGroupEmail: `${P}classe@scuola.it`, name: "Classe", yearLevel: 2 },
  })).id;
  await prisma.classeDocente.create({ data: { classeId, teacherId } });
  await prisma.classeStudente.createMany({
    data: [{ classeId, studentId }, { classeId, studentId: studentId2 }],
  });

  // Una classe che esiste ma che il docente principale non insegna — la
  // insegna invece `teacherAltro`, per i test di `consegneDelCompito` che
  // devono rifiutare un occhio esterno pur avendo un compito vero da mostrare.
  classeAltrui = (await prisma.classe.create({
    data: { googleGroupEmail: `${P}altrui@scuola.it`, name: "Altrui", yearLevel: 2 },
  })).id;
  await prisma.classeDocente.create({ data: { classeId: classeAltrui, teacherId: teacherAltro } });

  contenitoreId = (await prisma.contenitore.create({ data: { name: `${P}Equazioni`, createdById: teacherId } })).id;
  const es = await Promise.all([
    creaEsercizioConVersione(`${P}es0`, "Es 0"),
    creaEsercizioConVersione(`${P}es1`, "Es 1"),
    creaEsercizioConVersione(`${P}es2`, "Es 2"),
    creaEsercizioConVersione(`${P}es3`, "Es 3"),
    creaEsercizioConVersione(`${P}es4`, "Es 4"),
  ]);
  await prisma.contenitoreEsercizio.createMany({
    data: es.map((esercizioId) => ({ contenitoreId, esercizioId })),
  });

  esercizioExtra = await creaEsercizioConVersione(`${P}extra`, "Extra");

  batteriaId = (await creaBatteria(teacherId, `${P}Batteria`, [{ contenitoreId, count: 3 }])).id;
  batteriaTroppoGrande = (await creaBatteria(teacherId, `${P}Troppo`, [{ contenitoreId, count: 100 }])).id;
});

describe("assegna", () => {
  it("assegnare pesca una volta e fissa le versioni", async () => {
    const r = await assegna(batteriaId, classeId, teacherId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } });
    expect(c.drawnVersionIds).toHaveLength(3);
    expect(c.drawSeed).toMatch(/.+/);
  });

  it("due assegnazioni della stessa batteria pescano in modo diverso", async () => {
    const a = await assegna(batteriaId, classeId, teacherId);
    const b = await assegna(batteriaId, classeId, teacherId);
    if (!a.ok || !b.ok) throw new Error("assegnazione fallita");
    const ca = await prisma.compito.findUniqueOrThrow({ where: { id: a.compitoId } });
    const cb = await prisma.compito.findUniqueOrThrow({ where: { id: b.compitoId } });
    expect(ca.drawSeed).not.toBe(cb.drawSeed);
  });

  it("la pesca non cambia se il contenitore cambia dopo", async () => {
    const r = await assegna(batteriaId, classeId, teacherId);
    if (!r.ok) throw new Error("assegnazione fallita");
    const prima = (await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } })).drawnVersionIds;
    await aggiungiEsercizi(contenitoreId, [esercizioExtra]);
    const dopo = (await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } })).drawnVersionIds;
    expect(dopo).toEqual(prima);
  });

  it("una nuova versione di un esercizio pescato non cambia il compito già assegnato", async () => {
    const r = await assegna(batteriaId, classeId, teacherId);
    if (!r.ok) throw new Error("assegnazione fallita");
    const prima = (await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } })).drawnVersionIds;
    const versionePescata = await prisma.esercizioVersione.findUniqueOrThrow({ where: { id: prima[0]! } });
    await prisma.esercizioVersione.create({
      data: {
        esercizioId: versionePescata.esercizioId,
        version: versionePescata.version + 1,
        content: { nuovo: true },
        hash: "hash-nuova-versione",
      },
    });
    const dopo = (await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } })).drawnVersionIds;
    expect(dopo).toEqual(prima);
  });

  it("un contenitore che non basta blocca l'assegnazione e dice quale", async () => {
    const r = await assegna(batteriaTroppoGrande, classeId, teacherId);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("esercizi_insufficienti");
  });

  it("il motivo per cui non basta nomina il contenitore e i due numeri", async () => {
    const r = await assegna(batteriaTroppoGrande, classeId, teacherId);
    if (r.ok) throw new Error("doveva fallire");
    expect(r.dettaglio).toEqual({ contenitore: `${P}Equazioni`, richiesti: 100, disponibili: 5 });
    // Nessun compito scritto quando l'assegnazione fallisce.
    expect(await prisma.compito.count({ where: { batteriaId: batteriaTroppoGrande } })).toBe(0);
  });

  it("un esercizio senza versione non viene mai consegnato e non gonfia i disponibili", async () => {
    const senzaVersione = (await prisma.esercizio.create({
      data: { id: `${P}senza-versione`, title: "Senza versione", yearLevel: 2, topic: "prova", tags: [], difficulty: 1 },
    })).id;
    await prisma.contenitoreEsercizio.create({ data: { contenitoreId, esercizioId: senzaVersione } });
    // contenitoreId ha ora 6 membri: 5 con versione (dal beforeEach) + 1
    // senza. Una regola che ne chiede 6 deve rifiutare dicendo che ne sono
    // disponibili 5, non prometterne 6 e consegnarne solo 5 in silenzio.
    const batteriaSeiSuSei = (await creaBatteria(teacherId, `${P}SeiSuSei`, [{ contenitoreId, count: 6 }])).id;
    const r = await assegna(batteriaSeiSuSei, classeId, teacherId);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("esercizi_insufficienti");
    expect(r.dettaglio).toEqual({ contenitore: `${P}Equazioni`, richiesti: 6, disponibili: 5 });

    // Con una richiesta che il bacino "vero" (con versione) può soddisfare,
    // la pesca riesce e non include mai l'esercizio senza versione.
    const r2 = await assegna(batteriaId, classeId, teacherId);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const c = await prisma.compito.findUniqueOrThrow({ where: { id: r2.compitoId } });
    const versioniPescate = await prisma.esercizioVersione.findMany({ where: { id: { in: c.drawnVersionIds } } });
    expect(versioniPescate.every((v) => v.esercizioId !== senzaVersione)).toBe(true);
  });

  it("un docente non puo' assegnare a una classe che non insegna", async () => {
    const r = await assegna(batteriaId, classeAltrui, teacherId);
    expect(r).toMatchObject({ ok: false, motivo: "non_insegni_questa_classe" });
  });

  it("una batteria inesistente non si assegna", async () => {
    const r = await assegna("non-esiste", classeId, teacherId);
    expect(r).toMatchObject({ ok: false, motivo: "batteria_non_trovata" });
  });

  it("una classe inesistente non si assegna", async () => {
    const r = await assegna(batteriaId, "non-esiste", teacherId);
    expect(r).toMatchObject({ ok: false, motivo: "classe_non_trovata" });
  });

  it("lo studente vede il compito della sua classe e quanti esercizi ha fatto", async () => {
    const r = await assegna(batteriaId, classeId, teacherId);
    if (!r.ok) throw new Error("assegnazione fallita");
    const suoi = await compitiDelloStudente(studentId);
    expect(suoi).toHaveLength(1);
    expect(suoi[0]!.esercizi).toHaveLength(3);
    expect(suoi[0]!.fatti).toBe(0);
  });

  it("le consegne elencano tutti gli studenti, anche chi non ha iniziato", async () => {
    const r = await assegna(batteriaId, classeId, teacherId);
    if (!r.ok) throw new Error("assegnazione fallita");
    const righe = await righeDi(r.compitoId);
    expect(righe).toHaveLength(2);
    expect(righe.every((x) => x.fatti === 0)).toBe(true);
  });

  // Fix round 1: `consegneDelCompito` non controllava affatto chi guardava.
  // `assegna` qui sopra fa già esattamente il controllo che serve sulla
  // scrittura (`classeDocente.findUnique`); questi test lo pretendono anche
  // sulla lettura — la stessa asimmetria che il committente ha segnalato.
  describe("chi può vedere le consegne", () => {
    // Uno studente vero, iscritto SOLO a `classeAltrui`: senza di lui un
    // rifiuto e un "vede solo righe vuote" sarebbero indistinguibili. Con
    // lui, il test sul docente esterno dimostra che il buco espone un nome e
    // un punteggio veri, non un array vuoto senza interesse.
    let studentAltrui: string;

    beforeEach(async () => {
      studentAltrui = (await prisma.user.create({
        data: { email: `${P}saltrui@test.it`, name: "Studente Altrui", role: "STUDENT" },
      })).id;
      await prisma.classeStudente.create({ data: { classeId: classeAltrui, studentId: studentAltrui } });
    });

    it("il docente della classe vede le consegne, col nome dello studente vero", async () => {
      const r = await assegna(batteriaId, classeAltrui, teacherAltro);
      if (!r.ok) throw new Error("assegnazione fallita");
      const esito = await consegneDelCompito(r.compitoId, teacherAltro);
      expect(esito.ok).toBe(true);
      if (!esito.ok) return;
      expect(esito.righe).toHaveLength(1);
      expect(esito.righe[0]!.nome).toBe("Studente Altrui");
    });

    // Il test che conta di più: prima del fix, questa chiamata restituiva le
    // righe vere (nome incluso) a un docente che non insegna quella classe —
    // in un hub multi-scuola, dati di minori attraverso il confine di
    // un'altra scuola. Ora deve essere rifiutata, con lo stesso motivo che
    // `assegna` usa già per lo stesso identico controllo sulla scrittura.
    it("un docente che non insegna quella classe viene rifiutato, con lo stesso motivo di `assegna`", async () => {
      const r = await assegna(batteriaId, classeAltrui, teacherAltro);
      if (!r.ok) throw new Error("assegnazione fallita");
      const esito = await consegneDelCompito(r.compitoId, teacherId);
      expect(esito).toEqual({ ok: false, motivo: "non_insegni_questa_classe" });
    });

    // Decisione deliberata (vedi il report): un ADMIN non ha, in questo
    // dominio, un accesso privilegiato alle classi altrui — esattamente come
    // `assegna` non gli concede di assegnare a una classe che non insegna.
    // Nessuna eccezione di ruolo qui: la stessa regola, per chiunque guardi.
    it("un ADMIN che non insegna quella classe viene rifiutato allo stesso modo", async () => {
      const r = await assegna(batteriaId, classeAltrui, teacherAltro);
      if (!r.ok) throw new Error("assegnazione fallita");
      const esito = await consegneDelCompito(r.compitoId, adminId);
      expect(esito).toEqual({ ok: false, motivo: "non_insegni_questa_classe" });
    });
  });

  it("compitiDellaClasse riporta il nome della batteria e il numero di esercizi", async () => {
    const r = await assegna(batteriaId, classeId, teacherId);
    if (!r.ok) throw new Error("assegnazione fallita");
    const dellaClasse = await compitiDellaClasse(classeId);
    expect(dellaClasse).toHaveLength(1);
    expect(dellaClasse[0]).toMatchObject({ id: r.compitoId, batteria: `${P}Batteria`, esercizi: 3 });
  });

  // I tre casi limite che la spec dichiara e che senza un test resterebbero
  // opinioni.

  it("chi entra nella classe DOPO l'assegnazione vede comunque il compito", async () => {
    const r = await assegna(batteriaId, classeId, teacherId);
    if (!r.ok) throw new Error("assegnazione fallita");
    const tardivo = await prisma.user.create({ data: { email: `${P}tardivo@test.it`, name: "T", role: "STUDENT" } });
    await prisma.classeStudente.create({ data: { classeId, studentId: tardivo.id } });
    const suoi = await compitiDelloStudente(tardivo.id);
    expect(suoi.map((c) => c.id)).toContain(r.compitoId);
    expect(await righeDi(r.compitoId)).toHaveLength(3);
  });

  it("chi esce dalla classe sparisce dalle consegne ma i suoi tentativi restano", async () => {
    const r = await assegna(batteriaId, classeId, teacherId);
    if (!r.ok) throw new Error("assegnazione fallita");
    const versione = (await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } })).drawnVersionIds[0]!;
    const t = await prisma.tentativo.create({
      data: { studentId, esercizioVersioneId: versione, compitoId: r.compitoId, seed: "x" },
    });
    await prisma.classeStudente.delete({ where: { classeId_studentId: { classeId, studentId } } });
    expect((await righeDi(r.compitoId)).map((x) => x.studentId)).not.toContain(studentId);
    expect(await prisma.tentativo.findUnique({ where: { id: t.id } })).not.toBeNull();
  });

  it("una classe senza studenti si assegna lo stesso, con zero consegne", async () => {
    const vuota = await prisma.classe.create({
      data: { googleGroupEmail: `${P}vuota@scuola.it`, name: "Vuota", yearLevel: 1 },
    });
    await prisma.classeDocente.create({ data: { classeId: vuota.id, teacherId } });
    const r = await assegna(batteriaId, vuota.id, teacherId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await righeDi(r.compitoId)).toEqual([]);
  });

  // Fix round 1: verificaBatteria applica la stessa esclusione incrociata
  // fra regole che assegna applica davvero. Il caso qui è costruito perché
  // il verdetto sia deterministico qualunque sia il seme: il contenitore
  // "Due" ha ESATTAMENTE due esercizi e la sua regola ne chiede due, quindi
  // il sorteggio li prende SEMPRE entrambi, qualunque sia l'ordine con cui
  // vengono mescolati. Il contenitore "Tre" condivide quei due esercizi e ne
  // ha uno suo, ma la sua regola ne chiede tre: dopo che "Due" li ha presi
  // entrambi, a "Tre" resta solo il suo, quindi l'insufficienza è certa a
  // prescindere dal seme — un caso in cui il verdetto di verificaBatteria e
  // quello di assegna DEVONO combaciare sempre, non "di solito".
  it("verificaBatteria e assegna concordano su una batteria con contenitori sovrapposti", async () => {
    const sharedA = await creaEsercizioConVersione(`${P}shareda`, "Shared A");
    const sharedB = await creaEsercizioConVersione(`${P}sharedb`, "Shared B");
    const soloSuo = await creaEsercizioConVersione(`${P}solosuo`, "Solo Suo");

    const contDue = (await prisma.contenitore.create({ data: { name: `${P}Due`, createdById: teacherId } })).id;
    await prisma.contenitoreEsercizio.createMany({
      data: [
        { contenitoreId: contDue, esercizioId: sharedA },
        { contenitoreId: contDue, esercizioId: sharedB },
      ],
    });
    const contTre = (await prisma.contenitore.create({ data: { name: `${P}Tre`, createdById: teacherId } })).id;
    await prisma.contenitoreEsercizio.createMany({
      data: [
        { contenitoreId: contTre, esercizioId: sharedA },
        { contenitoreId: contTre, esercizioId: sharedB },
        { contenitoreId: contTre, esercizioId: soloSuo },
      ],
    });

    const battAggressiva = (await creaBatteria(teacherId, `${P}Aggressiva`, [
      { contenitoreId: contDue, count: 2 },
      { contenitoreId: contTre, count: 3 },
    ])).id;

    const verifica = await verificaBatteria(battAggressiva);
    expect(verifica).toEqual({
      ok: false,
      mancanti: [{ contenitore: `${P}Tre`, richiesti: 3, disponibili: 1 }],
    });

    const assegnazione = await assegna(battAggressiva, classeId, teacherId);
    expect(assegnazione).toMatchObject({ ok: false, motivo: "esercizi_insufficienti" });
  });

  // Prova di composizione oltre i test del brief: due contenitori con
  // esercizi che si sovrappongono, una batteria che pesca da entrambi, e la
  // verifica che le versioni pescate siano reali, distinte e appartengano al
  // contenitore giusto.
  it("una batteria con piu' regole pesca da entrambi i contenitori con versioni reali e distinte", async () => {
    const overlap = await creaEsercizioConVersione(`${P}overlap`, "Overlap");
    const soloB = await creaEsercizioConVersione(`${P}soloB`, "Solo B");
    const soloB2 = await creaEsercizioConVersione(`${P}soloB2`, "Solo B2");

    const contB = (await prisma.contenitore.create({ data: { name: `${P}Sistemi`, createdById: teacherId } })).id;
    // "overlap" sta in entrambi i contenitori: anche se il sorteggio di
    // Equazioni lo pesca (escludendolo così dal bacino di Sistemi), a Sistemi
    // restano comunque due esercizi propri per soddisfare la regola.
    await prisma.contenitoreEsercizio.createMany({
      data: [
        { contenitoreId: contB, esercizioId: overlap },
        { contenitoreId: contB, esercizioId: soloB },
        { contenitoreId: contB, esercizioId: soloB2 },
      ],
    });
    await aggiungiEsercizi(contenitoreId, [overlap]);

    const batteriaMista = (await creaBatteria(teacherId, `${P}Mista`, [
      { contenitoreId, count: 2 },
      { contenitoreId: contB, count: 2 },
    ])).id;

    // Anche qui capienza abbondante su entrambi i lati anche nel caso
    // peggiore: verificaBatteria e assegna devono concordare sul sì.
    expect(await verificaBatteria(batteriaMista)).toEqual({ ok: true });

    const r = await assegna(batteriaMista, classeId, teacherId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const c = await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } });
    expect(c.drawnVersionIds).toHaveLength(4);
    // Distinte: nessuna versione ripetuta.
    expect(new Set(c.drawnVersionIds).size).toBe(4);

    const versioni = await prisma.esercizioVersione.findMany({ where: { id: { in: c.drawnVersionIds } } });
    expect(versioni).toHaveLength(4); // reali: esistono davvero nel database

    // Le prime due (regola sul primo contenitore, order 0) vengono da
    // esercizi che stanno in `contenitoreId`; le ultime due (order 1) da
    // esercizi che stanno in `contB`.
    const contenitoreIdDelleVersioni = await Promise.all(
      c.drawnVersionIds.map(async (vid) => {
        const v = versioni.find((x) => x.id === vid)!;
        return v.esercizioId;
      }),
    );
    const inContA = new Set(
      (await prisma.contenitoreEsercizio.findMany({ where: { contenitoreId } })).map((x) => x.esercizioId),
    );
    const inContB = new Set(
      (await prisma.contenitoreEsercizio.findMany({ where: { contenitoreId: contB } })).map((x) => x.esercizioId),
    );
    const [primaMeta, secondaMeta] = [contenitoreIdDelleVersioni.slice(0, 2), contenitoreIdDelleVersioni.slice(2, 4)];
    expect(primaMeta.every((eid) => inContA.has(eid))).toBe(true);
    expect(secondaMeta.every((eid) => inContB.has(eid))).toBe(true);
  });

  // Fix round finale, item 1 (seconda metà — "conta solo ciò che è stato
  // pescato"): il committente ha dimostrato uno studente che non aveva
  // risolto NESSUNO degli esercizi assegnati comparire come 5/3 nella
  // tabella del docente, sopra chi ne aveva fatto davvero uno. Qui si scrive
  // direttamente (bypassando `avviaORiprendi`, già validato altrove — vedi
  // `tentativo-compito.test.ts`) la stessa forma di dato che l'assenza di
  // validazione lasciava scrivere PRIMA del fix, o che può restare nel
  // database da prima del fix: righe `Tentativo` che portano il `compitoId`
  // vero ma un `esercizioVersioneId` mai pescato da quel compito.
  describe("i conteggi contano solo ciò che il compito ha davvero pescato", () => {
    it("consegneDelCompito non conta tentativi completati su un esercizio mai pescato da questo compito", async () => {
      const r = await assegna(batteriaId, classeId, teacherId); // pesca 3 da contenitoreId
      if (!r.ok) throw new Error("assegnazione fallita");

      const versioneEstranea = await prisma.esercizioVersione.findFirstOrThrow({
        where: { esercizioId: esercizioExtra },
      });
      // Cinque tentativi COMPLETED, tutti col compitoId vero ma su un
      // esercizio che quella batteria non ha mai potuto pescare (non sta
      // nel contenitore di batteriaId): la riproduzione esatta del "5/3"
      // dimostrato dal committente.
      await prisma.tentativo.createMany({
        data: Array.from({ length: 5 }, (_, i) => ({
          studentId,
          esercizioVersioneId: versioneEstranea.id,
          compitoId: r.compitoId,
          seed: `estraneo-${i}`,
          status: "COMPLETED" as const,
          score: 1,
          maxScore: 1,
        })),
      });

      const righe = await righeDi(r.compitoId);
      const riga = righe.find((x) => x.studentId === studentId)!;
      // Prima del fix: `fatti` valeva 5 (su `totali` 3) e `punteggio` 5 —
      // uno studente che non aveva mai aperto un esercizio DAVVERO
      // assegnato compariva come se ne avesse consegnati più del totale.
      expect(riga.fatti).toBe(0);
      expect(riga.punteggio).toBe(0);
      expect(riga.massimo).toBe(0);
      expect(riga.totali).toBe(3);
    });

    it("compitiDelloStudente non conta tentativi completati su un esercizio mai pescato da questo compito", async () => {
      const r = await assegna(batteriaId, classeId, teacherId);
      if (!r.ok) throw new Error("assegnazione fallita");

      const versioneEstranea = await prisma.esercizioVersione.findFirstOrThrow({
        where: { esercizioId: esercizioExtra },
      });
      await prisma.tentativo.create({
        data: {
          studentId, esercizioVersioneId: versioneEstranea.id, compitoId: r.compitoId,
          seed: "estraneo", status: "COMPLETED", score: 1, maxScore: 1,
        },
      });

      const suoi = await compitiDelloStudente(studentId);
      const suo = suoi.find((c) => c.id === r.compitoId)!;
      // Prima del fix: `fatti` valeva 1 nonostante lo studente non avesse
      // mai toccato nessuno dei 3 esercizi che il compito ha davvero
      // assegnato (`suo.esercizi`).
      expect(suo.fatti).toBe(0);
      expect(suo.esercizi).toHaveLength(3);
    });
  });

  // Fix round finale, item 3: i due lettori di `drawnVersionIds` devono
  // concordare sullo stesso numero. Qui si simula (a mano, con Prisma
  // diretto — nessuna funzione del dominio cancella oggi un Esercizio o una
  // EsercizioVersione) l'unico modo in cui oggi la disaccordanza potrebbe
  // comunque presentarsi: una `EsercizioVersione` pescata che sparisce dal
  // database dopo l'assegnazione, con `drawnVersionIds` (colonna senza
  // vincolo di chiave esterna) che continua a nominarla.
  describe("i due lettori di drawnVersionIds concordano sullo stesso numero", () => {
    it("consegneDelCompito e compitiDelloStudente contano lo stesso numero di esercizi dopo che uno sparisce", async () => {
      const r = await assegna(batteriaId, classeId, teacherId); // 3 pescati
      if (!r.ok) throw new Error("assegnazione fallita");

      const compito = await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } });
      // Cancella UNA delle tre versioni pescate: cascata su Tentativo
      // (nessuno ne esiste ancora qui), non tocca la colonna
      // `drawnVersionIds`, che resta un array di stringhe senza vincolo.
      await prisma.esercizioVersione.delete({ where: { id: compito.drawnVersionIds[0]! } });

      const suoi = await compitiDelloStudente(studentId);
      const suo = suoi.find((c) => c.id === r.compitoId)!;
      const righe = await righeDi(r.compitoId);

      // Prima del fix: `suo.esercizi.length` valeva 2 (filtra le versioni
      // risolvibili) mentre `righe[0].totali` valeva ancora 3
      // (`drawnVersionIds.length`, crudo) — lo stesso compito, due numeri
      // diversi per lo stesso denominatore.
      expect(suo.esercizi).toHaveLength(2);
      expect(righe[0]!.totali).toBe(2);
      expect(righe[0]!.totali).toBe(suo.esercizi.length);
    });
  });
});
