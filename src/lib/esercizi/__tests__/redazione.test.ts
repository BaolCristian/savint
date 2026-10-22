import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { prisma } from "@/lib/db/client";
import { loadQuestion } from "@savint/engine";
import {
  creaEsercizio, salvaNuovaVersione, duplicaEsercizio, elencoRedazione, caricaPerEditor, caricaPerAnteprima,
} from "../redazione";
import { seedEsercizi } from "../seed";
import { creaBatteria as creaBatteriaGrezza } from "../batterie";
import { creaContenitore, aggiungiEsercizi } from "../contenitori";
import { assegna, consegneDelCompito } from "../compiti";
import { avviaORiprendi, applicaRisposta, completa } from "../tentativo";
import type { EsercizioEditor } from "../editor/modello";
import type { Utente } from "../accesso";

// Prefisso unico di questo file: Vitest esegue i file di test in parallelo
// sulle stesse tabelle (vedi il commento gemello in compiti.test.ts e
// tentativo.test.ts). Gli esercizi creati da `creaEsercizio` hanno un id
// cuid, non scelto da noi: si possiedono filtrando sul TITOLO, che
// controlliamo sempre. Gli esercizi seminati da `seedEsercizi` (per il test
// sul corpus reale) hanno invece un id scelto da noi (il nome del file): si
// possiedono filtrando sull'id. Il pulisci() sotto copre entrambi i casi con
// un OR, cosi' nessuna riga di questo file resta residua per gli altri.
const PREFIX = "redazionetest-";

let docenteId: string;
let altroDocenteId: string;
let estraneoId: string;
let classeId: string;
// Le stesse persone viste dalla regola di accesso: nessuno è ADMIN.
let docente: Utente;
let altroDocente: Utente;
let estraneo: Utente;

const base: EsercizioEditor = {
  meta: { titolo: `${PREFIX}Equazione`, descrizione: "", anno: 1, argomento: "equazioni", tag: [], difficolta: 1 },
  testo: "Risolvi \\(\\simplify{ {a}x+{b} }=0\\)",
  suggerimento: "",
  variabili: [
    { nome: "a", definizione: "random(2..9)", descrizione: "" },
    { nome: "b", definizione: "random(-9..9 except 0)", descrizione: "" },
  ],
  condizione: "",
  parti: [{ tipo: "numerica", consegna: "\\(x=\\)", punti: 2, valore: "-b/a", tolleranza: { tipo: "esatta" } }],
};

// Fallisce la verifica DETERMINISTICAMENTE, in fase "testo" (controllo
// statico, nessun caricamento del motore), senza dover contare su un seme
// intermittente: "zeta" non e' fra le variabili dichiarate. E' lo stesso
// meccanismo che editor/__tests__/verifica.test.ts usa per lo stesso scopo.
const inputRotto: EsercizioEditor = { ...base, testo: "Il valore e' \\(\\var{zeta}\\)" };

