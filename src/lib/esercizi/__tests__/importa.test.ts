import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { controllaImport, importaEsercizi } from "../importa/importa";
import { testoErrorePerIA } from "../importa/tipi";
import { versoNumbas } from "../editor/verso-numbas";
import type { EsercizioEditor } from "../editor/modello";
import type { Utente } from "../accesso";

// Prefisso unico di questo file (vedi il commento gemello in
// redazione.test.ts): gli esercizi creati qui si possiedono filtrando sul
// titolo. Il titolo finisce anche nel contenuto (`name`, vedi
// verso-numbas.ts), quindi l'hash dei nostri esercizi non può coincidere
// con quello di un esercizio di un altro file: il controllo dei doppioni
// interroga TUTTE le versioni salvate.
const PREFIX = "importatest-";

// Per provare un salvataggio che LANCIA (database, vincoli...) senza
// rompere davvero il database: `creaEsercizio` vero per tutti, tranne che
// per un titolo che contiene questo marcatore. `authorId` non ha una chiave
// esterna nello schema, quindi un autore inesistente non basterebbe.
const ESPLODE = "ESPLODE";
vi.mock("../redazione", async (importOriginal) => {
  const originale = await importOriginal<typeof import("../redazione")>();
  return {
    ...originale,
    creaEsercizio: async (...args: Parameters<typeof originale.creaEsercizio>) => {
      // Letterale e non `ESPLODE`: `vi.mock` è sollevato sopra le costanti.
      if (args[0].meta.titolo.includes("ESPLODE")) throw new Error("connessione al database persa");
      return originale.creaEsercizio(...args);
    },
  };
});

let docenteId: string;
let docente: Utente;
let collega: Utente;

function valido(nome: string): EsercizioEditor {
  return {
    meta: { titolo: `${PREFIX}${nome}`, descrizione: "", anno: 1, argomento: "equazioni", tag: [], difficolta: 1 },
    testo: `(${PREFIX}${nome}) Risolvi \\(\\simplify{ {a}x+{b} }=0\\)`,
    suggerimento: "",
    variabili: [
      { nome: "a", definizione: "random(2..9)", descrizione: "" },
      { nome: "b", definizione: "random(-9..9 except 0)", descrizione: "" },
    ],
    condizione: "",
    parti: [{ tipo: "numerica", consegna: "\\(x=\\)", punti: 2, valore: "-b/a", tolleranza: { tipo: "esatta" } }],
  };
}

function conEspressione(nome: string, risposta: string): EsercizioEditor {
  return {
    ...valido(nome),
    parti: [{ tipo: "espressione", consegna: "Scrivi l'espressione", punti: 1, risposta }],
  };
}

