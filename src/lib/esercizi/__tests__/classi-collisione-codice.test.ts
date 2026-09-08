// Tre percorsi di collisione forzati deterministicamente, mai lasciati
// alla fortuna:
//  1. creaClasse, collisione sul CODICE (indice unico pieno, task 1): con
//     un alfabeto di 30 caratteri su 6 posizioni lo spazio è enorme
//     (30^6), quindi una vera collisione non si può forzare aspettando.
//  2. creaClasse, collisione sul NOME (indice unico parziale, giro di
//     correzioni 1 — solo per le classi non archiviate, vedi la
//     migrazione 20260908175355_classe_nome_unico_attive): il pre-check
//     applicativo copre il caso ordinario, ma due creaClasse concorrenti
//     con lo stesso nome possono superarlo entrambe prima che una delle
//     due scriva; qui si forza esattamente quella corsa.
//  3. rigeneraCodice, collisione sul CODICE: stesso ciclo di ritentativi
//     di creaClasse, ma su un prisma.classe.update diretto invece di una
//     $transaction — copiato/incollato nell'implementazione, quindi
//     testato qui per lo stesso motivo, non per "corretto per ispezione".
//
// Tutti e tre mockano prisma interamente, sullo stesso modello di
// redazione-conflitto-versione.test.ts, per far fallire la scrittura con
// l'errore ESATTO (stessa classe, stesso `code`) che Postgres darebbe su
// un vincolo unico violato — mai contro il database vero: manipolare
// crypto.randomBytes a livello di modulo rischierebbe di interferire con
// la generazione dei cuid di Prisma, che usa la stessa API.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    classe: {
      findFirst: vi.fn(async () => null), // nessun doppione di nome: si arriva alla transazione
      findUnique: vi.fn(async () => ({ id: "c1", name: "5A", archivedAt: null })), // rigeneraCodice: la classe esiste
      update: vi.fn(),
    },
    classeDocente: {
      findUnique: vi.fn(async () => ({ classeId: "c1", teacherId: "docente1" })), // rigeneraCodice: il docente la insegna
    },
    $transaction: vi.fn(),
  },
}));

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { creaClasse, rigeneraCodice } from "../classi";

const erroreVincoloUnico = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "6.19.2",
    meta: { target: ["codice"] },
  });

describe("creaClasse: collisione di codice", () => {
  it("una violazione P2002 sul codice fa ritentare e la seconda transazione va a buon fine", async () => {
    const classeCreata = { id: "c1", name: "5A", codice: "ABCDEF", yearLevel: null, googleGroupEmail: null, archivedAt: null, createdAt: new Date() };
    const tx = {
      classe: { create: vi.fn(async () => classeCreata) },
      classeDocente: { create: vi.fn(async () => ({ classeId: "c1", teacherId: "docente1" })) },
    };

    vi.mocked(prisma.classe.findFirst).mockReset().mockResolvedValue(null);
    vi.mocked(prisma.$transaction)
      .mockReset()
      .mockRejectedValueOnce(erroreVincoloUnico()) // primo tentativo: collisione
      .mockImplementationOnce(async (fn) => fn(tx as unknown as Prisma.TransactionClient)); // secondo tentativo: va a buon fine

    const esito = await creaClasse("docente1", { nome: "5A", anno: null });

    expect(esito).toEqual({ ok: true, classe: { id: "c1", nome: "5A", codice: "ABCDEF" } });
    // la prova che ha ritentato, non sperato: due chiamate a $transaction,
    // una sola classe scritta davvero (la prima non ha mai raggiunto tx.classe.create,
    // perché $transaction stessa è quella che rifiuta, come farebbe Postgres).
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.classe.create).toHaveBeenCalledTimes(1);
    expect(tx.classeDocente.create).toHaveBeenCalledWith({ data: { classeId: "c1", teacherId: "docente1" } });
  });

  it("dopo il numero massimo di tentativi, la collisione persistente si propaga comunque", async () => {
    vi.mocked(prisma.classe.findFirst).mockReset().mockResolvedValue(null);
    vi.mocked(prisma.$transaction).mockReset().mockRejectedValue(erroreVincoloUnico());

    await expect(creaClasse("docente1", { nome: "5B", anno: null })).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    expect(prisma.$transaction).toHaveBeenCalledTimes(5); // TENTATIVI_MASSIMI, non un ciclo infinito
  });

  it("un errore diverso da un vincolo unico continua a propagarsi (non viene inghiottito)", async () => {
    vi.mocked(prisma.classe.findFirst).mockReset().mockResolvedValue(null);
    vi.mocked(prisma.$transaction).mockReset().mockRejectedValue(new Error("guasto imprevisto"));

    await expect(creaClasse("docente1", { nome: "5C", anno: null })).rejects.toThrow("guasto imprevisto");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1); // un errore non-P2002 non fa ritentare
  });
});