async function pulisci() {
  await prisma.tentativo.deleteMany({ where: { student: { email: { startsWith: PREFIX } } } });
  await prisma.compito.deleteMany({ where: { batteria: { name: { startsWith: PREFIX } } } });
  await prisma.batteriaRegola.deleteMany({ where: { batteria: { name: { startsWith: PREFIX } } } });
  await prisma.batteria.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.contenitoreEsercizio.deleteMany({ where: { contenitore: { name: { startsWith: PREFIX } } } });
  await prisma.contenitore.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.classeDocente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: PREFIX } } } });
  await prisma.classeStudente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: PREFIX } } } });
  await prisma.classe.deleteMany({ where: { googleGroupEmail: { startsWith: PREFIX } } });
  await prisma.esercizioVersione.deleteMany({
    where: { esercizio: { OR: [{ id: { startsWith: PREFIX } }, { title: { startsWith: PREFIX } }] } },
  });
  await prisma.esercizio.deleteMany({
    where: { OR: [{ id: { startsWith: PREFIX } }, { title: { startsWith: PREFIX } }] },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

// Il conteggio delle righe possedute da QUESTO file, non l'intera tabella:
// altri file di test creano e cancellano proprie righe Esercizio nello
// stesso istante (esecuzione in parallelo), quindi un conteggio senza filtro
// sarebbe soggetto a un rumore che non ha niente a che fare con la funzione
// sotto test — esattamente il tipo di instabilita' che la scansione del
// piano chiede di evitare (vedi il rapporto).
async function contaEserciziDiQuestoFile(): Promise<number> {
  return prisma.esercizio.count({
    where: { OR: [{ id: { startsWith: PREFIX } }, { title: { startsWith: PREFIX } }] },
  });
}

beforeEach(async () => {
  await pulisci();
  docenteId = (await prisma.user.create({ data: { email: `${PREFIX}d@test.it`, name: "Docente", role: "TEACHER" } })).id;
  altroDocenteId = (await prisma.user.create({ data: { email: `${PREFIX}d2@test.it`, name: "Docente Due", role: "TEACHER" } })).id;
  estraneoId = (await prisma.user.create({ data: { email: `${PREFIX}d3@test.it`, name: "Estraneo", role: "TEACHER" } })).id;
  docente = { id: docenteId, admin: false };
  altroDocente = { id: altroDocenteId, admin: false };
  estraneo = { id: estraneoId, admin: false };
  classeId = (await prisma.classe.create({
    data: { googleGroupEmail: `${PREFIX}classe@scuola.it`, name: "Classe", yearLevel: 1 },
  })).id;
  await prisma.classeDocente.create({ data: { classeId, teacherId: docenteId } });
});

afterAll(async () => {
  await pulisci();
});

describe("creaEsercizio", () => {
  it("un esercizio sano viene scritto: riga Esercizio + prima versione", async () => {
    const esito = await creaEsercizio(base, docenteId);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.versione).toBe(1);

    const riga = await prisma.esercizio.findUniqueOrThrow({ where: { id: esito.esercizioId } });
    expect(riga.title).toBe(base.meta.titolo);
    expect(riga.authorId).toBe(docenteId);

    const versioni = await prisma.esercizioVersione.findMany({ where: { esercizioId: esito.esercizioId } });
    expect(versioni).toHaveLength(1);
    expect(versioni[0]!.version).toBe(1);
  });

  it("un esercizio che fallisce la verifica non lascia nessuna riga", async () => {
    const quante = await contaEserciziDiQuestoFile();
    const esito = await creaEsercizio(inputRotto, docenteId);
    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(esito.motivo).toBe("verifica_fallita");
    expect(await contaEserciziDiQuestoFile()).toBe(quante);
  });
});

describe("salvaNuovaVersione", () => {
  it("crea version = max(version) + 1 e non tocca la versione precedente", async () => {
    const creato = await creaEsercizio(base, docenteId);
    if (!creato.ok) throw new Error("creazione fallita");

    const esito = await salvaNuovaVersione(creato.esercizioId, { ...base, testo: "cambiato davvero" }, docente);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.versione).toBe(2);

    const versioni = await prisma.esercizioVersione.findMany({
      where: { esercizioId: creato.esercizioId },
      orderBy: { version: "asc" },
    });
    expect(versioni.map((v) => v.version)).toEqual([1, 2]);
    expect((versioni[0]!.content as { statement: string }).statement).not.toContain("cambiato davvero");
    expect((versioni[1]!.content as { statement: string }).statement).toContain("cambiato davvero");
  });

  it("aggiorna i metadati sulla riga Esercizio, non il contenuto della versione vecchia", async () => {
    const creato = await creaEsercizio(base, docenteId);
    if (!creato.ok) throw new Error("creazione fallita");

    const nuovoInput: EsercizioEditor = {
      ...base,
      meta: { ...base.meta, titolo: `${PREFIX}Titolo Nuovo`, anno: 3, argomento: "goniometria", difficolta: 2, tag: ["a", "b"] },
    };
    const esito = await salvaNuovaVersione(creato.esercizioId, nuovoInput, docente);
    expect(esito.ok).toBe(true);

    const riga = await prisma.esercizio.findUniqueOrThrow({ where: { id: creato.esercizioId } });
    expect(riga.title).toBe(`${PREFIX}Titolo Nuovo`);
    expect(riga.yearLevel).toBe(3);
    expect(riga.topic).toBe("goniometria");
    expect(riga.difficulty).toBe(2);
    expect(riga.tags).toEqual(["a", "b"]);
  });

  it("un esercizio inesistente non si salva", async () => {
    const esito = await salvaNuovaVersione("non-esiste", base, docente);
    expect(esito).toMatchObject({ ok: false, motivo: "non_trovato" });
  });

  it("il rifiuto per verifica fallita non crea una nuova versione ne' tocca i metadati", async () => {
    const creato = await creaEsercizio(base, docenteId);
    if (!creato.ok) throw new Error("creazione fallita");

    const esito = await salvaNuovaVersione(creato.esercizioId, { ...inputRotto, meta: { ...inputRotto.meta, titolo: `${PREFIX}Non deve arrivare` } }, docente);
    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(esito.motivo).toBe("verifica_fallita");

    const versioni = await prisma.esercizioVersione.findMany({ where: { esercizioId: creato.esercizioId } });
    expect(versioni).toHaveLength(1);
    const riga = await prisma.esercizio.findUniqueOrThrow({ where: { id: creato.esercizioId } });
    expect(riga.title).toBe(base.meta.titolo);
  });

  // Il test che conta di piu': un compito gia' assegnato punta a una
  // EsercizioVersione precisa (drawnVersionIds). Un docente deve poter
  // correggere l'esercizio mentre trenta studenti lo stanno gia' facendo,
  // senza spostare sotto i loro piedi la versione a cui il compito punta.
  //
  // Riscritto nell'Onda di correzioni finale (C2): la versione precedente
  // di questo test asseriva solo che la riga `Compito` e il CONTENUTO della
  // vecchia versione restassero immutati — vero per costruzione (niente in
  // questo modulo li tocca mai: `salvaNuovaVersione` crea sempre una riga
  // NUOVA, non aggiorna quella vecchia), quindi il test passava anche col
  // difetto C2 ancora presente. Il difetto vero non era nella scrittura,
  // era nella LETTURA: `avviaORiprendi` apriva sempre l'ULTIMA versione,
  // mai quella pescata dal compito. Qui si verifica cosa ottiene DAVVERO lo
  // studente, end-to-end: stesso tentativo, stesso seme, stessa versione
  // pescata, e un completamento che il docente vede ancora contare dopo che
  // ha salvato una correzione.
  it("un docente puo' correggere un esercizio gia' assegnato senza distruggere il tentativo in corso dello studente", async () => {
    // Risposta un intero puro ("k", non "-b/a"): stesso schema del corpus
    // reale (01-equazione-primo-grado.json). Evita due fonti di rumore
    // estranee a C2 — un decimale periodico con tolleranza esatta, e una
    // stringa come "-1,125" che lo spacchettamento delle notazioni (la
    // virgola italiana letta come separatore delle migliaia inglese)
    // potrebbe interpretare in modo ambiguo — cosi' un fallimento del
    // punteggio pieno qui puo' significare solo una cosa: la versione
    // sbagliata, non un artefatto della marcatura.
    const esercizio: EsercizioEditor = { ...base, testo: "x",
      variabili: [{ nome: "k", definizione: "random(-9..9 except 0)", descrizione: "" }],
      parti: [{ tipo: "numerica", consegna: "\\(x=\\)", punti: 2, valore: "k", tolleranza: { tipo: "esatta" } }] };
    const creato = await creaEsercizio(esercizio, docenteId);
    if (!creato.ok) throw new Error("creazione fallita");

    const contenitoreId = (await creaContenitore(docenteId, `${PREFIX}Contenitore`)).id;
    await aggiungiEsercizi(contenitoreId, [creato.esercizioId], { id: docenteId, admin: false });
    const batteria = await creaBatteriaGrezza(docenteId, `${PREFIX}Batteria`, [{ contenitoreId, count: 1 }]);
    if (!batteria.ok) throw new Error("creazione batteria fallita");
    const assegnazione = await assegna(batteria.id, classeId, docenteId);
    if (!assegnazione.ok) throw new Error("assegnazione fallita");

    const compitoPrima = await prisma.compito.findUniqueOrThrow({ where: { id: assegnazione.compitoId } });
    const prima = compitoPrima.drawnVersionIds;
    expect(prima).toHaveLength(1);

    // Lo studente apre l'esercizio assegnato PRIMA che il docente lo
    // corregga: un tentativo, un seme, sulla versione pescata.
    const studenteId = (await prisma.user.create({
      data: { email: `${PREFIX}studente@test.it`, name: "Studente", role: "STUDENT" },
    })).id;
    await prisma.classeStudente.create({ data: { classeId, studentId: studenteId } });
    const primoTentativo = await avviaORiprendi(studenteId, creato.esercizioId, assegnazione.compitoId);
    const rigaPrima = await prisma.tentativo.findUniqueOrThrow({ where: { id: primoTentativo!.tentativoId } });
    expect(rigaPrima.esercizioVersioneId).toBe(prima[0]);

    const esito = await salvaNuovaVersione(creato.esercizioId, { ...base, testo: "cambiato" }, docente);
    expect(esito.ok).toBe(true);

    const compitoDopo = await prisma.compito.findUniqueOrThrow({ where: { id: assegnazione.compitoId } });
    expect(compitoDopo.drawnVersionIds).toEqual(prima);

    const v1 = await prisma.esercizioVersione.findUniqueOrThrow({ where: { id: prima[0]! } });
    expect((v1.content as { statement: string }).statement).not.toContain("cambiato");
    expect(v1.version).toBe(1);

    // Lo studente torna sullo stesso link: deve ritrovare LO STESSO
    // tentativo, non uno nuovo sulla versione appena corretta.
    const secondoTentativo = await avviaORiprendi(studenteId, creato.esercizioId, assegnazione.compitoId);
    expect(secondoTentativo!.tentativoId).toBe(primoTentativo!.tentativoId);
    expect(secondoTentativo!.seed).toBe(primoTentativo!.seed);
    const rigaSeconda = await prisma.tentativo.findUniqueOrThrow({ where: { id: secondoTentativo!.tentativoId } });
    expect(rigaSeconda.esercizioVersioneId).toBe(prima[0]);

    // Lo finisce, con la risposta giusta: il completamento va a buon fine e
    // il docente lo vede contare come consegna, non zero su tre.
    const q = loadQuestion(secondoTentativo!.content as never, { seed: secondoTentativo!.seed, locale: "it" });
    const p = q.getPart("p0")!;
    const giusta = p.correctAnswer();
    p.submit(giusta);
    q.updateScore();
    const rispostaOk = await applicaRisposta(secondoTentativo!.tentativoId, studenteId, "p0", giusta, q.toState(), "it");
    expect(rispostaOk.ok).toBe(true);

    const completamento = await completa(secondoTentativo!.tentativoId, studenteId, "it");
    expect(completamento.ok).toBe(true);
    if (completamento.ok) {
      expect(completamento.score).toBe(completamento.maxScore);
      expect(completamento.score).toBeGreaterThan(0);
    }

    const consegne = await consegneDelCompito(assegnazione.compitoId, docenteId);
    if (!consegne.ok) throw new Error("consegneDelCompito rifiutato inaspettatamente");
    const rigaConsegna = consegne.righe.find((r) => r.studentId === studenteId)!;
    expect(rigaConsegna.fatti).toBe(1);
    expect(rigaConsegna.punteggio).toBe(rigaConsegna.massimo);
  });
});

