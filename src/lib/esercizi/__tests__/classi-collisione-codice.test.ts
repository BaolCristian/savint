// Il codice di una classe è unico nello schema (vedi task 1). Con un
// alfabeto di 30 caratteri su 6 posizioni lo spazio è enorme (30^6), quindi
// una vera collisione non si può forzare aspettando: qui si mocka prisma
// interamente, sullo stesso modello di
// redazione-conflitto-versione.test.ts, per far fallire la prima
// $transaction con l'errore ESATTO (stessa classe, stesso `code`) che
// Postgres darebbe su un vincolo unico violato, e verificare che creaClasse
// ritenti — non che si arrenda, e non che lo lasci uscire come un
// PrismaClientKnownRequestError grezzo.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    classe: { findFirst: vi.fn(async () => null) }, // nessun doppione di nome: si arriva alla transazione
    $transaction: vi.fn(),
  },
}));

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { creaClasse } from "../classi";

const erroreCodiceInUso = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`codice`)", {
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

    vi.mocked(prisma.$transaction)
      .mockRejectedValueOnce(erroreCodiceInUso()) // primo tentativo: collisione
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
    vi.mocked(prisma.$transaction).mockReset().mockRejectedValue(erroreCodiceInUso());

    await expect(creaClasse("docente1", { nome: "5B", anno: null })).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    expect(prisma.$transaction).toHaveBeenCalledTimes(5); // TENTATIVI_MASSIMI, non un ciclo infinito
  });

  it("un errore diverso da un vincolo unico continua a propagarsi (non viene inghiottito)", async () => {
    vi.mocked(prisma.$transaction).mockReset().mockRejectedValue(new Error("guasto imprevisto"));

    await expect(creaClasse("docente1", { nome: "5C", anno: null })).rejects.toThrow("guasto imprevisto");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1); // un errore non-P2002 non fa ritentare
  });
});
