import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { creaBatteria as creaBatteriaGrezza } from "../batterie";
import { dichiaraInsegnamento } from "../classi";
import { compitiDellaClasse, compitiDelloStudente, consegneDelCompito } from "../compiti";
import { assegnaPerProva } from "./assegna-per-prova";

// `creaBatteria` (Fix round finale, item 5) restituisce ora un rifiuto
// esplicito invece di lasciar scappare un errore di Prisma quando una
// regola nomina un contenitore inesistente — stessa forma delle sue gemelle
// (`assegnaCompito`, `eliminaContenitore`). La maggior parte dei test qui non
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

async function creaEsercizioConVersione(id: string, title: string) {
  const e = await prisma.esercizio.create({
    // Aperto a tutta la scuola, come ogni esercizio esistente il giorno
    // dell'aggiornamento: questi test parlano della pesca, non della
    // visibilità (che ha i suoi test in fondo).
    data: { id, title, yearLevel: 2, topic: "prova", tags: [], difficulty: 1, accessoScuola: "EDITOR" },
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

  // Aperta a tutta la scuola (come le raccolte esistenti dopo la
  // migrazione): `teacherAltro` assegna dalla stessa batteria più sotto.
  contenitoreId = (await prisma.contenitore.create({
    data: { name: `${P}Equazioni`, createdById: teacherId, accessoScuola: "EDITOR" },
  })).id;
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
});

// Fino al Task 7 del Nuovo compito qui si provava anche `assegna` (la
// vecchia assegnazione di un "compito preparato"): tolta, le sue prove sono
// andate con lei — la pesca, la capienza, le classi e le date di
// `assegnaCompito` hanno le loro in assegna-compito.test.ts. Restano le
// prove di ciò che si legge da un compito già dato, che ora nasce da
// `assegnaPerProva` (i blocchi di una batteria di prova, modo CLASSE).
describe("compiti già assegnati", () => {
  it("lo studente vede il compito della sua classe e quanti esercizi ha fatto", async () => {
    const r = await assegnaPerProva(batteriaId, classeId, teacherId);
    if (!r.ok) throw new Error("assegnazione fallita");
    const suoi = await compitiDelloStudente(studentId);
    expect(suoi).toHaveLength(1);
    expect(suoi[0]!.esercizi).toHaveLength(3);
    expect(suoi[0]!.fatti).toBe(0);
  });

  it("le consegne elencano tutti gli studenti, anche chi non ha iniziato", async () => {
    const r = await assegnaPerProva(batteriaId, classeId, teacherId);
    if (!r.ok) throw new Error("assegnazione fallita");
    const righe = await righeDi(r.compitoId);
    expect(righe).toHaveLength(2);
    expect(righe.every((x) => x.fatti === 0)).toBe(true);
  });

  // Fix round 1: `consegneDelCompito` non controllava affatto chi guardava.
  // L'assegnazione fa già esattamente il controllo che serve sulla
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
      const r = await assegnaPerProva(batteriaId, classeAltrui, teacherAltro);
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
    // l'assegnazione usa già per lo stesso identico controllo sulla scrittura.
    it("un docente che non insegna quella classe viene rifiutato, con lo stesso motivo dell'assegnazione", async () => {
      const r = await assegnaPerProva(batteriaId, classeAltrui, teacherAltro);
      if (!r.ok) throw new Error("assegnazione fallita");
      const esito = await consegneDelCompito(r.compitoId, teacherId);
      expect(esito).toEqual({ ok: false, motivo: "non_insegni_questa_classe" });
    });

    // Decisione deliberata (vedi il report): un ADMIN non ha, in questo
    // dominio, un accesso privilegiato alle classi altrui — esattamente come
    // l'assegnazione non gli concede di dare un compito a una classe che non insegna.
    // Nessuna eccezione di ruolo qui: la stessa regola, per chiunque guardi.
    it("un ADMIN che non insegna quella classe viene rifiutato allo stesso modo", async () => {
      const r = await assegnaPerProva(batteriaId, classeAltrui, teacherAltro);
      if (!r.ok) throw new Error("assegnazione fallita");
      const esito = await consegneDelCompito(r.compitoId, adminId);
      expect(esito).toEqual({ ok: false, motivo: "non_insegni_questa_classe" });
    });
  });

  it("compitiDellaClasse riporta il nome del compito e il numero di esercizi", async () => {
    const r = await assegnaPerProva(batteriaId, classeId, teacherId);
    if (!r.ok) throw new Error("assegnazione fallita");
    const dellaClasse = await compitiDellaClasse(classeId);
    expect(dellaClasse).toHaveLength(1);
    // Il nome è quello della batteria automatica del compito: le etichette
    // dei blocchi con quanti esercizi ciascuno.
    expect(dellaClasse[0]).toMatchObject({ id: r.compitoId, batteria: `${P}Equazioni (3)`, esercizi: 3 });
  });

  // I tre casi limite che la spec dichiara e che senza un test resterebbero
  // opinioni.

  it("chi entra nella classe DOPO l'assegnazione vede comunque il compito", async () => {
    const r = await assegnaPerProva(batteriaId, classeId, teacherId);
    if (!r.ok) throw new Error("assegnazione fallita");
    const tardivo = await prisma.user.create({ data: { email: `${P}tardivo@test.it`, name: "T", role: "STUDENT" } });
    await prisma.classeStudente.create({ data: { classeId, studentId: tardivo.id } });
    const suoi = await compitiDelloStudente(tardivo.id);
    expect(suoi.map((c) => c.id)).toContain(r.compitoId);
    expect(await righeDi(r.compitoId)).toHaveLength(3);
  });

  it("chi esce dalla classe sparisce dalle consegne ma i suoi tentativi restano", async () => {
    const r = await assegnaPerProva(batteriaId, classeId, teacherId);
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
    const r = await assegnaPerProva(batteriaId, vuota.id, teacherId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await righeDi(r.compitoId)).toEqual([]);
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
      const r = await assegnaPerProva(batteriaId, classeId, teacherId); // pesca 3 da contenitoreId
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
      const r = await assegnaPerProva(batteriaId, classeId, teacherId);
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

  // Fix round finale, item 2: la revisione ha dimostrato che un'assegnazione
  // può diventare illeggibile da CHIUNQUE. `dichiaraInsegnamento` è una
  // sostituzione integrale (dominio, classi.ts): un docente che smette di
  // insegnare la classe (anche per errore, con due schede aperte) perde
  // l'unico controllo che prima autorizzava `consegneDelCompito` — pur
  // essendo lui ad aver creato quel compito.
  describe("chi ha assegnato il compito lo vede sempre, anche se non insegna più la classe", () => {
    it("il docente che ha smesso di insegnare la classe vede comunque le proprie consegne", async () => {
      const r = await assegnaPerProva(batteriaId, classeId, teacherId);
      if (!r.ok) throw new Error("assegnazione fallita");

      // Sostituzione integrale dell'elenco insegnato: `teacherId` smette di
      // insegnare QUALUNQUE classe, `classeId` compresa — esattamente ciò
      // che succede salvando da una scheda rimasta indietro con la casella
      // di `classeId` scoperta.
      await dichiaraInsegnamento(teacherId, []);

      const esito = await consegneDelCompito(r.compitoId, teacherId);
      // Prima del fix: `{ ok: false, motivo: "non_insegni_questa_classe" }`
      // — il docente che aveva assegnato il compito, cacciato dalle proprie
      // consegne.
      expect(esito.ok).toBe(true);
      if (!esito.ok) return;
      expect(esito.righe).toHaveLength(2);
    });

    it("un terzo docente che non insegna la classe e non ha assegnato il compito resta rifiutato", async () => {
      const r = await assegnaPerProva(batteriaId, classeId, teacherId);
      if (!r.ok) throw new Error("assegnazione fallita");
      await dichiaraInsegnamento(teacherId, []);

      // `teacherAltro` non insegna `classeId` (insegna solo `classeAltrui`,
      // vedi il beforeEach) e non è lui ad aver assegnato questo compito: la
      // seconda clausola non deve allargare l'accesso a chiunque, solo a
      // chi ha davvero assegnato quel compito.
      const esito = await consegneDelCompito(r.compitoId, teacherAltro);
      expect(esito).toEqual({ ok: false, motivo: "non_insegni_questa_classe" });
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
      const r = await assegnaPerProva(batteriaId, classeId, teacherId); // 3 pescati
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

// Spec "Batterie": l'estrazione usa solo esercizi visibili a chi assegna —
// anche quella di `assegnaCompito`, l'unica assegnazione rimasta.
describe("assegnare e visibilità", () => {
  it("una raccolta che chi assegna non vede pesca zero: esercizi_insufficienti, nessun compito", async () => {
    const privata = (await prisma.contenitore.create({ data: { name: `${P}Privata`, createdById: teacherId } })).id;
    await prisma.contenitoreEsercizio.create({ data: { contenitoreId: privata, esercizioId: esercizioExtra, addedById: teacherId } });
    const batt = (await creaBatteria(teacherId, `${P}DaPrivata`, [{ contenitoreId: privata, count: 1 }])).id;

    const prima = await prisma.compito.count({ where: { classeId: classeAltrui } });
    const r = await assegnaPerProva(batt, classeAltrui, teacherAltro);
    expect(r).toMatchObject({ ok: false, motivo: "esercizi_insufficienti" });
    if (r.ok) return;
    // Il nome della raccolta non trapela: per chi non la vede è "non disponibile".
    expect(r.riepilogo!.blocchi).toEqual([
      { etichetta: "Raccolta non disponibile", richiesti: 1, disponibili: 0, nonDisponibili: [] },
    ]);
    expect(await prisma.compito.count({ where: { classeId: classeAltrui } })).toBe(prima);
    // Il proprietario della raccolta, invece, assegna senza problemi.
    expect((await assegnaPerProva(batt, classeId, teacherId)).ok).toBe(true);
  });

  it("non pesca mai un esercizio privato altrui finito in una raccolta visibile", async () => {
    const privato = (await prisma.esercizio.create({
      data: { id: `${P}privato`, title: "Privato", yearLevel: 2, topic: "prova", tags: [], difficulty: 1, authorId: teacherAltro },
    })).id;
    await prisma.esercizioVersione.create({ data: { esercizioId: privato, version: 1, content: {}, hash: `h-${P}privato` } });
    const sola = (await prisma.contenitore.create({
      data: { name: `${P}SoloPrivato`, createdById: teacherAltro, accessoScuola: "EDITOR" },
    })).id;
    // Ce l'ha messo un altro (teacherId), non l'autore: non si trasmette.
    await prisma.contenitoreEsercizio.create({ data: { contenitoreId: sola, esercizioId: privato, addedById: teacherId } });
    const batt = (await creaBatteria(teacherId, `${P}SoloPrivato`, [{ contenitoreId: sola, count: 1 }])).id;

    const r = await assegnaPerProva(batt, classeId, teacherId);
    expect(r).toMatchObject({ ok: false, motivo: "esercizi_insufficienti" });
    if (r.ok) return;
    expect(r.riepilogo!.blocchi[0]).toMatchObject({ richiesti: 1, disponibili: 0 });
  });
});
