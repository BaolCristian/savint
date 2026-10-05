import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    compito: { findUnique: vi.fn() },
    classeStudente: { findUnique: vi.fn() },
    esercizioVersione: { findMany: vi.fn() },
    tentativo: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/client";
import { percorsoCompitoStudente } from "../percorso-compito";

beforeEach(() => {
  vi.mocked(prisma.compito.findUnique).mockReset().mockResolvedValue({
    id: "c1", classeId: "classe-1", opensAt: null, drawnVersionIds: ["v2", "v1"], batteria: { name: "Algebra" },
  } as never);
  vi.mocked(prisma.classeStudente.findUnique).mockReset().mockResolvedValue({ classeId: "classe-1", studentId: "s1" } as never);
  vi.mocked(prisma.esercizioVersione.findMany).mockReset().mockResolvedValue([
    { id: "v1", esercizioId: "e1", esercizio: { title: "Primo" } },
    { id: "v2", esercizioId: "e2", esercizio: { title: "Secondo" } },
  ] as never);
  vi.mocked(prisma.tentativo.findMany).mockReset().mockResolvedValue([]);
});

describe("percorsoCompitoStudente", () => {
  it("sceglie il primo esercizio non completato nell'ordine congelato", async () => {
    vi.mocked(prisma.tentativo.findMany).mockResolvedValue([
      { esercizioVersioneId: "v2", status: "COMPLETED" },
    ] as never);

    const percorso = await percorsoCompitoStudente("c1", "s1");

    expect(percorso).toMatchObject({
      titolo: "Algebra",
      totale: 2,
      prossimo: { esercizioId: "e1", indice: 2 },
    });
    expect(prisma.tentativo.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        studentId: "s1", compitoId: "c1", status: "COMPLETED",
        esercizioVersioneId: { in: ["v2", "v1"] },
      },
    }));
  });

  it("restituisce il riepilogo finale soltanto quando ogni versione congelata e completata", async () => {
    vi.mocked(prisma.tentativo.findMany).mockResolvedValue([
      { esercizioVersioneId: "v1", status: "COMPLETED" },
      { esercizioVersioneId: "v2", status: "COMPLETED" },
    ] as never);

    const percorso = await percorsoCompitoStudente("c1", "s1");

    expect(percorso).toMatchObject({ totale: 2, prossimo: null });
  });

  it("non espone il percorso a uno studente non piu iscritto", async () => {
    vi.mocked(prisma.classeStudente.findUnique).mockResolvedValue(null);

    await expect(percorsoCompitoStudente("c1", "s1")).resolves.toBeNull();
  });

  it("non apre un compito prima dell'orario previsto", async () => {
    vi.mocked(prisma.compito.findUnique).mockResolvedValue({
      classeId: "classe-1", opensAt: new Date(Date.now() + 60_000),
      drawnVersionIds: ["v2", "v1"], batteria: { name: "Algebra" },
    } as never);

    await expect(percorsoCompitoStudente("c1", "s1")).resolves.toBeNull();
    expect(prisma.tentativo.findMany).not.toHaveBeenCalled();
  });

  it("non considera concluso un compito se manca una versione assegnata", async () => {
    vi.mocked(prisma.esercizioVersione.findMany).mockResolvedValue([
      { id: "v1", esercizioId: "e1", esercizio: { title: "Primo" } },
    ] as never);

    await expect(percorsoCompitoStudente("c1", "s1")).resolves.toBeNull();
    expect(prisma.tentativo.findMany).not.toHaveBeenCalled();
  });

  // `/studente/compito/[id]` con l'id di un compito ritirato, scritto a mano
  // nell'indirizzo: la riga esiste ancora (soft delete), ma per lo studente
  // quel compito non c'è più.
  it("non apre un compito ritirato dal docente", async () => {
    vi.mocked(prisma.compito.findUnique).mockResolvedValue({
      classeId: "classe-1", opensAt: null, ritiratoAt: new Date(),
      drawnVersionIds: ["v2", "v1"], batteria: { name: "Algebra" },
    } as never);

    await expect(percorsoCompitoStudente("c1", "s1")).resolves.toBeNull();
    expect(prisma.tentativo.findMany).not.toHaveBeenCalled();
  });
});