describe("duplicaEsercizio", () => {
  it("crea un Esercizio nuovo con version = 1 e authorId di chi duplica", async () => {
    const creato = await creaEsercizio(base, docenteId);
    if (!creato.ok) throw new Error("creazione fallita");

    // Un esercizio nuovo è privato: perché il collega lo veda (e quindi
    // possa duplicarlo) lo si apre alla scuola, come gli esercizi di prima.
    await prisma.esercizio.update({ where: { id: creato.esercizioId }, data: { accessoScuola: "EDITOR" } });

    const esito = await duplicaEsercizio(creato.esercizioId, altroDocente);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.versione).toBe(1);
    expect(esito.esercizioId).not.toBe(creato.esercizioId);

    const copia = await prisma.esercizio.findUniqueOrThrow({ where: { id: esito.esercizioId } });
    expect(copia.authorId).toBe(altroDocenteId);
    // Il titolo porta "(copia)" in coda: senza, l'elenco mostrerebbe due
    // righe con lo stesso identico titolo, distinguibili solo aprendole.
    expect(copia.title).toBe(`${base.meta.titolo} (copia)`);

    const originale = await prisma.esercizio.findUniqueOrThrow({ where: { id: creato.esercizioId } });
    expect(originale.authorId).toBe(docenteId);

    const versioniCopia = await prisma.esercizioVersione.findMany({ where: { esercizioId: esito.esercizioId } });
    expect(versioniCopia).toHaveLength(1);
  });

  // La funzione stessa non guarda `daNumbas` (vedi il commento su
  // `duplicaEsercizio`): duplica un contenuto non rappresentabile
  // altrettanto fedelmente di uno modificabile. È l'elenco della
  // redazione a non chiamarla per queste righe — offrire "duplica" lì
  // lascerebbe solo un'altra riga di sola lettura (vedi
  // `redazione/__tests__/page.test.tsx`, che prova entrambe le direzioni).
  it("duplica anche un esercizio che l'editor non sa rappresentare, benché l'elenco non offra il pulsante per queste righe", async () => {
    // Costruito a mano: un tipo di parte (m_n_2) che daNumbas rifiuta.
    const originale = await prisma.esercizio.create({
      data: { title: `${PREFIX}Non modificabile`, yearLevel: 1, topic: "prova", tags: [], difficulty: 1, authorId: docenteId, accessoScuola: "EDITOR" },
    });
    await prisma.esercizioVersione.create({
      data: {
        esercizioId: originale.id, version: 1,
        content: { name: "x", statement: "<p>x</p>", variables: {}, parts: [{ type: "m_n_2", marks: 1 }] },
        hash: "hash-non-rappresentabile",
      },
    });

    const esito = await duplicaEsercizio(originale.id, altroDocente);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    const versioneCopia = await prisma.esercizioVersione.findUniqueOrThrow({ where: { esercizioId_version: { esercizioId: esito.esercizioId, version: 1 } } });
    expect(versioneCopia.content).toEqual({ name: "x", statement: "<p>x</p>", variables: {}, parts: [{ type: "m_n_2", marks: 1 }] });
  });

  it("un esercizio inesistente non si duplica", async () => {
    const esito = await duplicaEsercizio("non-esiste", docente);
    expect(esito).toMatchObject({ ok: false, motivo: "non_trovato" });
  });
});

