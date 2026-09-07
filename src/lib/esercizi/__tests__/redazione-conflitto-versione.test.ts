// Fix round del task precedente, item 2 (vedi il brief del Task 5): due
// salvataggi concorrenti dello stesso esercizio possono far calcolare lo
// stesso numero di versione a entrambe le transazioni; il vincolo
// `@@unique([esercizioId, version])` impedisce la corruzione, ma la
// transazione perdente deve uscire da `salvaNuovaVersione` come un rifiuto
// strutturato (`versione_in_conflitto`), non come un
// `PrismaClientKnownRequestError` grezzo che la rotta trasformerebbe in un
// 500. Riprodurre una vera corsa fra transazioni sarebbe timing-dipendente
// e instabile: qui si mocka prisma per far fallire `$transaction` con
// l'errore ESATTO (stessa classe, stesso `code`) che Postgres darebbe,
// deterministicamente.
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    esercizio: { findUnique: vi.fn(async () => ({ id: "e1" })) },
    $transaction: vi.fn(),
  },
}));

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { salvaNuovaVersione } from "../redazione";
import type { EsercizioEditor } from "../editor/modello";

// Stessa base di editor/__tests__/verifica.test.ts: passa la verifica a
// venti semi senza intermittenza, cosi' il test arriva davvero fino alla
// transazione invece di fermarsi prima per un rifiuto di verifica.
const base: EsercizioEditor = {
  meta: { titolo: "T", descrizione: "", anno: 1, argomento: "equazioni", tag: [], difficolta: 1 },
  testo: "Risolvi \\(\\simplify{ {a}x+{b} }=0\\)",
  suggerimento: "",
  variabili: [
    { nome: "a", definizione: "random(2..9)", descrizione: "" },
    { nome: "b", definizione: "random(-9..9 except 0)", descrizione: "" },
  ],
  condizione: "",
  parti: [{ tipo: "numerica", consegna: "\\(x=\\)", punti: 2, valore: "-b/a", tolleranza: { tipo: "esatta" } }],
};

describe("salvaNuovaVersione: due salvataggi concorrenti sullo stesso esercizio", () => {
  it("un vincolo unico violato (P2002) diventa un rifiuto strutturato, non un'eccezione", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`esercizioId`,`version`)",
        { code: "P2002", clientVersion: "6.19.2", meta: { target: ["esercizioId", "version"] } },
      ),
    );

    const esito = await salvaNuovaVersione("e1", base);
    expect(esito.ok).toBe(false);
    if (esito.ok) throw new Error("atteso un rifiuto");
    expect(esito.motivo).toBe("versione_in_conflitto");
  });

  it("un errore diverso da un vincolo unico continua a propagarsi (non viene inghiottito)", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("guasto imprevisto"));

    await expect(salvaNuovaVersione("e1", base)).rejects.toThrow("guasto imprevisto");
  });
});
