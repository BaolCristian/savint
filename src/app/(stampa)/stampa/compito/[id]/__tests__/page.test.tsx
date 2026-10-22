import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn(async () => ({ user: { id: "d1" } })) }));
vi.mock("@/lib/esercizi/stampa", async (originale) => ({
  ...(await originale<typeof import("@/lib/esercizi/stampa")>()),
  datiStampaCompito: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "it"),
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));
vi.mock("@/components/esercizi/stampa/verifica-stampabile-lazy", () => ({
  VerificaStampabileLazy: (props: { fogli: { etichetta: string }[]; conSoluzioni: boolean }) => (
    <div data-testid="verifica" data-fogli={props.fogli.map((f) => f.etichetta).join(",")} data-soluzioni={String(props.conSoluzioni)} />
  ),
}));

import { datiStampaCompito } from "@/lib/esercizi/stampa";
import Page from "../page";

const dati = {
  compitoId: "c1",
  titolo: "Verifica",
  classe: "1A",
  esercizi: [{ titolo: "E1", content: {} }],
  studenti: [{ id: "s1", nome: "Anna" }, { id: "s2", nome: "Marco" }],
};

async function apri(query: Record<string, string> = {}) {
  render(await Page({ params: Promise.resolve({ id: "c1" }), searchParams: Promise.resolve(query) }));
  return screen.getByTestId("verifica");
}

beforeEach(() => {
  vi.mocked(datiStampaCompito).mockReset().mockResolvedValue(dati);
});

describe("pagina di stampa del compito", () => {
  it("di base stampa due versioni con le soluzioni", async () => {
    const v = await apri();
    expect(datiStampaCompito).toHaveBeenCalledWith("c1", "d1");
    expect(v).toHaveAttribute("data-fogli", "A,B");
    expect(v).toHaveAttribute("data-soluzioni", "true");
    expect(screen.getByRole("link", { name: "torna" })).toHaveAttribute("href", "/dashboard/esercizi/compiti/c1");
  });

  it("rispetta le scelte del modulo: un foglio per studente, senza soluzioni", async () => {
    const v = await apri({ versioni: "studenti", scelto: "1" });
    expect(v).toHaveAttribute("data-fogli", "Anna,Marco");
    expect(v).toHaveAttribute("data-soluzioni", "false");
    expect(screen.getByRole("combobox")).toHaveValue("studenti");
  });

  it("avvisa se la classe non ha studenti da stampare per nome", async () => {
    vi.mocked(datiStampaCompito).mockResolvedValue({ ...dati, studenti: [] });
    render(await Page({ params: Promise.resolve({ id: "c1" }), searchParams: Promise.resolve({ versioni: "studenti" }) }));
    expect(screen.getByText("nessunoStudente")).toBeInTheDocument();
  });

  it("risponde non trovato a un compito che il docente non può stampare", async () => {
    vi.mocked(datiStampaCompito).mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ id: "c1" }), searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