describe("creaClasse: collisione di nome (corsa fra due creazioni concorrenti)", () => {
  it("una P2002 il cui riscontro trova il nome già preso diventa nome_gia_usato, senza ritentare", async () => {
    // Non possiamo distinguere "P2002 sul codice" da "P2002 sul nome"
    // guardando solo il codice d'errore — è lo stesso per entrambi i
    // vincoli — e affidarsi alla forma esatta di meta.target sarebbe
    // fragile per un indice parziale che Prisma non modella nello schema
    // (vedi la migrazione). L'implementazione invece rinterroga
    // esplicitamente il nome dopo la P2002: qui si simula "qualcun altro
    // ha appena scritto questo nome" facendo tornare un doppione al
    // SECONDO findFirst (il primo, il pre-check, deve ancora trovare via
    // libera, altrimenti il test proverebbe solo il pre-check ordinario,
    // non la corsa).
    vi.mocked(prisma.classe.findFirst)
      .mockReset()
      .mockResolvedValueOnce(null) // pre-check: nessun doppione, si procede
      .mockResolvedValueOnce({ id: "altro", name: "5D", archivedAt: null } as unknown as Awaited<ReturnType<typeof prisma.classe.findFirst>>); // riscontro dopo la P2002: nel frattempo qualcuno l'ha creata

    vi.mocked(prisma.$transaction).mockReset().mockRejectedValueOnce(erroreVincoloUnico());

    const esito = await creaClasse("docente1", { nome: "5D", anno: null });

    expect(esito).toEqual({ ok: false, motivo: "nome_gia_usato" });
    // non ha ritentato con un nuovo codice: ritentare con lo STESSO nome
    // colliderebbe di nuovo, la porta è chiusa dal vincolo, non dalla
    // sfortuna di un codice.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.classe.findFirst).toHaveBeenCalledTimes(2);
  });
});

describe("rigeneraCodice: collisione di codice", () => {
  it("una violazione P2002 sul nuovo codice fa ritentare e il secondo update va a buon fine", async () => {
    vi.mocked(prisma.classe.findUnique).mockReset().mockResolvedValue({ id: "c1", name: "5A", archivedAt: null } as unknown as Awaited<ReturnType<typeof prisma.classe.findUnique>>);
    vi.mocked(prisma.classeDocente.findUnique).mockReset().mockResolvedValue({ classeId: "c1", teacherId: "docente1" } as unknown as Awaited<ReturnType<typeof prisma.classeDocente.findUnique>>);
    vi.mocked(prisma.classe.update)
      .mockReset()
      .mockRejectedValueOnce(erroreVincoloUnico()) // primo tentativo: collisione
      .mockResolvedValueOnce({ id: "c1", name: "5A", codice: "GHIJKL", yearLevel: null, googleGroupEmail: null, archivedAt: null, createdAt: new Date() }); // secondo: va a buon fine

    const esito = await rigeneraCodice("c1", "docente1");

    expect(esito).toEqual({ ok: true, codice: "GHIJKL" });
    expect(prisma.classe.update).toHaveBeenCalledTimes(2); // la prova che ha ritentato, non sperato
  });

  it("dopo il numero massimo di tentativi, la collisione persistente si propaga comunque", async () => {
    vi.mocked(prisma.classe.findUnique).mockReset().mockResolvedValue({ id: "c1", name: "5A", archivedAt: null } as unknown as Awaited<ReturnType<typeof prisma.classe.findUnique>>);
    vi.mocked(prisma.classeDocente.findUnique).mockReset().mockResolvedValue({ classeId: "c1", teacherId: "docente1" } as unknown as Awaited<ReturnType<typeof prisma.classeDocente.findUnique>>);
    vi.mocked(prisma.classe.update).mockReset().mockRejectedValue(erroreVincoloUnico());

    await expect(rigeneraCodice("c1", "docente1")).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    expect(prisma.classe.update).toHaveBeenCalledTimes(5); // TENTATIVI_MASSIMI, non un ciclo infinito
  });

  it("un errore diverso da un vincolo unico continua a propagarsi (non viene inghiottito)", async () => {
    vi.mocked(prisma.classe.findUnique).mockReset().mockResolvedValue({ id: "c1", name: "5A", archivedAt: null } as unknown as Awaited<ReturnType<typeof prisma.classe.findUnique>>);
    vi.mocked(prisma.classeDocente.findUnique).mockReset().mockResolvedValue({ classeId: "c1", teacherId: "docente1" } as unknown as Awaited<ReturnType<typeof prisma.classeDocente.findUnique>>);
    vi.mocked(prisma.classe.update).mockReset().mockRejectedValue(new Error("guasto imprevisto"));

    await expect(rigeneraCodice("c1", "docente1")).rejects.toThrow("guasto imprevisto");
    expect(prisma.classe.update).toHaveBeenCalledTimes(1); // un errore non-P2002 non fa ritentare
  });
});
