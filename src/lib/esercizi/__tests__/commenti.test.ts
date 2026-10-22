import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { utenteDaId, type Utente } from "../accesso";
import { elencoCommenti, scriviCommento, risolviCommento, eliminaCommento } from "../commenti";
import { elencoRedazione } from "../redazione";

const P = "commentitest-";
let A: Utente; // proprietario
let V: Utente; // visualizzatore
let C: Utente; // commentatore
let E: Utente; // editor
let X: Utente; // estraneo
let ADM: Utente;
let es: string;

const base = { yearLevel: 2, tags: [], difficulty: 1 };

async function utente(nome: string, role: "TEACHER" | "ADMIN" = "TEACHER"): Promise<Utente> {
  const u = await prisma.user.create({ data: { email: `${P}${nome}@test.it`, name: `${P}${nome}`, role } });
  return utenteDaId(u.id);
}

async function esercizio(id: string, authorId: string) {
  await prisma.esercizio.create({ data: { id: `${P}${id}`, title: id, authorId, topic: "prova", ...base } });
  return `${P}${id}`;
}

async function condividi(esercizioId: string, userId: string, ruolo: "VISUALIZZATORE" | "COMMENTATORE" | "EDITOR") {
  await prisma.condivisioneEsercizio.create({ data: { esercizioId, userId, ruolo } });
}

function idDi(esito: Awaited<ReturnType<typeof scriviCommento>>): string {
  if (!esito.ok) throw new Error(`scriviCommento: ${esito.motivo}`);
  return esito.id;
}

beforeEach(async () => {
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  A = await utente("a");
  V = await utente("v");
  C = await utente("c");
  E = await utente("e");
  X = await utente("x");
  ADM = await utente("adm", "ADMIN");
  es = await esercizio("e1", A.id);
  await condividi(es, V.id, "VISUALIZZATORE");
  await condividi(es, C.id, "COMMENTATORE");
  await condividi(es, E.id, "EDITOR");
});

describe("scrivere e leggere i commenti", () => {
  it("il VISUALIZZATORE legge ma non scrive", async () => {
    idDi(await scriviCommento(es, A, "Una nota del proprietario"));
    const elenco = await elencoCommenti(es, V);
    expect(elenco?.map((c) => c.testo)).toEqual(["Una nota del proprietario"]);
    expect(await scriviCommento(es, V, "ciao")).toEqual({ ok: false, motivo: "non_permesso" });
  });

  it("il COMMENTATORE scrive e risponde; le risposte stanno sotto il commento", async () => {
    const c1 = idDi(await scriviCommento(es, C, "  mi sembra ci sia un errore nella parte b  "));
    idDi(await scriviCommento(es, A, "Grazie, controllo", c1));
    idDi(await scriviCommento(es, C, "Il testo non è troppo chiaro"));

    const elenco = await elencoCommenti(es, C);
    expect(elenco).not.toBeNull();
    // I più recenti prima.
    expect(elenco!.map((c) => c.testo)).toEqual(["Il testo non è troppo chiaro", "mi sembra ci sia un errore nella parte b"]);
    const primo = elenco![1];
    expect(primo).toMatchObject({ id: c1, autoreNome: `${P}c`, risolto: false, mio: true });
    expect(primo.risposte).toHaveLength(1);
    expect(primo.risposte[0]).toMatchObject({ testo: "Grazie, controllo", autoreNome: `${P}a`, mio: false });
  });

  it("testo vuoto o troppo lungo → testo_non_valido", async () => {
    expect(await scriviCommento(es, C, "   ")).toEqual({ ok: false, motivo: "testo_non_valido" });
    expect(await scriviCommento(es, C, "x".repeat(2001))).toEqual({ ok: false, motivo: "testo_non_valido" });
    expect((await scriviCommento(es, C, "x".repeat(2000))).ok).toBe(true);
  });

  it("si risponde solo a un commento di primo livello dello stesso esercizio", async () => {
    const altro = await esercizio("e2", A.id);
    const c1 = idDi(await scriviCommento(es, A, "primo"));
    const r1 = idDi(await scriviCommento(es, A, "risposta", c1));
    const suAltro = idDi(await scriviCommento(altro, A, "altrove"));
    expect(await scriviCommento(es, A, "risposta a risposta", r1)).toEqual({ ok: false, motivo: "non_permesso" });
    expect(await scriviCommento(es, A, "fuori posto", suAltro)).toEqual({ ok: false, motivo: "non_trovato" });
    expect(await scriviCommento(es, A, "fantasma", `${P}nessuno`)).toEqual({ ok: false, motivo: "non_trovato" });
  });

  it("un estraneo non vede: elenco null, scrittura non_trovato", async () => {
    const c1 = idDi(await scriviCommento(es, A, "privato"));
    expect(await elencoCommenti(es, X)).toBeNull();
    expect(await scriviCommento(es, X, "ciao")).toEqual({ ok: false, motivo: "non_trovato" });
    expect(await risolviCommento(c1, X, true)).toEqual({ ok: false, motivo: "non_trovato" });
    expect(await eliminaCommento(c1, X)).toEqual({ ok: false, motivo: "non_trovato" });
    expect(await elencoCommenti(`${P}inesistente`, A)).toBeNull();
  });
});

