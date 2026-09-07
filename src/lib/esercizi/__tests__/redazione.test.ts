import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, readdirSync, readFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { prisma } from "@/lib/db/client";
import {
  creaEsercizio, salvaNuovaVersione, duplicaEsercizio, elencoRedazione, caricaPerEditor,
} from "../redazione";
import { seedEsercizi } from "../seed";
import { creaBatteria as creaBatteriaGrezza } from "../batterie";
import { creaContenitore, aggiungiEsercizi } from "../contenitori";
import { assegna } from "../compiti";
import type { EsercizioEditor } from "../editor/modello";

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
let classeId: string;

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

    const esito = await salvaNuovaVersione(creato.esercizioId, { ...base, testo: "cambiato davvero" });
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
    const esito = await salvaNuovaVersione(creato.esercizioId, nuovoInput);
    expect(esito.ok).toBe(true);

    const riga = await prisma.esercizio.findUniqueOrThrow({ where: { id: creato.esercizioId } });
    expect(riga.title).toBe(`${PREFIX}Titolo Nuovo`);
    expect(riga.yearLevel).toBe(3);
    expect(riga.topic).toBe("goniometria");
    expect(riga.difficulty).toBe(2);
    expect(riga.tags).toEqual(["a", "b"]);
  });

  it("un esercizio inesistente non si salva", async () => {
    const esito = await salvaNuovaVersione("non-esiste", base);
    expect(esito).toMatchObject({ ok: false, motivo: "non_trovato" });
  });

  it("il rifiuto per verifica fallita non crea una nuova versione ne' tocca i metadati", async () => {
    const creato = await creaEsercizio(base, docenteId);
    if (!creato.ok) throw new Error("creazione fallita");

    const esito = await salvaNuovaVersione(creato.esercizioId, { ...inputRotto, meta: { ...inputRotto.meta, titolo: `${PREFIX}Non deve arrivare` } });
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
  it("salvare una versione nuova non tocca quella con cui un compito e' stato assegnato", async () => {
    const creato = await creaEsercizio(base, docenteId);
    if (!creato.ok) throw new Error("creazione fallita");

    const contenitoreId = (await creaContenitore(docenteId, `${PREFIX}Contenitore`)).id;
    await aggiungiEsercizi(contenitoreId, [creato.esercizioId]);
    const batteria = await creaBatteriaGrezza(docenteId, `${PREFIX}Batteria`, [{ contenitoreId, count: 1 }]);
    if (!batteria.ok) throw new Error("creazione batteria fallita");
    const assegnazione = await assegna(batteria.id, classeId, docenteId);
    if (!assegnazione.ok) throw new Error("assegnazione fallita");

    const compitoPrima = await prisma.compito.findUniqueOrThrow({ where: { id: assegnazione.compitoId } });
    const prima = compitoPrima.drawnVersionIds;
    expect(prima).toHaveLength(1);

    const esito = await salvaNuovaVersione(creato.esercizioId, { ...base, testo: "cambiato" });
    expect(esito.ok).toBe(true);

    const compitoDopo = await prisma.compito.findUniqueOrThrow({ where: { id: assegnazione.compitoId } });
    expect(compitoDopo.drawnVersionIds).toEqual(prima);

    const v1 = await prisma.esercizioVersione.findUniqueOrThrow({ where: { id: prima[0]! } });
    expect((v1.content as { statement: string }).statement).not.toContain("cambiato");
    expect(v1.version).toBe(1);
  });
});

describe("duplicaEsercizio", () => {
  it("crea un Esercizio nuovo con version = 1 e authorId di chi duplica", async () => {
    const creato = await creaEsercizio(base, docenteId);
    if (!creato.ok) throw new Error("creazione fallita");

    const esito = await duplicaEsercizio(creato.esercizioId, altroDocenteId);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.versione).toBe(1);
    expect(esito.esercizioId).not.toBe(creato.esercizioId);

    const copia = await prisma.esercizio.findUniqueOrThrow({ where: { id: esito.esercizioId } });
    expect(copia.authorId).toBe(altroDocenteId);
    expect(copia.title).toBe(base.meta.titolo);

    const originale = await prisma.esercizio.findUniqueOrThrow({ where: { id: creato.esercizioId } });
    expect(originale.authorId).toBe(docenteId);

    const versioniCopia = await prisma.esercizioVersione.findMany({ where: { esercizioId: esito.esercizioId } });
    expect(versioniCopia).toHaveLength(1);
  });

  it("duplica anche un esercizio che l'editor non sa rappresentare (la via d'uscita che i messaggi promettono)", async () => {
    // Costruito a mano: un tipo di parte (m_n_2) che daNumbas rifiuta.
    const originale = await prisma.esercizio.create({
      data: { title: `${PREFIX}Non modificabile`, yearLevel: 1, topic: "prova", tags: [], difficulty: 1, authorId: docenteId },
    });
    await prisma.esercizioVersione.create({
      data: {
        esercizioId: originale.id, version: 1,
        content: { name: "x", statement: "<p>x</p>", variables: {}, parts: [{ type: "m_n_2", marks: 1 }] },
        hash: "hash-non-rappresentabile",
      },
    });

    const esito = await duplicaEsercizio(originale.id, altroDocenteId);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    const versioneCopia = await prisma.esercizioVersione.findUniqueOrThrow({ where: { esercizioId_version: { esercizioId: esito.esercizioId, version: 1 } } });
    expect(versioneCopia.content).toEqual({ name: "x", statement: "<p>x</p>", variables: {}, parts: [{ type: "m_n_2", marks: 1 }] });
  });

  it("un esercizio inesistente non si duplica", async () => {
    const esito = await duplicaEsercizio("non-esiste", docenteId);
    expect(esito).toMatchObject({ ok: false, motivo: "non_trovato" });
  });
});

