import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  puo, chiaveArgomento, utenteDaSessione, utenteDaId,
  ruoliEsercizi, ruoloEsercizio, ruoliContenitori, ruoloContenitore,
  type Utente, type Ruolo, type Azione,
} from "../accesso";

const P = "accessotest-";
let A: Utente;
let B: Utente;
let C: Utente;
let D: Utente;

const base = { yearLevel: 2, tags: [], difficulty: 1 };

async function docente(nome: string, role: "TEACHER" | "ADMIN" = "TEACHER"): Promise<Utente> {
  const u = await prisma.user.create({ data: { email: `${P}${nome}@test.it`, name: nome, role } });
  return utenteDaId(u.id);
}

async function esercizio(id: string, authorId: string | null, topic = "prova", accessoScuola?: "VISUALIZZATORE" | "COMMENTATORE" | "EDITOR") {
  await prisma.esercizio.create({ data: { id: `${P}${id}`, title: id, authorId, topic, accessoScuola, ...base } });
  return `${P}${id}`;
}

async function raccolta(ownerId: string, nome: string, accessoScuola?: "VISUALIZZATORE" | "COMMENTATORE" | "EDITOR") {
  return (await prisma.contenitore.create({ data: { name: `${P}${nome}`, createdById: ownerId, accessoScuola } })).id;
}

beforeEach(async () => {
  // Condivisioni e righe di raccolta spariscono a cascata con esercizi,
  // raccolte e utenti; le raccolte vanno tolte prima degli utenti.
  await prisma.contenitore.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  A = await docente("a");
  B = await docente("b");
  C = await docente("c");
  D = await docente("d");
});