describe("caricaPerEditor", () => {
  it("un esercizio inesistente restituisce non_trovato", async () => {
    const esito = await caricaPerEditor("non-esiste", docente);
    expect(esito).toMatchObject({ ok: false, motivo: "non_trovato" });
  });

  it("un esercizio sano si ricarica con lo stesso editor, la versione, l'autore e la data", async () => {
    const creato = await creaEsercizio(base, docenteId);
    if (!creato.ok) throw new Error("creazione fallita");

    const esito = await caricaPerEditor(creato.esercizioId, docente);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.editor).toEqual(base);
    expect(esito.versione).toBe(1);
    expect(esito.autoreNome).toBe("Docente");
    expect(esito.aggiornatoIl).toBeInstanceOf(Date);
  });

  // La regola del task: la riga Esercizio e' autorevole per i metadati. Qui
  // si simula lo scarto (a mano, con Prisma diretto — la stessa tecnica che
  // compiti.test.ts usa per costruire stati altrimenti irraggiungibili):
  // la riga viene aggiornata FUORI dal percorso normale (che aggiornerebbe
  // anche una nuova versione), cosi' il titolo della riga diverge da
  // qualunque cosa la versione salvata porti con se'.
  it("il titolo della riga vince su quello della versione salvata quando divergono", async () => {
    const creato = await creaEsercizio(base, docenteId);
    if (!creato.ok) throw new Error("creazione fallita");

    await prisma.esercizio.update({
      where: { id: creato.esercizioId },
      data: { title: `${PREFIX}Titolo Corretto Dopo` },
    });

    const esito = await caricaPerEditor(creato.esercizioId, docente);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.editor.meta.titolo).toBe(`${PREFIX}Titolo Corretto Dopo`);
    expect(esito.editor.meta.titolo).not.toBe(base.meta.titolo);
  });

  it("un esercizio non rappresentabile restituisce il rifiuto col dettaglio, mai un modello parziale", async () => {
    const esercizio = await prisma.esercizio.create({
      data: { title: `${PREFIX}Non modificabile 2`, yearLevel: 1, topic: "prova", tags: [], difficulty: 1, accessoScuola: "EDITOR" },
    });
    await prisma.esercizioVersione.create({
      data: {
        esercizioId: esercizio.id, version: 1,
        content: { name: "x", statement: "<p>x</p>", variables: {}, parts: [{ type: "m_n_2", marks: 1 }] },
        hash: "hash-non-rappresentabile-2",
      },
    });

    const esito = await caricaPerEditor(esercizio.id, docente);
    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(esito.motivo).toBe("non_rappresentabile");
    expect(typeof esito.dettaglio).toBe("string");
    expect(esito.dettaglio.length).toBeGreaterThan(0);
    expect("editor" in esito).toBe(false);
  });
});

