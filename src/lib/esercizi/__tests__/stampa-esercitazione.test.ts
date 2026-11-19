import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: { esercizio: { findMany: vi.fn() }, esercizioVersione: { findMany: vi.fn() } },
}));
vi.mock("../accesso", () => ({ ruoliEsercizi: vi.fn() }));
vi.mock("../contenitori", () => ({ contenutoContenitore: vi.fn() }));

import { prisma } from "@/lib/db/client";
import { ruoliEsercizi } from "../accesso";
import { contenutoContenitore } from "../contenitori";
import { datiStampaEsercitazione, leggiFonte, leggiSceltaSoluzioni } from "../stampa-esercitazione";

const chi = { id: "d1", admin: false };

beforeEach(() => {
  vi.mocked(ruoliEsercizi).mockReset().mockResolvedValue(new Map([["e1", "EDITOR"], ["e2", "EDITOR"], ["e3", "EDITOR"], ["e4", "EDITOR"]]) as never);
  vi.mocked(prisma.esercizio.findMany).mockReset().mockResolvedValue([
    { id: "e1", title: "INVALSI 2015 · D10 · Area", topic: "Numeri" },
    { id: "e2", title: "INVALSI 2015 · D2 · Frazioni", topic: " numeri " },
    { id: "e3", title: "Rette", topic: "Spazio e figure" },
    { id: "e4", title: "Mai salvato", topic: "Numeri" },
  ] as never);
  // Già in ordine di versione decrescente, come lo chiede la query.
  vi.mocked(prisma.esercizioVersione.findMany).mockReset().mockResolvedValue([
    { esercizioId: "e1", content: { v: "e1-2" } },
    { esercizioId: "e1", content: { v: "e1-1" } },
    { esercizioId: "e2", content: { v: "e2-1" } },
    { esercizioId: "e3", content: { v: "e3-1" } },
  ] as never);
});

describe("leggiFonte e leggiSceltaSoluzioni", () => {
  it("legge raccolta, argomento e anno; senza fonte dà null", () => {
    expect(leggiFonte({ raccolta: "r1" })).toEqual({ tipo: "raccolta", id: "r1" });
    expect(leggiFonte({ argomento: " Numeri ", anno: "2" })).toEqual({ tipo: "argomento", argomento: "Numeri", anno: 2 });
    expect(leggiFonte({ argomento: "Numeri", anno: "x" })).toEqual({ tipo: "argomento", argomento: "Numeri", anno: null });
    expect(leggiFonte({ argomento: "  " })).toBeNull();
    expect(leggiFonte({})).toBeNull();
  });

  it("le soluzioni vanno in fondo se non si sceglie altro", () => {
    expect(leggiSceltaSoluzioni("no")).toBe("no");
    expect(leggiSceltaSoluzioni("sole")).toBe("sole");
    for (const v of [undefined, "", "boh", "fondo"]) expect(leggiSceltaSoluzioni(v)).toBe("fondo");
  });
});

describe("datiStampaEsercitazione — argomento", () => {
  it("prende gli esercizi visibili dell'argomento (senza badare a maiuscole e spazi), in ordine numerico di titolo, all'ultima versione", async () => {
    const dati = await datiStampaEsercitazione({ tipo: "argomento", argomento: "numeri", anno: null }, chi);
    expect(dati!.titolo).toBe("Numeri");
    expect(dati!.esercizi).toEqual([
      { titolo: "INVALSI 2015 · D2 · Frazioni", content: { v: "e2-1" } },
      { titolo: "INVALSI 2015 · D10 · Area", content: { v: "e1-2" } },
    ]);
    expect(dati!.foglio).toEqual({ etichetta: "", nominativo: false, seme: "esercitazione:argomento:numeri:" });
    expect(prisma.esercizio.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["e1", "e2", "e3", "e4"] } } }));
  });

  it("con l'anno filtra per classe", async () => {
    await datiStampaEsercitazione({ tipo: "argomento", argomento: "Numeri", anno: 2 }, chi);
    expect(prisma.esercizio.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["e1", "e2", "e3", "e4"] }, yearLevel: 2 } }));
  });

  it("un docente che non vede niente ha un'esercitazione vuota", async () => {
    vi.mocked(ruoliEsercizi).mockResolvedValue(new Map());
    const dati = await datiStampaEsercitazione({ tipo: "argomento", argomento: "Numeri", anno: null }, chi);
    expect(dati!.esercizi).toEqual([]);
    expect(prisma.esercizio.findMany).not.toHaveBeenCalled();
  });
});

describe("datiStampaEsercitazione — raccolta", () => {
  it("prende gli esercizi della raccolta che il docente vede", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue({
      id: "r1",
      name: "Ripasso",
      esercizi: [{ id: "e3", title: "Rette" }, { id: "e1", title: "INVALSI 2015 · D10 · Area" }],
    } as never);
    const dati = await datiStampaEsercitazione({ tipo: "raccolta", id: "r1" }, chi);
    expect(contenutoContenitore).toHaveBeenCalledWith("r1", chi, expect.any(Map));
    expect(dati).toEqual({
      titolo: "Ripasso",
      indietro: "/dashboard/esercizi/contenitori/r1",
      esercizi: [
        { titolo: "INVALSI 2015 · D10 · Area", content: { v: "e1-2" } },
        { titolo: "Rette", content: { v: "e3-1" } },
      ],
      foglio: { etichetta: "", nominativo: false, seme: "esercitazione:raccolta:r1" },
    });
  });

  it("una raccolta che non vede è null", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue(null);
    expect(await datiStampaEsercitazione({ tipo: "raccolta", id: "r9" }, chi)).toBeNull();
  });
});
