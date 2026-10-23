import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/batterie", () => ({ elencoModelli: vi.fn() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/esercizi/modelli", useRouter: () => ({ refresh }) }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { elencoModelli } from "@/lib/esercizi/batterie";
import Page from "../page";

const MIO = {
  id: "m1",
  nome: "Verifica equazioni",
  autoreNome: "Rossi",
  mio: true,
  blocchi: [{ etichetta: "Equazioni", quanti: 3 }, { etichetta: "Esercizi scelti", quanti: 2 }],
  usato: 2,
};
const SUO = { id: "m2", nome: "Ripasso frazioni", autoreNome: "Bianchi", mio: false, blocchi: [{ etichetta: "Frazioni", quanti: 5 }], usato: 0 };

beforeEach(() => {
  refresh.mockReset();
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(elencoModelli).mockReset().mockResolvedValue([MIO, SUO]);
});

async function rendi() {
  render(await Page());
}

describe("pagina dei modelli", () => {
  it("chiama redirectUnlessTeacher ed elenca come chi è collegato", async () => {
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
    expect(elencoModelli).toHaveBeenCalledWith({ id: "doc1", admin: false });
  });

  it("mostra nome, autore, blocchi in breve e quante volte è usato", async () => {
    await rendi();
    expect(screen.getByText("Verifica equazioni")).toBeInTheDocument();
    expect(screen.getByText(/di:.*Rossi/)).toBeInTheDocument();
    expect(screen.getByText(/blocco:.*Equazioni/)).toBeInTheDocument();
    expect(screen.getByText(/blocco:.*Esercizi scelti/)).toBeInTheDocument();
    expect(screen.getByText(/usato:\{"n":2\}/)).toBeInTheDocument();
  });

  it("\"Usa questo modello\" apre il Nuovo compito col modello", async () => {
    await rendi();
    const link = screen.getAllByRole("link", { name: "usa" });
    expect(link[0]).toHaveAttribute("href", "/dashboard/esercizi/compiti/nuovo?modello=m1");
    expect(link[1]).toHaveAttribute("href", "/dashboard/esercizi/compiti/nuovo?modello=m2");
  });

  it("Elimina c'è solo sui propri modelli", async () => {
    await rendi();
    expect(screen.getAllByRole("button", { name: "elimina" })).toHaveLength(1);
  });

  it("un ADMIN può eliminare tutti i modelli", async () => {
    vi.mocked(redirectUnlessTeacher).mockResolvedValue({ user: { id: "adm1", role: "ADMIN" } } as never);
    await rendi();
    expect(elencoModelli).toHaveBeenCalledWith({ id: "adm1", admin: true });
    expect(screen.getAllByRole("button", { name: "elimina" })).toHaveLength(2);
  });

  it("il filtro Miei nasconde i modelli dei colleghi, Tutti li rimostra", async () => {
    await rendi();
    fireEvent.click(screen.getByRole("button", { name: "filtroMiei" }));
    expect(screen.getByText("Verifica equazioni")).toBeInTheDocument();
    expect(screen.queryByText("Ripasso frazioni")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "filtroTutti" }));
    expect(screen.getByText("Ripasso frazioni")).toBeInTheDocument();
  });

  it("con Miei e nessun modello proprio lo dice", async () => {
    vi.mocked(elencoModelli).mockResolvedValue([SUO]);
    await rendi();
    fireEvent.click(screen.getByRole("button", { name: "filtroMiei" }));
    expect(screen.getByText("nessunoMio")).toBeInTheDocument();
  });

  it("eliminare chiama la rotta dei modelli e aggiorna", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;
    await rendi();
    fireEvent.click(screen.getByRole("button", { name: "elimina" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith("/api/esercizi/modelli/m1", { method: "DELETE" });
  });

  it("un'eliminazione rifiutata mostra l'errore", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "non_trovato" }), { status: 404 })) as typeof fetch;
    await rendi();
    fireEvent.click(screen.getByRole("button", { name: "elimina" }));
    expect(await screen.findByText("erroreGenerico")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("senza modelli mostra il messaggio vuoto", async () => {
    vi.mocked(elencoModelli).mockResolvedValue([]);
    await rendi();
    expect(screen.getByText("nessunModello")).toBeInTheDocument();
  });
});