describe("elencoRedazione", () => {
  it("elenca un esercizio appena creato come modificabile, con l'autore", async () => {
    const creato = await creaEsercizio(base, docenteId);
    if (!creato.ok) throw new Error("creazione fallita");

    const elenco = await elencoRedazione(docente);
    const voce = elenco.find((v) => v.id === creato.esercizioId);
    expect(voce).toBeDefined();
    expect(voce!.titolo).toBe(base.meta.titolo);
    expect(voce!.argomento).toBe(base.meta.argomento);
    expect(voce!.anno).toBe(base.meta.anno);
    expect(voce!.ultimaVersione).toBe(1);
    expect(voce!.modificabile).toBe(true);
    expect(voce!.autoreNome).toBe("Docente");
    // Onda finale, I5: nessun motivo per un esercizio modificabile.
    expect(voce!.motivo).toBeNull();
  });

  // Onda finale, I5: `motivo` viene ora da `elencoRedazione` stessa (lo
  // stesso `dettaglio` di `daNumbas` usato per calcolare `modificabile`),
  // non più da una rilettura separata con `caricaPerEditor` — vedi il
  // commento su `VoceRedazione.motivo`.
  it("marca non modificabile un esercizio che daNumbas rifiuta e ne porta il motivo", async () => {
    const esercizio = await prisma.esercizio.create({
      data: { title: `${PREFIX}Elenco non modificabile`, yearLevel: 1, topic: "prova", tags: [], difficulty: 1, accessoScuola: "EDITOR" },
    });
    await prisma.esercizioVersione.create({
      data: {
        esercizioId: esercizio.id, version: 1,
        content: { name: "x", statement: "<p>x</p>", variables: {}, parts: [{ type: "m_n_2", marks: 1 }] },
        hash: "hash-elenco-non-modificabile",
      },
    });

    const elenco = await elencoRedazione(docente);
    const voce = elenco.find((v) => v.id === esercizio.id);
    expect(voce).toBeDefined();
    expect(voce!.modificabile).toBe(false);
    expect(typeof voce!.motivo).toBe("string");
    expect(voce!.motivo!.length).toBeGreaterThan(0);
  });

  // Il corpus reale seminato da `content/esercizi/`: la tabella di
  // rappresentabilita' che editor/__tests__/da-numbas.test.ts fissa (01 e 02
  // si', il resto no) deve valere anche passando dal database, non solo
  // leggendo il file direttamente — e' proprio quel percorso che
  // `elencoRedazione` usa davvero.
  // Dal pacchetto «Percentuali» (09-17), scritti con l'editor stesso: tutti
  // modificabili, come i due originali scritti nella forma dell'editor.
  it("degli esercizi seminati sono modificabili 01, 02 e tutto il pacchetto delle percentuali", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "redazionetest-corpus-"));
    const corpusDir = path.resolve(process.cwd(), "content/esercizi");
    const nomi = readdirSync(corpusDir).filter((f) => f.endsWith(".json"));
    for (const nome of nomi) {
      writeFileSync(path.join(dir, `${PREFIX}${nome}`), readFileSync(path.join(corpusDir, nome)));
    }
    await seedEsercizi(dir);

    const elenco = await elencoRedazione(docente);
    const miei = elenco.filter((v) => v.id.startsWith(PREFIX));
    expect(miei).toHaveLength(17);

    const modificabili = miei.filter((v) => v.modificabile).map((v) => v.id).sort();
    expect(modificabili).toEqual([
      `${PREFIX}01-equazione-primo-grado`,
      `${PREFIX}02-scomposizione-polinomi`,
      `${PREFIX}09-percentuale-di-un-numero`,
      `${PREFIX}10-sconto`,
      `${PREFIX}11-iva`,
      `${PREFIX}12-percentuale-da-trovare`,
      `${PREFIX}13-totale-dalla-parte`,
      `${PREFIX}14-percentuali-frazioni-decimali`,
      `${PREFIX}15-variazione-percentuale`,
      `${PREFIX}16-sconti-successivi`,
      `${PREFIX}17-interesse-semplice`,
    ]);
  });
});

