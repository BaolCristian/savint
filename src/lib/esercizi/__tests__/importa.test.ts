import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { controllaImport, importaEsercizi } from "../importa/importa";
import { testoErrorePerIA } from "../importa/tipi";
import { versoNumbas } from "../editor/verso-numbas";
import type { EsercizioEditor } from "../editor/modello";

// Prefisso unico di questo file (vedi il commento gemello in
// redazione.test.ts): gli esercizi creati qui si possiedono filtrando sul
// titolo. Il titolo finisce anche nel contenuto (`name`, vedi
// verso-numbas.ts), quindi l'hash dei nostri esercizi non può coincidere
// con quello di un esercizio di un altro file: il controllo dei doppioni
// interroga TUTTE le versioni salvate.
const PREFIX = "importatest-";

let docenteId: string;

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
});

afterAll(async () => {
  await pulisci();
});

describe("controllaImport", () => {
  it("ok: restituisce titolo e content Numbas", async () => {
    const [r] = await controllaImport([valido("A")]);
    expect(r).toMatchObject({ indice: 0, stato: "ok", titolo: `${PREFIX}A` });
    expect(r!.stato === "ok" && r!.content).toEqual(versoNumbas(valido("A")));
  });

  it("campi vuoti mancanti accettati", async () => {
    const senza: Record<string, unknown> = { ...valido("B") };
    delete senza.suggerimento;
    delete senza.condizione;
    expect((await controllaImport([senza]))[0]!.stato).toBe("ok");
  });

  it("anno come stringa → invalido con percorso meta.anno", async () => {
    const e = valido("C");
    (e.meta as unknown as { anno: unknown }).anno = "2";
    const [r] = await controllaImport([e]);
    expect(r!.stato).toBe("invalido");
    expect(r!.stato === "invalido" && r!.problemi.map((p) => p.percorso)).toContain("meta.anno");
    expect(r!.titolo).toBe(`${PREFIX}C`);
  });

  it("null e stringa nell'array → invalido solo quelli", async () => {
    const r = await controllaImport([null, "x", valido("D")]);
    expect(r.map((x) => x.stato)).toEqual(["invalido", "invalido", "ok"]);
    expect(r[0]!.titolo).toBeNull();
    expect(r.map((x) => x.indice)).toEqual([0, 1, 2]);
  });

  it("variabile inesistente → verifica_fallita", async () => {
    const e = valido("E");
    e.testo = "\\(\\var{zeta}\\)";
    const [r] = await controllaImport([e]);
    expect(r!.stato).toBe("verifica_fallita");
    expect(r!.stato === "verifica_fallita" && r!.dettaglio.messaggio).toBeTruthy();
  });

  it("stesso esercizio due volte nel file → il secondo gia_presente", async () => {
    const r = await controllaImport([valido("F"), valido("F")]);
    expect(r.map((x) => x.stato)).toEqual(["ok", "gia_presente"]);
    expect(r[1]).toMatchObject({ titoloEsistente: `${PREFIX}F` });
  });
});

describe("controllaImport: variabili senza graffe nella risposta di un'espressione", () => {
  it("variabile dichiarata senza graffe → invalido su parti.0.risposta", async () => {
    const [r] = await controllaImport([conEspressione("V1", "a*x + b")]);
    expect(r!.stato).toBe("invalido");
    if (r!.stato !== "invalido") return;
    expect(r!.problemi.map((p) => p.percorso)).toEqual(["parti.0.risposta", "parti.0.risposta"]);
    expect(r!.problemi[0]!.messaggio).toContain('"a"');
    expect(r!.problemi[0]!.messaggio).toContain("{a}");
  });

  it("vale anche con maiuscole diverse (i nomi JME non le distinguono)", async () => {
    const [r] = await controllaImport([conEspressione("V2", "{a}*x + B")]);
    expect(r!.stato === "invalido" && r!.problemi.map((p) => p.messaggio).join(" ")).toContain("{b}");
  });

  it("forma con le graffe → ok", async () => {
    expect((await controllaImport([conEspressione("V3", "{a}*x + {b}")]))[0]!.stato).toBe("ok");
  });

  it("lettera non dichiarata (x), parole intere e funzioni → ok", async () => {
    const e = conEspressione("V4", "{a}*x + sqrt(ab) + {b}");
    e.variabili.push({ nome: "c", definizione: "random(2..5)", descrizione: "" });
    const [r] = await controllaImport([e]);
    // `ab` non è `a` né `b`, `sqrt` non è una variabile: il controllo non
    // deve rifiutare. Non importa qui se il motore poi accetta l'espressione.
    expect(r!.stato).not.toBe("invalido");
  });
});

describe("importaEsercizi", () => {
  it("importa crea con l'autore, poi un secondo import è gia_presente", async () => {
    const [a] = await importaEsercizi([valido("G")], docenteId);
    expect(a!.stato).toBe("creato");
    if (a!.stato !== "creato") return;
    const riga = await prisma.esercizio.findUnique({ where: { id: a!.esercizioId } });
    expect(riga?.authorId).toBe(docenteId);
    expect((await importaEsercizi([valido("G")], docenteId))[0]).toMatchObject({
      stato: "gia_presente",
      titoloEsistente: `${PREFIX}G`,
    });
  });

  it("un elemento rotto non blocca gli altri", async () => {
    const r = await importaEsercizi([null, valido("H")], docenteId);
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
    expect(g).toMatch(/tutto il JSON/);
  });
});
