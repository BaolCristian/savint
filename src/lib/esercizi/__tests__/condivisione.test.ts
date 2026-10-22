import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { utenteDaId, ruoloEsercizio, ruoloContenitore, type Utente } from "../accesso";
import {
  leggiCondivisione, impostaCondivisione, docentiDellaScuola, trasferisciProprieta,
} from "../condivisione";

const P = "condivisionetest-";
let A: Utente;
let B: Utente;
let C: Utente;
let S: Utente; // uno studente
let ADM: Utente;

const base = { yearLevel: 2, tags: [], difficulty: 1 };

async function utente(nome: string, role: "TEACHER" | "ADMIN" | "STUDENT" = "TEACHER"): Promise<Utente> {
  const u = await prisma.user.create({ data: { email: `${P}${nome}@test.it`, name: `${P}${nome}`, role } });
  return utenteDaId(u.id);
}

async function esercizio(id: string, authorId: string | null, topic = "prova") {
  await prisma.esercizio.create({ data: { id: `${P}${id}`, title: id, authorId, topic, ...base } });
  return `${P}${id}`;
}

async function raccolta(ownerId: string, nome: string) {
  return (await prisma.contenitore.create({ data: { name: `${P}${nome}`, createdById: ownerId } })).id;
}

beforeEach(async () => {
  await prisma.contenitore.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  A = await utente("a");
  B = await utente("b");
  C = await utente("c");
  S = await utente("s", "STUDENT");
  ADM = await utente("adm", "ADMIN");
});

describe("condivisione di un esercizio", () => {
  it("il proprietario imposta B EDITOR + scuola VISUALIZZATORE e lo rilegge", async () => {
    const es = await esercizio("e1", A.id);
    const esito = await impostaCondivisione({ tipo: "esercizio", id: es }, A, {
      persone: [{ userId: B.id, ruolo: "EDITOR" }],
      scuola: "VISUALIZZATORE",
    });
    expect(esito).toEqual({ ok: true });
    const stato = await leggiCondivisione({ tipo: "esercizio", id: es }, A);
    expect(stato).toEqual({
      persone: [{ userId: B.id, nome: `${P}b`, email: `${P}b@test.it`, ruolo: "EDITOR" }],
      scuola: "VISUALIZZATORE",
      indiretti: [],
      proprietarioNome: `${P}a`,
    });
    expect(await ruoloEsercizio(B, es)).toBe("EDITOR");
    expect(await ruoloEsercizio(C, es)).toBe("VISUALIZZATORE");
  });

  it("impostare sostituisce: le persone tolte perdono l'accesso, scuola null lo chiude", async () => {
    const es = await esercizio("e2", A.id);
    await impostaCondivisione({ tipo: "esercizio", id: es }, A, { persone: [{ userId: B.id, ruolo: "EDITOR" }], scuola: "EDITOR" });
    await impostaCondivisione({ tipo: "esercizio", id: es }, A, { persone: [{ userId: C.id, ruolo: "COMMENTATORE" }], scuola: null });
    expect(await ruoloEsercizio(B, es)).toBeNull();
    expect(await ruoloEsercizio(C, es)).toBe("COMMENTATORE");
    const stato = await leggiCondivisione({ tipo: "esercizio", id: es }, A);
    expect(stato?.scuola).toBeNull();
    expect(stato?.persone.map((p) => p.userId)).toEqual([C.id]);
  });

  it("un EDITOR non legge né imposta la condivisione: per lui non esiste", async () => {
    const es = await esercizio("e3", A.id);
    await impostaCondivisione({ tipo: "esercizio", id: es }, A, { persone: [{ userId: B.id, ruolo: "EDITOR" }], scuola: null });
    expect(await leggiCondivisione({ tipo: "esercizio", id: es }, B)).toBeNull();
    expect(await impostaCondivisione({ tipo: "esercizio", id: es }, B, { persone: [], scuola: "EDITOR" }))
      .toEqual({ ok: false, motivo: "non_trovato" });
    expect(await leggiCondivisione({ tipo: "esercizio", id: `${P}inesistente` }, A)).toBeNull();
  });

  it("destinatari non validi: studente, sé stessi, il proprietario, un id ignoto, un doppione", async () => {
    const es = await esercizio("e4", A.id);
    const r = { tipo: "esercizio" as const, id: es };
    const non = { ok: false, motivo: "destinatario_non_valido" };
    expect(await impostaCondivisione(r, A, { persone: [{ userId: S.id, ruolo: "VISUALIZZATORE" }], scuola: null })).toEqual(non);
    expect(await impostaCondivisione(r, A, { persone: [{ userId: A.id, ruolo: "EDITOR" }], scuola: null })).toEqual(non);
    // L'ADMIN che condivide non può nominare il proprietario.
    expect(await impostaCondivisione(r, ADM, { persone: [{ userId: A.id, ruolo: "EDITOR" }], scuola: null })).toEqual(non);
    expect(await impostaCondivisione(r, A, { persone: [{ userId: `${P}nessuno`, ruolo: "EDITOR" }], scuola: null })).toEqual(non);
    expect(await impostaCondivisione(r, A, {
      persone: [{ userId: B.id, ruolo: "EDITOR" }, { userId: B.id, ruolo: "VISUALIZZATORE" }], scuola: null,
    })).toEqual(non);
    // Niente è stato scritto.
    expect(await prisma.condivisioneEsercizio.count({ where: { esercizioId: es } })).toBe(0);
  });

  it("un esercizio senza proprietario: solo l'ADMIN ne gestisce la condivisione", async () => {
    const es = await esercizio("seed", null);
    expect(await leggiCondivisione({ tipo: "esercizio", id: es }, A)).toBeNull();
    expect(await impostaCondivisione({ tipo: "esercizio", id: es }, ADM, { persone: [{ userId: B.id, ruolo: "COMMENTATORE" }], scuola: "EDITOR" }))
      .toEqual({ ok: true });
    const stato = await leggiCondivisione({ tipo: "esercizio", id: es }, ADM);
    expect(stato?.proprietarioNome).toBeNull();
    expect(stato?.scuola).toBe("EDITOR");
  });

  it("indiretti: la raccolta da cui B riceve l'esercizio e l'argomento condiviso con la scuola", async () => {
    const es = await esercizio("e5", A.id, "Equazioni");
    const r = await raccolta(A.id, "Raccolta R");
    await prisma.contenitoreEsercizio.create({ data: { contenitoreId: r, esercizioId: es, addedById: A.id } });
    await prisma.condivisioneContenitore.create({ data: { contenitoreId: r, userId: B.id, ruolo: "COMMENTATORE" } });
    await impostaCondivisione({ tipo: "argomento", argomento: " Equazioni " }, A, { persone: [], scuola: "VISUALIZZATORE" });
    // Una raccolta di C in cui C ha messo l'esercizio non trasmette niente.
    const rc = await raccolta(C.id, "Raccolta C");
    await prisma.contenitoreEsercizio.create({ data: { contenitoreId: rc, esercizioId: es, addedById: C.id } });
    await prisma.condivisioneContenitore.create({ data: { contenitoreId: rc, userId: B.id, ruolo: "EDITOR" } });

    const stato = await leggiCondivisione({ tipo: "esercizio", id: es }, A);
    expect(stato?.persone).toEqual([]);
    expect(stato?.indiretti).toEqual(expect.arrayContaining([
      { nome: `${P}b`, via: "raccolta", dettaglio: `${P}Raccolta R`, ruolo: "COMMENTATORE" },
      { nome: "Tutta la scuola", via: "argomento", dettaglio: "Equazioni", ruolo: "VISUALIZZATORE" },
    ]));
    expect(stato?.indiretti).toHaveLength(2);
  });
});

