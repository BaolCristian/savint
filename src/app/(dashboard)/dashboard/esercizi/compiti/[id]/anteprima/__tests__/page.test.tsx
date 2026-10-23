import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/compiti", () => ({ haTitoloSulCompito: vi.fn() }));
vi.mock("@/lib/esercizi/versioni-compito", () => ({ versioniDelloStudente: vi.fn() }));
vi.mock("@/lib/esercizi/estrazione", () => ({ versioniConContenuto: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  prisma: { compito: { findUnique: vi.fn() }, classeStudente: { findMany: vi.fn() } },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/esercizi/compiti/comp1/anteprima",
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
  getLocale: vi.fn(async () => "it"),
}));
vi.mock("@/components/esercizi/player/player-esercizio-lazy", () => ({
  PlayerEsercizioLazy: (props: { esercizioId: string }) => <div data-testid="player" data-esercizio-id={props.esercizioId} />,
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { haTitoloSulCompito } from "@/lib/esercizi/compiti";
import { versioniDelloStudente } from "@/lib/esercizi/versioni-compito";
import { versioniConContenuto } from "@/lib/esercizi/estrazione";
import { prisma } from "@/lib/db/client";
import Page from "../page";

const COMPITO = {
  id: "comp1",
  classeId: "cl1",
  assignedById: "doc1",
  ritiratoAt: null,
  modo: "CLASSE",
  drawnVersionIds: ["v2", "v1"],
  batteria: { name: "Equazioni (2)" },
  classe: { name: "2ª B" },
};
const riga = (n: number) => [`v${n}`, { versioneId: `v${n}`, esercizioId: `e${n}`, titolo: `Esercizio ${n}`, content: { n } }] as const;

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(haTitoloSulCompito).mockReset().mockResolvedValue(true);
  vi.mocked(prisma.compito.findUnique).mockReset().mockResolvedValue(COMPITO as never);
  vi.mocked(prisma.classeStudente.findMany).mockReset().mockResolvedValue([
    { studentId: "s1", studente: { name: "Anna", email: "a@x.it" } },
    { studentId: "s2", studente: { name: "Bruno", email: "b@x.it" } },
  ] as never);
  vi.mocked(versioniDelloStudente).mockReset().mockResolvedValue(["v3"]);
  vi.mocked(versioniConContenuto).mockReset().mockImplementation(async (ids) => new Map(ids.map((v) => riga(Number(v.slice(1))))));
});

async function rendi(searchParams: Record<string, string> = {}) {
  const pagina = await Page({ params: Promise.resolve({ id: "comp1" }), searchParams: Promise.resolve(searchParams) });
  render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      {pagina}
    </NextIntlClientProvider>,
  );
}

describe("anteprima di un compito assegnato", () => {
  it("modo stesse domande: gli esercizi del compito, nell'ordine del compito", async () => {
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
    expect(haTitoloSulCompito).toHaveBeenCalledWith(expect.objectContaining({ classeId: "cl1" }), "doc1");
    expect(versioniConContenuto).toHaveBeenCalledWith(["v2", "v1"]);
    expect(screen.getByText("Esercizio 1 di 2")).toBeInTheDocument();
    expect(screen.getByTestId("player")).toHaveAttribute("data-esercizio-id", "e2");
    expect(screen.queryByLabelText(/anteprimaDi/)).not.toBeInTheDocument();
  });

  it("404 se chi guarda non ha titolo sul compito", async () => {
    vi.mocked(haTitoloSulCompito).mockResolvedValue(false);
    await expect(rendi()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(versioniConContenuto).not.toHaveBeenCalled();
  });

  it("404 per un compito ritirato o inesistente", async () => {
    vi.mocked(prisma.compito.findUnique).mockResolvedValue({ ...COMPITO, ritiratoAt: new Date() } as never);
    await expect(rendi()).rejects.toThrow("NEXT_NOT_FOUND");
    vi.mocked(prisma.compito.findUnique).mockResolvedValue(null);
    await expect(rendi()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("modo diverse per studente: menu degli iscritti, di default il primo", async () => {
    vi.mocked(prisma.compito.findUnique).mockResolvedValue({ ...COMPITO, modo: "STUDENTE", drawnVersionIds: [] } as never);
    await rendi();
    const menu = screen.getByLabelText("anteprimaDi") as HTMLSelectElement;
    expect([...menu.options].map((o) => o.textContent)).toEqual(["Anna", "Bruno"]);
    expect(menu.value).toBe("s1");
    expect(versioniDelloStudente).toHaveBeenCalledWith("comp1", "s1");
    expect(screen.getByTestId("player")).toHaveAttribute("data-esercizio-id", "e3");
  });

  it("?studente= sceglie lo studente, solo fra gli iscritti", async () => {
    vi.mocked(prisma.compito.findUnique).mockResolvedValue({ ...COMPITO, modo: "STUDENTE", drawnVersionIds: [] } as never);
    await rendi({ studente: "s2" });
    expect(versioniDelloStudente).toHaveBeenCalledWith("comp1", "s2");
    vi.mocked(versioniDelloStudente).mockClear();
    await rendi({ studente: "estraneo" });
    expect(versioniDelloStudente).toHaveBeenCalledWith("comp1", "s1");
    expect(versioniDelloStudente).not.toHaveBeenCalledWith("comp1", "estraneo");
  });

  it("modo diverse per studente senza iscritti: lo dice, senza estrarre per nessuno", async () => {
    vi.mocked(prisma.compito.findUnique).mockResolvedValue({ ...COMPITO, modo: "STUDENTE", drawnVersionIds: [] } as never);
    vi.mocked(prisma.classeStudente.findMany).mockResolvedValue([]);
    await rendi();
    expect(screen.getByText("nessunIscritto")).toBeInTheDocument();
    expect(versioniDelloStudente).not.toHaveBeenCalled();
    expect(screen.queryByTestId("player")).not.toBeInTheDocument();
  });
});