// Il gap che questo task chiude: un docente non poteva vedere sei degli
// otto esercizi seminati, perché l'unico posto dove il player rendeva un
// esercizio fuori dalla pagina dello studente era l'anteprima dell'editor —
// che apre solo ciò che `daNumbas` sa ricostruire. `caricaPerAnteprima`
// prende invece SEMPRE il contenuto grezzo dell'ultima versione, mai
// passato da `daNumbas`: a differenza di `caricaPerEditor` sopra, un
// esercizio non rappresentabile qui è comunque `ok: true`.
describe("caricaPerAnteprima", () => {
  it("un esercizio inesistente restituisce non_trovato", async () => {
    const esito = await caricaPerAnteprima("non-esiste", docente);
    expect(esito).toEqual({ ok: false, motivo: "non_trovato" });
  });

  it("un esercizio senza nessuna versione salvata restituisce senza_versione, mai un player vuoto", async () => {
    const esercizio = await prisma.esercizio.create({
      data: { title: `${PREFIX}Senza versione`, yearLevel: 1, topic: "prova", tags: [], difficulty: 1, accessoScuola: "EDITOR" },
    });

    const esito = await caricaPerAnteprima(esercizio.id, docente);
    expect(esito).toEqual({ ok: false, motivo: "senza_versione" });
  });

  it("un esercizio modificabile restituisce il contenuto grezzo della sua ultima versione", async () => {
    const creato = await creaEsercizio(base, docenteId);
    if (!creato.ok) throw new Error("creazione fallita");

    const esito = await caricaPerAnteprima(creato.esercizioId, docente);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.titolo).toBe(base.meta.titolo);
    expect(esito.versione).toBe(1);
    expect((esito.content as { statement: string }).statement).toBeDefined();
  });

  // Il caso che conta di più: `caricaPerEditor` rifiuterebbe questo stesso
  // esercizio (`m_n_2`, che `daNumbas` non sa ricostruire) con
  // `non_rappresentabile` — `caricaPerAnteprima` deve invece mostrarlo,
  // esattamente com'è, perché è precisamente per questi esercizi che
  // l'anteprima esiste.
  it("un esercizio che l'editor non sa ricostruire viene comunque restituito, col contenuto grezzo", async () => {
    const esercizio = await prisma.esercizio.create({
      data: { title: `${PREFIX}Anteprima non modificabile`, yearLevel: 1, topic: "prova", tags: [], difficulty: 1, accessoScuola: "EDITOR" },
    });
    const contenutoGrezzo = { name: "x", statement: "<p>x</p>", variables: {}, parts: [{ type: "m_n_2", marks: 1 }] };
    await prisma.esercizioVersione.create({
      data: { esercizioId: esercizio.id, version: 1, content: contenutoGrezzo, hash: "hash-anteprima-non-modificabile" },
    });

    const esito = await caricaPerAnteprima(esercizio.id, docente);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.content).toEqual(contenutoGrezzo);
  });

  it("con più versioni salvate restituisce sempre l'ultima, mai la prima", async () => {
    const creato = await creaEsercizio(base, docenteId);
    if (!creato.ok) throw new Error("creazione fallita");
    const salvato = await salvaNuovaVersione(creato.esercizioId, { ...base, testo: "seconda versione" }, docente);
    expect(salvato.ok).toBe(true);

    const esito = await caricaPerAnteprima(creato.esercizioId, docente);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.versione).toBe(2);
    expect((esito.content as { statement: string }).statement).toContain("seconda versione");
  });
});