describe("condivisione di una raccolta", () => {
  it("il proprietario la condivide; un altro docente riceve null", async () => {
    const r = await raccolta(A.id, "R1");
    expect(await impostaCondivisione({ tipo: "contenitore", id: r }, A, { persone: [{ userId: B.id, ruolo: "EDITOR" }], scuola: "COMMENTATORE" }))
      .toEqual({ ok: true });
    expect(await ruoloContenitore(B, r)).toBe("EDITOR");
    expect(await ruoloContenitore(C, r)).toBe("COMMENTATORE");
    const stato = await leggiCondivisione({ tipo: "contenitore", id: r }, A);
    expect(stato?.persone.map((p) => [p.userId, p.ruolo])).toEqual([[B.id, "EDITOR"]]);
    expect(stato?.scuola).toBe("COMMENTATORE");
    expect(stato?.indiretti).toEqual([]);
    expect(await leggiCondivisione({ tipo: "contenitore", id: r }, B)).toBeNull();
  });
});

describe("condivisione per argomento", () => {
  it("vale per un esercizio nuovo del proprietario e si sostituisce senza doppioni", async () => {
    await impostaCondivisione({ tipo: "argomento", argomento: "Frazioni" }, A, { persone: [{ userId: B.id, ruolo: "COMMENTATORE" }], scuola: null });
    const es = await esercizio("fr", A.id, "frazioni");
    expect(await ruoloEsercizio(B, es)).toBe("COMMENTATORE");

    await impostaCondivisione({ tipo: "argomento", argomento: "FRAZIONI" }, A, { persone: [{ userId: B.id, ruolo: "EDITOR" }], scuola: "VISUALIZZATORE" });
    expect(await ruoloEsercizio(B, es)).toBe("EDITOR");
    expect(await prisma.condivisioneArgomento.count({ where: { ownerId: A.id } })).toBe(2);

    const stato = await leggiCondivisione({ tipo: "argomento", argomento: "frazioni" }, A);
    expect(stato?.persone.map((p) => [p.userId, p.ruolo])).toEqual([[B.id, "EDITOR"]]);
    expect(stato?.scuola).toBe("VISUALIZZATORE");
    expect(stato?.proprietarioNome).toBe(`${P}a`);

    await impostaCondivisione({ tipo: "argomento", argomento: "Frazioni" }, A, { persone: [], scuola: null });
    expect(await ruoloEsercizio(B, es)).toBeNull();
    expect(await prisma.condivisioneArgomento.count({ where: { ownerId: A.id } })).toBe(0);
  });

  it("l'argomento di un altro: un docente non può indicarne il proprietario, l'ADMIN sì", async () => {
    expect(await leggiCondivisione({ tipo: "argomento", argomento: "Frazioni", ownerId: A.id }, B)).toBeNull();
    expect(await impostaCondivisione({ tipo: "argomento", argomento: "Frazioni", ownerId: A.id }, B, { persone: [], scuola: "EDITOR" }))
      .toEqual({ ok: false, motivo: "non_trovato" });
    expect(await impostaCondivisione({ tipo: "argomento", argomento: "Frazioni", ownerId: A.id }, ADM, { persone: [{ userId: C.id, ruolo: "VISUALIZZATORE" }], scuola: null }))
      .toEqual({ ok: true });
    const es = await esercizio("fr2", A.id, "Frazioni");
    expect(await ruoloEsercizio(C, es)).toBe("VISUALIZZATORE");
    // Il proprietario dell'argomento non è un destinatario valido.
    expect(await impostaCondivisione({ tipo: "argomento", argomento: "Frazioni", ownerId: A.id }, ADM, { persone: [{ userId: A.id, ruolo: "EDITOR" }], scuola: null }))
      .toEqual({ ok: false, motivo: "destinatario_non_valido" });
  });

  it("l'ADMIN non può indicare come proprietario di un argomento uno studente: non trovato", async () => {
    const risorsa = { tipo: "argomento" as const, argomento: "Frazioni", ownerId: S.id };
    expect(await leggiCondivisione(risorsa, ADM)).toBeNull();
    expect(await impostaCondivisione(risorsa, ADM, { persone: [{ userId: C.id, ruolo: "VISUALIZZATORE" }], scuola: null }))
      .toEqual({ ok: false, motivo: "non_trovato" });
    expect(await prisma.condivisioneArgomento.count({ where: { ownerId: S.id } })).toBe(0);
  });
});