describe("risolvere", () => {
  it("il COMMENTATORE non risolve, l'EDITOR sì e può riaprire", async () => {
    const c1 = idDi(await scriviCommento(es, C, "errore nella parte b"));
    expect(await risolviCommento(c1, C, true)).toEqual({ ok: false, motivo: "non_permesso" });
    expect(await risolviCommento(c1, E, true)).toEqual({ ok: true });
    expect((await elencoCommenti(es, A))![0].risolto).toBe(true);
    const riga = await prisma.commentoEsercizio.findUnique({ where: { id: c1 } });
    expect(riga?.risoltoDaId).toBe(E.id);
    expect(await risolviCommento(c1, E, false)).toEqual({ ok: true });
    expect((await elencoCommenti(es, A))![0].risolto).toBe(false);
  });

  it("una risposta non si risolve; a un commento risolto si risponde ancora", async () => {
    const c1 = idDi(await scriviCommento(es, C, "primo"));
    const r1 = idDi(await scriviCommento(es, A, "risposta", c1));
    expect(await risolviCommento(r1, A, true)).toEqual({ ok: false, motivo: "non_permesso" });
    await risolviCommento(c1, A, true);
    expect((await scriviCommento(es, C, "ancora una cosa", c1)).ok).toBe(true);
  });
});

describe("eliminare", () => {
  it("l'autore elimina il suo; un altro EDITOR no; il proprietario e l'ADMIN sì", async () => {
    const c1 = idDi(await scriviCommento(es, C, "uno"));
    const c2 = idDi(await scriviCommento(es, C, "due"));
    const c3 = idDi(await scriviCommento(es, C, "tre"));
    expect(await eliminaCommento(c1, E)).toEqual({ ok: false, motivo: "non_permesso" });
    expect(await eliminaCommento(c1, C)).toEqual({ ok: true });
    expect(await eliminaCommento(c2, A)).toEqual({ ok: true });
    expect(await eliminaCommento(c3, ADM)).toEqual({ ok: true });
    expect(await elencoCommenti(es, A)).toEqual([]);
  });

  it("eliminare un commento di primo livello elimina anche le risposte", async () => {
    const c1 = idDi(await scriviCommento(es, C, "primo"));
    const r1 = idDi(await scriviCommento(es, A, "risposta", c1));
    expect(await eliminaCommento(c1, A)).toEqual({ ok: true });
    expect(await prisma.commentoEsercizio.findUnique({ where: { id: r1 } })).toBeNull();
  });
});

describe("commentiAperti nel catalogo", () => {
  it("il proprietario conta solo i non risolti di primo livello; chi non condivide vede 0", async () => {
    const c1 = idDi(await scriviCommento(es, C, "aperto"));
    idDi(await scriviCommento(es, A, "risposta", c1));
    const c2 = idDi(await scriviCommento(es, C, "da risolvere"));
    await risolviCommento(c2, A, true);
    idDi(await scriviCommento(es, E, "un altro aperto"));

    const delProprietario = (await elencoRedazione(A)).find((v) => v.id === es);
    expect(delProprietario?.commentiAperti).toBe(2);
    const dellEditor = (await elencoRedazione(E)).find((v) => v.id === es);
    expect(dellEditor?.commentiAperti).toBe(0);
  });
});
