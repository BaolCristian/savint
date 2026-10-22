import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: { compito: { findUnique: vi.fn() }, esercizioVersione: { findMany: vi.fn() } },
}));
vi.mock("../compiti", () => ({ haTitoloSulCompito: vi.fn() }));

import { prisma } from "@/lib/db/client";
import { haTitoloSulCompito } from "../compiti";
import { datiStampaCompito, fogliDiStampa, leggiSceltaVersioni } from "../stampa";

const compito = {
  id: "c1",
  classeId: "k1",
  assignedById: "d1",
  ritiratoAt: null,
  drawnVersionIds: ["v2", "v1"],
  batteria: { name: "Verifica" },
  classe: {
    name: "1A",
    studenti: [
      { studente: { id: "s2", name: "Marco Rossi", email: "m@x.it" } },
      { studente: { id: "s1", name: null, email: "anna@x.it" } },
    ],
  },
};

beforeEach(() => {
  vi.mocked(prisma.compito.findUnique).mockReset().mockResolvedValue(compito as never);
  vi.mocked(prisma.esercizioVersione.findMany).mockReset().mockResolvedValue([
    { id: "v1", content: { n: 1 }, esercizio: { title: "Primo" } },
    { id: "v2", content: { n: 2 }, esercizio: { title: "Secondo" } },
  ] as never);
  vi.mocked(haTitoloSulCompito).mockReset().mockResolvedValue(true);
});

describe("leggiSceltaVersioni", () => {
  it("legge un numero di versioni valido o la stampa per studente", () => {
    expect(leggiSceltaVersioni("3")).toEqual({ tipo: "file", quante: 3 });
    expect(leggiSceltaVersioni("studenti")).toEqual({ tipo: "studenti" });
  });

  it("torna a due versioni per un valore mancante o fuori misura", () => {
    for (const v of [undefined, "", "0", "7", "2.5", "abc"]) expect(leggiSceltaVersioni(v)).toEqual({ tipo: "file", quante: 2 });
  });
});

describe("fogliDiStampa", () => {
  const dati = { compitoId: "c1", studenti: [{ id: "s1", nome: "Anna" }, { id: "s2", nome: "Marco" }] };

  it("dà le versioni A, B, C con un seme per versione", () => {
    expect(fogliDiStampa(dati, { tipo: "file", quante: 3 })).toEqual([
      { etichetta: "A", nominativo: false, seme: "c1:A" },
      { etichetta: "B", nominativo: false, seme: "c1:B" },
      { etichetta: "C", nominativo: false, seme: "c1:C" },
    ]);
  });

  it("dà un foglio per studente, col seme legato allo studente e non alla posizione", () => {
    const fogli = fogliDiStampa(dati, { tipo: "studenti" });
    expect(fogli.map((f) => [f.etichetta, f.nominativo, f.seme])).toEqual([
      ["Anna", true, "c1:s1"],
      ["Marco", true, "c1:s2"],
    ]);
    const senzaAnna = fogliDiStampa({ ...dati, studenti: [dati.studenti[1]] }, { tipo: "studenti" });
    expect(senzaAnna[0].seme).toBe("c1:s2");
  });
});

describe("datiStampaCompito", () => {
  it("rende gli esercizi nell'ordine dell'estrazione e gli studenti in ordine alfabetico", async () => {
    const dati = await datiStampaCompito("c1", "d1");
    expect(dati).toEqual({
      compitoId: "c1",
      titolo: "Verifica",
      classe: "1A",
      esercizi: [{ titolo: "Secondo", content: { n: 2 } }, { titolo: "Primo", content: { n: 1 } }],
      studenti: [{ id: "s1", nome: "anna@x.it" }, { id: "s2", nome: "Marco Rossi" }],
    });
  });

  it("non rende niente per un compito ritirato, inesistente o di un altro docente", async () => {
    vi.mocked(prisma.compito.findUnique).mockResolvedValueOnce({ ...compito, ritiratoAt: new Date() } as never);
    expect(await datiStampaCompito("c1", "d1")).toBeNull();
    vi.mocked(prisma.compito.findUnique).mockResolvedValueOnce(null);
    expect(await datiStampaCompito("c1", "d1")).toBeNull();
    vi.mocked(haTitoloSulCompito).mockResolvedValueOnce(false);
    expect(await datiStampaCompito("c1", "altro")).toBeNull();
    expect(prisma.esercizioVersione.findMany).not.toHaveBeenCalled();
  });
});