describe("accesso: ruolo sugli esercizi", () => {
  it("un esercizio nuovo è del suo autore, invisibile agli altri e alla scuola", async () => {
    const es = await esercizio("nuovo", A.id);
    expect(await ruoloEsercizio(A, es)).toBe("PROPRIETARIO");
    expect(await ruoloEsercizio(B, es)).toBeNull();
    expect((await ruoliEsercizi(A)).get(es)).toBe("PROPRIETARIO");
    expect((await ruoliEsercizi(B)).has(es)).toBe(false);
    expect((await ruoliEsercizi("scuola")).has(es)).toBe(false);
  });

  it("vale il permesso più ampio: diretta VISUALIZZATORE + scuola EDITOR → EDITOR", async () => {
    const es = await esercizio("ampio", A.id, "prova", "EDITOR");
    await prisma.condivisioneEsercizio.create({ data: { esercizioId: es, userId: B.id, ruolo: "VISUALIZZATORE" } });
    expect(await ruoloEsercizio(B, es)).toBe("EDITOR");
    expect((await ruoliEsercizi(B)).get(es)).toBe("EDITOR");
    expect((await ruoliEsercizi("scuola")).get(es)).toBe("EDITOR");
  });

  it("l'argomento condiviso vale anche per gli esercizi creati dopo, solo dello stesso proprietario", async () => {
    await prisma.condivisioneArgomento.create({
      data: { ownerId: A.id, chiave: chiaveArgomento("Equazioni"), argomento: "Equazioni", userId: B.id, ruolo: "COMMENTATORE" },
    });
    const diA = await esercizio("eq-a", A.id, " equazioni");
    const diC = await esercizio("eq-c", C.id, "Equazioni");
    expect(await ruoloEsercizio(B, diA)).toBe("COMMENTATORE");
    expect(await ruoloEsercizio(B, diC)).toBeNull();
    const ruoli = await ruoliEsercizi(B);
    expect(ruoli.get(diA)).toBe("COMMENTATORE");
    expect(ruoli.has(diC)).toBe(false);
    // Una condivisione nominata non è della scuola.
    expect((await ruoliEsercizi("scuola")).has(diA)).toBe(false);
  });

  it("l'argomento condiviso con tutta la scuola vale per chiunque e per \"scuola\"", async () => {
    await prisma.condivisioneArgomento.create({
      data: { ownerId: A.id, chiave: "frazioni", argomento: "Frazioni", userId: null, ruolo: "VISUALIZZATORE" },
    });
    const es = await esercizio("fr", A.id, "FRAZIONI ");
    expect(await ruoloEsercizio(C, es)).toBe("VISUALIZZATORE");
    expect((await ruoliEsercizi("scuola")).get(es)).toBe("VISUALIZZATORE");
  });

  it("raccolta di A condivisa con B EDITOR: l'esercizio privato che B ci mette è EDITOR per A, null per C", async () => {
    const r = await raccolta(A.id, "R");
    await prisma.condivisioneContenitore.create({ data: { contenitoreId: r, userId: B.id, ruolo: "EDITOR" } });
    const es = await esercizio("di-b", B.id);
    await prisma.contenitoreEsercizio.create({ data: { contenitoreId: r, esercizioId: es } });
    expect(await ruoloEsercizio(A, es)).toBe("EDITOR");
    expect((await ruoliEsercizi(A)).get(es)).toBe("EDITOR");
    expect(await ruoloEsercizio(B, es)).toBe("PROPRIETARIO");
    expect(await ruoloEsercizio(C, es)).toBeNull();
  });

  it("una raccolta non fa da ponte: l'esercizio di C che B mette nella sua raccolta resta null per A", async () => {
    const es = await esercizio("di-c", C.id);
    await prisma.condivisioneEsercizio.create({ data: { esercizioId: es, userId: B.id, ruolo: "VISUALIZZATORE" } });
    const r = await raccolta(B.id, "R");
    await prisma.condivisioneContenitore.create({ data: { contenitoreId: r, userId: A.id, ruolo: "EDITOR" } });
    await prisma.contenitoreEsercizio.create({ data: { contenitoreId: r, esercizioId: es } });
    expect(await ruoloEsercizio(A, es)).toBeNull();
    expect((await ruoliEsercizi(A)).has(es)).toBe(false);
    expect(await ruoloEsercizio(B, es)).toBe("VISUALIZZATORE");
  });

  it("raccolta con accesso scuola EDITOR: l'esercizio privato di un non nominato non si vede", async () => {
    const r = await raccolta(A.id, "R", "EDITOR");
    const es = await esercizio("di-d", D.id);
    await prisma.contenitoreEsercizio.create({ data: { contenitoreId: r, esercizioId: es } });
    expect(await ruoloEsercizio(B, es)).toBeNull();
    expect((await ruoliEsercizi(B)).has(es)).toBe(false);
    expect((await ruoliEsercizi("scuola")).has(es)).toBe(false);
  });

  it("raccolta con accesso scuola: gli esercizi del proprietario arrivano a tutti, anche a \"scuola\", mai come PROPRIETARIO", async () => {
    const r = await raccolta(A.id, "R", "COMMENTATORE");
    const es = await esercizio("di-a", A.id);
    await prisma.contenitoreEsercizio.create({ data: { contenitoreId: r, esercizioId: es } });
    expect(await ruoloEsercizio(B, es)).toBe("COMMENTATORE");
    expect((await ruoliEsercizi("scuola")).get(es)).toBe("COMMENTATORE");
  });

  it("il proprietario di una raccolta riceve EDITOR, non PROPRIETARIO, sugli esercizi degli editor nominati", async () => {
    const r = await raccolta(A.id, "R");
    await prisma.condivisioneContenitore.create({ data: { contenitoreId: r, userId: B.id, ruolo: "EDITOR" } });
    await prisma.condivisioneContenitore.create({ data: { contenitoreId: r, userId: C.id, ruolo: "VISUALIZZATORE" } });
    const es = await esercizio("di-b", B.id);
    await prisma.contenitoreEsercizio.create({ data: { contenitoreId: r, esercizioId: es } });
    expect(await ruoloEsercizio(A, es)).toBe("EDITOR");
    expect(await ruoloEsercizio(C, es)).toBe("VISUALIZZATORE");
  });

  it("un esercizio senza autore non è mai PROPRIETARIO per un docente", async () => {
    const es = await esercizio("seed", null, "prova", "EDITOR");
    expect(await ruoloEsercizio(A, es)).toBe("EDITOR");
    const privato = await esercizio("seed-priv", null);
    expect(await ruoloEsercizio(A, privato)).toBeNull();
  });

  it("l'ADMIN vede l'esercizio privato di A come PROPRIETARIO", async () => {
    const admin = await docente("admin", "ADMIN");
    expect(admin.admin).toBe(true);
    const es = await esercizio("priv", A.id);
    const seed = await esercizio("seed", null);
    expect(await ruoloEsercizio(admin, es)).toBe("PROPRIETARIO");
    expect(await ruoloEsercizio(admin, seed)).toBe("PROPRIETARIO");
    expect((await ruoliEsercizi(admin)).get(es)).toBe("PROPRIETARIO");
  });

  it("un esercizio che non esiste ha ruolo null, anche per l'ADMIN", async () => {
    const admin = await docente("admin", "ADMIN");
    expect(await ruoloEsercizio(admin, `${P}manca`)).toBeNull();
    expect(await ruoloEsercizio(A, `${P}manca`)).toBeNull();
  });
});