async function pulisci() {
  await prisma.esercizioVersione.deleteMany({ where: { esercizio: { title: { startsWith: PREFIX } } } });
  await prisma.esercizio.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

beforeEach(async () => {
  await pulisci();
  docenteId = (await prisma.user.create({ data: { email: `${PREFIX}d@test.it`, name: "Docente", role: "TEACHER" } })).id;
  docente = { id: docenteId, admin: false };
  collega = { id: (await prisma.user.create({ data: { email: `${PREFIX}d2@test.it`, name: "Collega", role: "TEACHER" } })).id, admin: false };
});

afterAll(async () => {
  await pulisci();
});

describe("controllaImport", () => {
  it("ok: restituisce titolo e content Numbas", async () => {
    const [r] = await controllaImport([valido("A")], docente);
    expect(r).toMatchObject({ indice: 0, stato: "ok", titolo: `${PREFIX}A` });
    expect(r!.stato === "ok" && r!.content).toEqual(versoNumbas(valido("A")));
  });

  it("campi vuoti mancanti accettati", async () => {
    const senza: Record<string, unknown> = { ...valido("B") };
    delete senza.suggerimento;
    delete senza.condizione;
    expect((await controllaImport([senza], docente))[0]!.stato).toBe("ok");
  });

  it("anno come stringa → invalido con percorso meta.anno", async () => {
    const e = valido("C");
    (e.meta as unknown as { anno: unknown }).anno = "2";
    const [r] = await controllaImport([e], docente);
    expect(r!.stato).toBe("invalido");
    expect(r!.stato === "invalido" && r!.problemi.map((p) => p.percorso)).toContain("meta.anno");
    expect(r!.titolo).toBe(`${PREFIX}C`);
  });

  it("null e stringa nell'array → invalido solo quelli", async () => {
    const r = await controllaImport([null, "x", valido("D")], docente);
    expect(r.map((x) => x.stato)).toEqual(["invalido", "invalido", "ok"]);
    expect(r[0]!.titolo).toBeNull();
    expect(r.map((x) => x.indice)).toEqual([0, 1, 2]);
  });

  it("variabile inesistente → verifica_fallita", async () => {
    const e = valido("E");
    e.testo = "\\(\\var{zeta}\\)";
    const [r] = await controllaImport([e], docente);
    expect(r!.stato).toBe("verifica_fallita");
    expect(r!.stato === "verifica_fallita" && r!.dettaglio.messaggio).toBeTruthy();
  });

  it("stesso esercizio due volte nel file → il secondo gia_presente", async () => {
    const r = await controllaImport([valido("F"), valido("F")], docente);
    expect(r.map((x) => x.stato)).toEqual(["ok", "gia_presente"]);
    expect(r[1]).toMatchObject({ titoloEsistente: `${PREFIX}F`, nelFile: true });
    expect(r[0]).not.toHaveProperty("nelFile");
  });
});

describe("controllaImport: variabili senza graffe nella risposta di un'espressione", () => {
  it("variabile dichiarata senza graffe → invalido su parti.0.risposta", async () => {
    const [r] = await controllaImport([conEspressione("V1", "a*x + b")], docente);
    expect(r!.stato).toBe("invalido");
    if (r!.stato !== "invalido") return;
    expect(r!.problemi.map((p) => p.percorso)).toEqual(["parti.0.risposta", "parti.0.risposta"]);
    expect(r!.problemi[0]!.messaggio).toContain('"a"');
    expect(r!.problemi[0]!.messaggio).toContain("{a}");
  });

  it("vale anche con maiuscole diverse (i nomi JME non le distinguono)", async () => {
    const [r] = await controllaImport([conEspressione("V2", "{a}*x + B")], docente);
    expect(r!.stato === "invalido" && r!.problemi.map((p) => p.messaggio).join(" ")).toContain("{b}");
  });

  it("forma con le graffe → ok", async () => {
    expect((await controllaImport([conEspressione("V3", "{a}*x + {b}")], docente))[0]!.stato).toBe("ok");
  });

  it("lettera non dichiarata (x), parole intere e funzioni → ok", async () => {
    const e = conEspressione("V4", "{a}*x + sqrt(ab) + {b}");
    e.variabili.push({ nome: "c", definizione: "random(2..5)", descrizione: "" });
    const [r] = await controllaImport([e], docente);
    // `ab` non è `a` né `b`, `sqrt` non è una variabile: il controllo non
    // deve rifiutare. Non importa qui se il motore poi accetta l'espressione.
    expect(r!.stato).not.toBe("invalido");
  });
});

describe("importaEsercizi", () => {
  it("importa crea con l'autore, poi un secondo import è gia_presente", async () => {
    const [a] = await importaEsercizi([valido("G")], docente);
    expect(a!.stato).toBe("creato");
    if (a!.stato !== "creato") return;
    const riga = await prisma.esercizio.findUnique({ where: { id: a!.esercizioId } });
    expect(riga?.authorId).toBe(docenteId);
    expect((await importaEsercizi([valido("G")], docente))[0]).toMatchObject({
      stato: "gia_presente",
      titoloEsistente: `${PREFIX}G`,
    });
  });

  it("un salvataggio che lancia diventa errore e gli altri vengono creati", async () => {
    const spia = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await importaEsercizi([valido(`${ESPLODE}-I`), valido("J")], docente);
    expect(r.map((x) => x.stato)).toEqual(["errore", "creato"]);
    expect(r[0]).toMatchObject({ indice: 0, titolo: `${PREFIX}${ESPLODE}-I`, messaggio: "salvataggio non riuscito, riprova" });
    // Il testo grezzo del database resta nel log del server, non arriva al docente.
    expect(JSON.stringify(r[0])).not.toContain("connessione");
    expect(spia).toHaveBeenCalled();
    spia.mockRestore();
    const riga = await prisma.esercizio.findFirst({ where: { title: `${PREFIX}J` } });
    expect(riga?.authorId).toBe(docenteId);
  });

  it("un import nasce privato (accessoScuola null)", async () => {
    const [a] = await importaEsercizi([valido("P")], docente);
    if (a!.stato !== "creato") throw new Error("import non riuscito");
    const riga = await prisma.esercizio.findUniqueOrThrow({ where: { id: a!.esercizioId } });
    expect(riga.accessoScuola).toBeNull();
  });

  // Review Focus 4: il controllo doppioni guarda solo gli esercizi che chi
  // importa vede. "Già presente" su un esercizio privato altrui ne
  // rivelerebbe l'esistenza (e il titolo) e impedirebbe di importarlo.
  it("lo stesso contenuto di un esercizio privato di un collega non è un doppione", async () => {
    const [a] = await importaEsercizi([valido("Q")], docente);
    expect(a!.stato).toBe("creato");
    expect((await controllaImport([valido("Q")], collega))[0]!.stato).toBe("ok");
    expect((await importaEsercizi([valido("Q")], collega))[0]!.stato).toBe("creato");
  });

  it("lo è invece se il collega l'ha ricevuto in condivisione", async () => {
    const [a] = await importaEsercizi([valido("R")], docente);
    if (a!.stato !== "creato") throw new Error("import non riuscito");
    await prisma.condivisioneEsercizio.create({ data: { esercizioId: a!.esercizioId, userId: collega.id, ruolo: "VISUALIZZATORE" } });
    expect((await controllaImport([valido("R")], collega))[0]).toMatchObject({
      stato: "gia_presente",
      titoloEsistente: `${PREFIX}R`,
    });
  });

  it("un elemento rotto non blocca gli altri", async () => {
    const r = await importaEsercizi([null, valido("H")], docente);
    expect(r.map((x) => x.stato)).toEqual(["invalido", "creato"]);
  });
});

describe("testoErrorePerIA", () => {
  it("nomina esercizio, campo e chiede tutto il JSON", () => {
    const t = testoErrorePerIA({
      indice: 2,
      stato: "invalido",
      titolo: "Distanza",
      problemi: [{ percorso: "meta.anno", messaggio: "Expected number" }],
    });
    expect(t).toContain("3");
    expect(t).toContain("Distanza");
    expect(t).toContain("meta.anno");
    expect(t).toMatch(/tutto il JSON/);
  });

  it("verifica_fallita e gia_presente producono un testo utile", () => {
    const v = testoErrorePerIA({
      indice: 0,
      stato: "verifica_fallita",
      titolo: "T",
      dettaglio: { seme: 4, fase: "risposta", messaggio: "boom" },
    });
    expect(v).toContain("boom");
    expect(v).toMatch(/tutto il JSON/);
    const g = testoErrorePerIA({ indice: 0, stato: "gia_presente", titolo: "T", titoloEsistente: "Vecchio" });
    expect(g).toContain("Vecchio");
    expect(g).toContain("Savint");
    expect(g).toMatch(/tutto il JSON/);
    const f = testoErrorePerIA({ indice: 1, stato: "gia_presente", titolo: "T", titoloEsistente: "T", nelFile: true });
    expect(f).toMatch(/stesso JSON/);
    expect(f).not.toContain("Savint");
  });
});