describe("docentiDellaScuola", () => {
  it("elenca TEACHER e ADMIN, esclude lo studente e chi chiede, in ordine di nome", async () => {
    const docenti = (await docentiDellaScuola(A.id)).filter((d) => d.email.startsWith(P));
    expect(docenti.map((d) => d.nome)).toEqual([`${P}adm`, `${P}b`, `${P}c`]);
  });
});

describe("trasferisciProprieta", () => {
  it("l'ADMIN trasferisce un esercizio a C: C diventa PROPRIETARIO, la sua condivisione nominata sparisce", async () => {
    const es = await esercizio("tr", A.id);
    await impostaCondivisione({ tipo: "esercizio", id: es }, A, { persone: [{ userId: C.id, ruolo: "VISUALIZZATORE" }], scuola: null });
    expect(await trasferisciProprieta({ tipo: "esercizio", id: es }, C.id, ADM)).toEqual({ ok: true });
    expect(await ruoloEsercizio(C, es)).toBe("PROPRIETARIO");
    expect(await ruoloEsercizio(A, es)).toBeNull();
    expect(await prisma.condivisioneEsercizio.count({ where: { esercizioId: es } })).toBe(0);
  });

  it("l'ADMIN trasferisce una raccolta; un docente, anche proprietario, no", async () => {
    const r = await raccolta(A.id, "tr");
    expect(await trasferisciProprieta({ tipo: "contenitore", id: r }, B.id, A)).toEqual({ ok: false, motivo: "non_permesso" });
    expect(await trasferisciProprieta({ tipo: "contenitore", id: r }, S.id, ADM)).toEqual({ ok: false, motivo: "destinatario_non_valido" });
    expect(await trasferisciProprieta({ tipo: "contenitore", id: `${P}nulla` }, B.id, ADM)).toEqual({ ok: false, motivo: "non_trovato" });
    expect(await trasferisciProprieta({ tipo: "contenitore", id: r }, B.id, ADM)).toEqual({ ok: true });
    expect(await ruoloContenitore(B, r)).toBe("PROPRIETARIO");
    expect(await ruoloContenitore(A, r)).toBeNull();
  });
});
