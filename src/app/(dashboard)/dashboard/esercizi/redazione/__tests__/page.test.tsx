import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/redazione", () => ({
  elencoRedazione: vi.fn(),
  caricaPerEditor: vi.fn(),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { elencoRedazione, caricaPerEditor } from "@/lib/esercizi/redazione";
import Page from "../page";

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(elencoRedazione).mockReset();
  vi.mocked(caricaPerEditor).mockReset();
  push.mockReset();
});

async function rendi() {
  render(await Page());
}

// Task 8: l'elenco della redazione. Deve distinguere a vista modificabile
// da sola lettura, dire il perché per i secondi, offrire "duplica", e
// mostrare autore + data dell'ultima versione — perché qualunque docente
// può modificare qualunque esercizio, e quel rischio va reso visibile.
describe("elenco della redazione", () => {
  it("chiama redirectUnlessTeacher", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([]);
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
  });

  it("dichiara che qualunque docente può modificare qualunque esercizio", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([]);
    await rendi();
    expect(screen.getByText("chiunquePuoModificare")).toBeInTheDocument();
  });

  it("un esercizio modificabile mostra un link diretto all'editor, autore e data", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([
      {
        id: "e1",
        titolo: "Equazione di primo grado",
        argomento: "equazioni",
        anno: 1,
        ultimaVersione: 3,
        modificabile: true,
        autoreNome: "Mario Rossi",
        aggiornatoIl: new Date("2026-01-15T10:30:00Z"),
      },
    ]);
    await rendi();

    expect(screen.getByText("Equazione di primo grado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "apri" })).toHaveAttribute("href", "/dashboard/esercizi/redazione/e1");
    expect(caricaPerEditor).not.toHaveBeenCalledWith("e1");
    expect(screen.getByText(/Mario Rossi/)).toBeInTheDocument();
  });

  it("un esercizio non modificabile mostra il motivo del dominio, non un link all'editor, e offre duplica", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([
      {
        id: "e2",
        titolo: "Griglia complessa",
        argomento: "geometria",
        anno: 3,
        ultimaVersione: 2,
        modificabile: false,
        autoreNome: null,
        aggiornatoIl: new Date("2026-02-01T08:00:00Z"),
      },
    ]);
    vi.mocked(caricaPerEditor).mockResolvedValue({
      ok: false,
      motivo: "non_rappresentabile",
      dettaglio: 'Contiene un tipo di parte (gapfill) che l\'editor non sa ricostruire. Usa "duplica" per continuare a modificarlo direttamente in Numbas.',
    });

    await rendi();

    expect(caricaPerEditor).toHaveBeenCalledWith("e2");
    expect(screen.getByText(/non sa ricostruire/)).toBeInTheDocument();
    expect(
      screen.queryAllByRole("link").find((a) => a.getAttribute("href") === "/dashboard/esercizi/redazione/e2"),
    ).toBeUndefined();
    expect(screen.getByRole("button", { name: "duplica" })).toBeInTheDocument();
  });

  it("duplicare chiama la rotta dedicata e naviga sul nuovo esercizio", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([
      {
        id: "e2",
        titolo: "Griglia complessa",
        argomento: "geometria",
        anno: 3,
        ultimaVersione: 2,
        modificabile: false,
        autoreNome: null,
        aggiornatoIl: new Date("2026-02-01T08:00:00Z"),
      },
    ]);
    vi.mocked(caricaPerEditor).mockResolvedValue({ ok: false, motivo: "non_rappresentabile", dettaglio: "non rappresentabile" });
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ esercizioId: "nuovo1", versione: 1 }), { status: 201 })) as typeof fetch;

    await rendi();
    fireEvent.click(screen.getByRole("button", { name: "duplica" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/esercizi/redazione/e2/duplica", expect.objectContaining({ method: "POST" }));
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/esercizi/redazione/nuovo1"));
  });

  it("senza esercizi mostra il messaggio vuoto", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([]);
    await rendi();
    expect(screen.getByText("nessunEsercizio")).toBeInTheDocument();
  });
});
