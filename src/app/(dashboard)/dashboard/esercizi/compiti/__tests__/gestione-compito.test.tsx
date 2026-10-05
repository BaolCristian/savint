import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => (chiave: string) => chiave),
}));

import { GestioneCompito } from "../[id]/gestione-compito";

function rispondi(status: number, corpo: unknown = { ok: true }) {
  const f = vi.fn(async () => new Response(JSON.stringify(corpo), { status }));
  global.fetch = f as unknown as typeof fetch;
  return f;
}

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
});

describe("GestioneCompito (date e ritiro di un compito assegnato)", () => {
  it("precompila apertura e scadenza con le date attuali", () => {
    render(<GestioneCompito compitoId="comp1" opensAt="2099-01-02" dueAt="2099-01-09" />);
    expect(screen.getByLabelText("apertura")).toHaveValue("2099-01-02");
    expect(screen.getByLabelText("scadenza")).toHaveValue("2099-01-09");
  });

  it("salva le date nuove con PATCH, e una data svuotata come null", async () => {
    const f = rispondi(200);
    render(<GestioneCompito compitoId="comp1" opensAt="2099-01-02" dueAt="2099-01-09" />);
    fireEvent.change(screen.getByLabelText("apertura"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("scadenza"), { target: { value: "2099-02-01" } });
    fireEvent.click(screen.getByRole("button", { name: "salvaDate" }));

    await waitFor(() => expect(f).toHaveBeenCalled());
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/esercizi/compiti/comp1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      opensAt: null,
      dueAt: new Date("2099-02-01").toISOString(),
    });
    await waitFor(() => expect(screen.getByText("dateSalvate")).toBeInTheDocument());
    expect(router.refresh).toHaveBeenCalled();
  });

  it("mostra il motivo del rifiuto quando la scadenza è nel passato", async () => {
    rispondi(400, { error: "scadenza_nel_passato" });
    render(<GestioneCompito compitoId="comp1" opensAt="" dueAt="" />);
    fireEvent.change(screen.getByLabelText("scadenza"), { target: { value: "2000-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "salvaDate" }));
    await waitFor(() => expect(screen.getByText("erroreScadenzaPassata")).toBeInTheDocument());
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("mostra il motivo del rifiuto quando la scadenza precede l'apertura", async () => {
    rispondi(400, { error: "scadenza_prima_apertura" });
    render(<GestioneCompito compitoId="comp1" opensAt="2099-03-01" dueAt="2099-02-01" />);
    fireEvent.click(screen.getByRole("button", { name: "salvaDate" }));
    await waitFor(() => expect(screen.getByText("erroreScadenzaPrimaApertura")).toBeInTheDocument());
  });

  it("'Ritira compito' chiede conferma prima di chiamare l'API, e Annulla non ritira nulla", async () => {
    const f = rispondi(200);
    render(<GestioneCompito compitoId="comp1" opensAt="" dueAt="" />);
    fireEvent.click(screen.getByRole("button", { name: "ritira" }));

    const dialogo = screen.getByRole("alertdialog");
    expect(dialogo).toHaveTextContent("ritiraConfermaTitolo");
    expect(dialogo).toHaveTextContent("ritiraConfermaTesto");
    expect(f).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "annulla" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("confermato il ritiro, chiama DELETE e torna all'elenco dei compiti", async () => {
    const f = rispondi(200);
    render(<GestioneCompito compitoId="comp1" opensAt="" dueAt="" />);
    fireEvent.click(screen.getByRole("button", { name: "ritira" }));
    fireEvent.click(screen.getByRole("button", { name: "ritiraConferma" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/esercizi/compiti"));
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/esercizi/compiti/comp1");
    expect(init.method).toBe("DELETE");
  });

  it("se il ritiro fallisce resta sulla pagina e lo dice", async () => {
    rispondi(404, { error: "compito_non_trovato" });
    render(<GestioneCompito compitoId="comp1" opensAt="" dueAt="" />);
    fireEvent.click(screen.getByRole("button", { name: "ritira" }));
    fireEvent.click(screen.getByRole("button", { name: "ritiraConferma" }));
    await waitFor(() => expect(screen.getByText("erroreCompitoNonTrovato")).toBeInTheDocument());
    expect(router.push).not.toHaveBeenCalled();
  });
});