describe("caricaPerEditor", () => {
  it("un esercizio inesistente restituisce non_trovato", async () => {
    const esito = await caricaPerEditor("non-esiste");
    expect(esito).toMatchObject({ ok: false, motivo: "non_trovato" });
  });

  it("un esercizio sano si ricarica con lo stesso editor, la versione, l'autore e la data", async () => {
    const creato = await creaEsercizio(base, docenteId);
    if (!creato.ok) throw new Error("creazione fallita");

    const esito = await caricaPerEditor(creato.esercizioId);
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

    const esito = await caricaPerEditor(creato.esercizioId);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.editor.meta.titolo).toBe(`${PREFIX}Titolo Corretto Dopo`);
    expect(esito.editor.meta.titolo).not.toBe(base.meta.titolo);
  });

  it("un esercizio non rappresentabile restituisce il rifiuto col dettaglio, mai un modello parziale", async () => {
    const esercizio = await prisma.esercizio.create({
      data: { title: `${PREFIX}Non modificabile 2`, yearLevel: 1, topic: "prova", tags: [], difficulty: 1 },
    });
    await prisma.esercizioVersione.create({
      data: {
        esercizioId: esercizio.id, version: 1,
        content: { name: "x", statement: "<p>x</p>", variables: {}, parts: [{ type: "m_n_2", marks: 1 }] },
        hash: "hash-non-rappresentabile-2",
      },
    });

    const esito = await caricaPerEditor(esercizio.id);
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

    const elenco = await elencoRedazione();
    const voce = elenco.find((v) => v.id === creato.esercizioId);
    expect(voce).toBeDefined();
    expect(voce!.titolo).toBe(base.meta.titolo);
    expect(voce!.argomento).toBe(base.meta.argomento);
    expect(voce!.anno).toBe(base.meta.anno);
    expect(voce!.ultimaVersione).toBe(1);
    expect(voce!.modificabile).toBe(true);
    expect(voce!.autoreNome).toBe("Docente");
  });

  it("marca non modificabile un esercizio che daNumbas rifiuta", async () => {
    const esercizio = await prisma.esercizio.create({
      data: { title: `${PREFIX}Elenco non modificabile`, yearLevel: 1, topic: "prova", tags: [], difficulty: 1 },
    });
    await prisma.esercizioVersione.create({
      data: {
        esercizioId: esercizio.id, version: 1,
        content: { name: "x", statement: "<p>x</p>", variables: {}, parts: [{ type: "m_n_2", marks: 1 }] },
        hash: "hash-elenco-non-modificabile",
      },
    });

    const elenco = await elencoRedazione();
    const voce = elenco.find((v) => v.id === esercizio.id);
    expect(voce).toBeDefined();
    expect(voce!.modificabile).toBe(false);
  });

  // Il corpus reale seminato da `content/esercizi/`: la tabella di
  // rappresentabilita' che editor/__tests__/da-numbas.test.ts fissa (01 e 02
  // si', il resto no) deve valere anche passando dal database, non solo
  // leggendo il file direttamente — e' proprio quel percorso che
  // `elencoRedazione` usa davvero.
  it("sugli otto esercizi seminati, solo i due strutturalmente fedeli sono modificabili", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "redazionetest-corpus-"));
    const corpusDir = path.resolve(process.cwd(), "content/esercizi");
    const nomi = readdirSync(corpusDir).filter((f) => f.endsWith(".json"));
    for (const nome of nomi) {
      writeFileSync(path.join(dir, `${PREFIX}${nome}`), readFileSync(path.join(corpusDir, nome)));
    }
    await seedEsercizi(dir);

    const elenco = await elencoRedazione();
    const miei = elenco.filter((v) => v.id.startsWith(PREFIX));
    expect(miei).toHaveLength(8);

    const modificabili = miei.filter((v) => v.modificabile).map((v) => v.id).sort();
    expect(modificabili).toEqual([
      `${PREFIX}01-equazione-primo-grado`,
      `${PREFIX}02-scomposizione-polinomi`,
    ]);
  });
});
