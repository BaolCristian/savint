import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/compiti", () => ({ consegneDelCompito: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { compito: { findUnique: vi.fn() } } }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { consegneDelCompito } from "@/lib/esercizi/compiti";
import { prisma } from "@/lib/db/client";
import { notFound } from "next/navigation";
import Page from "../[id]/page";

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(consegneDelCompito).mockReset();
  vi.mocked(prisma.compito.findUnique).mockReset();
});

async function rendi(id = "comp1") {
  render(await Page({ params: Promise.resolve({ id }) }));
}

describe("pagina di dettaglio di un compito (consegne)", () => {
  it("chiama redirectUnlessTeacher", async () => {
    vi.mocked(prisma.compito.findUnique).mockResolvedValue({
      id: "comp1", classe: { name: "1A" }, batteria: { name: "Verifica 1" }, dueAt: null,
    } as never);
    vi.mocked(consegneDelCompito).mockResolvedValue([]);
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
  });

  it("404 se il compito non esiste", async () => {
    vi.mocked(prisma.compito.findUnique).mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ id: "boh" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("mostra, per ciascuno studente, nome, quanti esercizi su quanti e il punteggio", async () => {
    vi.mocked(prisma.compito.findUnique).mockResolvedValue({
      id: "comp1", classe: { name: "1A" }, batteria: { name: "Verifica 1" }, dueAt: null,
    } as never);
    vi.mocked(consegneDelCompito).mockResolvedValue([
      { studentId: "s1", nome: "Mario Rossi", fatti: 2, totali: 3, punteggio: 7, massimo: 10 },
    ]);

    await rendi();

    expect(screen.getByText("Mario Rossi")).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(screen.getByText("7/10")).toBeInTheDocument();
  });

  it("senza studenti iscritti mostra il messaggio vuoto", async () => {
    vi.mocked(prisma.compito.findUnique).mockResolvedValue({
      id: "comp1", classe: { name: "1A" }, batteria: { name: "Verifica 1" }, dueAt: null,
    } as never);
    vi.mocked(consegneDelCompito).mockResolvedValue([]);
    await rendi();
    expect(screen.getByText("nessunoIscritto")).toBeInTheDocument();
  });
});