describe("accesso: ruolo sulle raccolte", () => {
  it("proprietario, nominato, scuola, nessuno e ADMIN", async () => {
    const r = await raccolta(A.id, "R", "VISUALIZZATORE");
    await prisma.condivisioneContenitore.create({ data: { contenitoreId: r, userId: B.id, ruolo: "EDITOR" } });
    const privata = await raccolta(A.id, "Privata");
    const admin = await docente("admin", "ADMIN");
    expect(await ruoloContenitore(A, r)).toBe("PROPRIETARIO");
    expect(await ruoloContenitore(B, r)).toBe("EDITOR");
    expect(await ruoloContenitore(C, r)).toBe("VISUALIZZATORE");
    expect(await ruoloContenitore(C, privata)).toBeNull();
    expect(await ruoloContenitore(admin, privata)).toBe("PROPRIETARIO");
    const diC = await ruoliContenitori(C);
    expect(diC.get(r)).toBe("VISUALIZZATORE");
    expect(diC.has(privata)).toBe(false);
    expect((await ruoliContenitori(A)).get(privata)).toBe("PROPRIETARIO");
  });
});

describe("accesso: utenti", () => {
  it("utenteDaSessione legge l'ADMIN dal ruolo di sessione", () => {
    const s = (role: "TEACHER" | "ADMIN" | "STUDENT") =>
      ({ user: { id: "x", role }, expires: "" }) as unknown as Parameters<typeof utenteDaSessione>[0];
    expect(utenteDaSessione(s("ADMIN"))).toEqual({ id: "x", admin: true });
    expect(utenteDaSessione(s("TEACHER"))).toEqual({ id: "x", admin: false });
  });

  it("chiaveArgomento toglie spazi ai lati e maiuscole", () => {
    expect(chiaveArgomento("  Équazioni Lineari ")).toBe("équazioni lineari");
  });
});

describe("accesso: puo", () => {
  const azioni: Azione[] = ["vedere", "commentare", "risolvere", "modificare", "condividere"];
  const attese: [Ruolo | null, boolean[]][] = [
    ["PROPRIETARIO", [true, true, true, true, true]],
    ["EDITOR", [true, true, true, true, false]],
    ["COMMENTATORE", [true, true, false, false, false]],
    ["VISUALIZZATORE", [true, false, false, false, false]],
    [null, [false, false, false, false, false]],
  ];
  for (const [ruolo, atteso] of attese) {
    it(`${ruolo ?? "null"}`, () => {
      expect(azioni.map((a) => puo(ruolo, a))).toEqual(atteso);
    });
  }
});