// Proprietà e condivisione (spec "Il modello di accesso"): ogni funzione di
// questo modulo passa dal ruolo di chi chiede. Un esercizio che non vedi
// "non esiste" (mai un rifiuto che ne riveli l'esistenza); uno che vedi ma
// non puoi modificare è `sola_lettura`. Si guardano solo i propri id:
// `ruoliEsercizi` vede tutte le righe del database, anche degli altri file.
describe("proprietà e ruoli", () => {
  // Un esercizio privato del docente (come nasce oggi ogni esercizio).
  async function privatoDelDocente(): Promise<string> {
    const creato = await creaEsercizio(base, docenteId);
    if (!creato.ok) throw new Error("creazione fallita");
    return creato.esercizioId;
  }

  async function condividi(esercizioId: string, userId: string, ruolo: "VISUALIZZATORE" | "COMMENTATORE" | "EDITOR") {
    await prisma.condivisioneEsercizio.create({ data: { esercizioId, userId, ruolo } });
  }

  it("un esercizio nuovo nasce privato (accessoScuola null)", async () => {
    const id = await privatoDelDocente();
    const riga = await prisma.esercizio.findUniqueOrThrow({ where: { id } });
    expect(riga.accessoScuola).toBeNull();
  });

  it("l'elenco di un collega non contiene l'esercizio privato; dopo una condivisione sì, col suo ruolo", async () => {
    const id = await privatoDelDocente();
    expect((await elencoRedazione(altroDocente)).find((v) => v.id === id)).toBeUndefined();

    await condividi(id, altroDocenteId, "VISUALIZZATORE");
    const voce = (await elencoRedazione(altroDocente)).find((v) => v.id === id);
    expect(voce).toMatchObject({
      ruolo: "VISUALIZZATORE",
      proprietarioId: docenteId,
      proprietarioNome: "Docente",
      accesso: "condiviso",
    });
    // Chi non ha nessuna strada continua a non vederlo.
    expect((await elencoRedazione(estraneo)).find((v) => v.id === id)).toBeUndefined();
  });

  it("per il proprietario l'accesso dice privato, condiviso o scuola", async () => {
    const id = await privatoDelDocente();
    const voce = async () => (await elencoRedazione(docente)).find((v) => v.id === id);
    expect(await voce()).toMatchObject({ ruolo: "PROPRIETARIO", proprietarioId: docenteId, accesso: "privato" });

    await condividi(id, altroDocenteId, "EDITOR");
    expect((await voce())!.accesso).toBe("condiviso");

    await prisma.esercizio.update({ where: { id }, data: { accessoScuola: "VISUALIZZATORE" } });
    expect((await voce())!.accesso).toBe("scuola");
  });

  it("condiviso anche per argomento (senza differenza di maiuscole)", async () => {
    const id = await privatoDelDocente();
    await prisma.condivisioneArgomento.create({
      data: { ownerId: docenteId, chiave: "equazioni", argomento: "Equazioni", userId: altroDocenteId, ruolo: "COMMENTATORE" },
    });
    expect((await elencoRedazione(docente)).find((v) => v.id === id)!.accesso).toBe("condiviso");
    expect((await elencoRedazione(altroDocente)).find((v) => v.id === id)!.ruolo).toBe("COMMENTATORE");
  });

  it("condiviso se l'autore l'ha messo in una raccolta condivisa; non se ce l'ha messo un altro", async () => {
    const id = await privatoDelDocente();
    const raccolta = await prisma.contenitore.create({
      data: { name: `${PREFIX}Raccolta condivisa`, createdById: altroDocenteId, accessoScuola: "VISUALIZZATORE" },
    });
    // Messo da chi non ne è l'autore: la raccolta non lo trasmette.
    await prisma.contenitoreEsercizio.create({ data: { contenitoreId: raccolta.id, esercizioId: id, addedById: altroDocenteId } });
    expect((await elencoRedazione(docente)).find((v) => v.id === id)!.accesso).toBe("privato");

    await prisma.contenitoreEsercizio.update({
      where: { contenitoreId_esercizioId: { contenitoreId: raccolta.id, esercizioId: id } },
      data: { addedById: docenteId },
    });
    expect((await elencoRedazione(docente)).find((v) => v.id === id)!.accesso).toBe("condiviso");
  });

  it("caricaPerEditor: sola_lettura per un visualizzatore, non_trovato per un estraneo", async () => {
    const id = await privatoDelDocente();
    await condividi(id, altroDocenteId, "VISUALIZZATORE");
    expect(await caricaPerEditor(id, altroDocente)).toMatchObject({ ok: false, motivo: "sola_lettura" });
    expect(await caricaPerEditor(id, estraneo)).toMatchObject({ ok: false, motivo: "non_trovato" });
  });

  it("caricaPerEditor: un editor nominato apre l'editor", async () => {
    const id = await privatoDelDocente();
    await condividi(id, altroDocenteId, "EDITOR");
    expect((await caricaPerEditor(id, altroDocente)).ok).toBe(true);
  });

  it("salvaNuovaVersione: un visualizzatore viene rifiutato e non nasce nessuna versione", async () => {
    const id = await privatoDelDocente();
    await condividi(id, altroDocenteId, "COMMENTATORE");
    expect(await salvaNuovaVersione(id, { ...base, testo: "non deve arrivare" }, altroDocente))
      .toMatchObject({ ok: false, motivo: "sola_lettura" });
    expect(await salvaNuovaVersione(id, { ...base, testo: "non deve arrivare" }, estraneo))
      .toMatchObject({ ok: false, motivo: "non_trovato" });
    expect(await prisma.esercizioVersione.count({ where: { esercizioId: id } })).toBe(1);
  });

  it("salvaNuovaVersione: un editor nominato salva", async () => {
    const id = await privatoDelDocente();
    await condividi(id, altroDocenteId, "EDITOR");
    expect(await salvaNuovaVersione(id, { ...base, testo: "dal collega" }, altroDocente))
      .toMatchObject({ ok: true, versione: 2 });
  });

  it("duplicaEsercizio: un visualizzatore ottiene una copia sua e privata; un estraneo non_trovato", async () => {
    const id = await privatoDelDocente();
    await prisma.esercizio.update({ where: { id }, data: { accessoScuola: "VISUALIZZATORE" } });
    expect(await duplicaEsercizio(id, estraneo)).toMatchObject({ ok: true });

    // L'esercizio torna privato e condiviso col solo collega.
    await prisma.esercizio.update({ where: { id }, data: { accessoScuola: null } });
    await condividi(id, altroDocenteId, "VISUALIZZATORE");
    const esito = await duplicaEsercizio(id, altroDocente);
    if (!esito.ok) throw new Error("duplicazione rifiutata");
    const copia = await prisma.esercizio.findUniqueOrThrow({ where: { id: esito.esercizioId } });
    expect(copia.authorId).toBe(altroDocenteId);
    expect(copia.accessoScuola).toBeNull();
    expect(await duplicaEsercizio(id, estraneo)).toMatchObject({ ok: false, motivo: "non_trovato" });
  });

  it("caricaPerAnteprima: non_trovato per un estraneo, il ruolo per chi lo vede", async () => {
    const id = await privatoDelDocente();
    expect(await caricaPerAnteprima(id, estraneo)).toEqual({ ok: false, motivo: "non_trovato" });
    await condividi(id, altroDocenteId, "VISUALIZZATORE");
    expect(await caricaPerAnteprima(id, altroDocente)).toMatchObject({ ok: true, ruolo: "VISUALIZZATORE" });
    expect(await caricaPerAnteprima(id, docente)).toMatchObject({ ok: true, ruolo: "PROPRIETARIO" });
  });

  it("l'ADMIN vede e modifica anche un esercizio privato altrui", async () => {
    const id = await privatoDelDocente();
    const admin: Utente = { id: estraneoId, admin: true };
    expect((await elencoRedazione(admin)).find((v) => v.id === id)).toMatchObject({ ruolo: "PROPRIETARIO" });
    expect((await caricaPerEditor(id, admin)).ok).toBe(true);
  });
});
