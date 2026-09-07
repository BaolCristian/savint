import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/batterie", () => ({ elencoBatterie: vi.fn() }));
vi.mock("@/lib/esercizi/contenitori", () => ({ elencoContenitori: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { elencoBatterie } from "@/lib/esercizi/batterie";
import { elencoContenitori } from "@/lib/esercizi/contenitori";
import Page from "../page";

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(elencoBatterie).mockReset();
  vi.mocked(elencoContenitori).mockReset().mockResolvedValue([
    { id: "cont1", name: "Equazioni", description: null, esercizi: 5 },
  ]);
});

async function rendi() {
  render(await Page());
}

describe("pagina delle batterie", () => {
  it("chiama redirectUnlessTeacher", async () => {
    vi.mocked(elencoBatterie).mockResolvedValue([]);
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
  });

  it("elenca le batterie con le loro regole e quanti compiti le usano", async () => {
    vi.mocked(elencoBatterie).mockResolvedValue([
      { id: "b1", name: "Verifica 1", regole: [{ contenitore: "Equazioni", count: 3 }], compiti: 2 },
    ]);
    await rendi();
    expect(screen.getByText("Verifica 1")).toBeInTheDocument();
    expect(screen.getByText(/regolaLabel.*Equazioni/)).toBeInTheDocument();
  });

  it("senza batterie mostra il messaggio vuoto", async () => {
    vi.mocked(elencoBatterie).mockResolvedValue([]);
    await rendi();
    expect(screen.getByText("nessunaBatteria")).toBeInTheDocument();
  });

  it("crea una batteria con una regola tramite l'API", async () => {
    vi.mocked(elencoBatterie).mockResolvedValue([]);
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ id: "b-nuova" }), { status: 201 })) as typeof fetch;

    await rendi();
    fireEvent.change(screen.getByLabelText("nome"), { target: { value: "Verifica nuova" } });
    fireEvent.change(screen.getByLabelText("quantita"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "crea" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/esercizi/batterie",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const body = JSON.parse((vi.mocked(global.fetch).mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({ name: "Verifica nuova", regole: [{ contenitoreId: "cont1", count: 3 }] });
  });

  it("eliminare una batteria in uso mostra il motivo del rifiuto", async () => {
    vi.mocked(elencoBatterie).mockResolvedValue([
      { id: "b1", name: "Verifica 1", regole: [{ contenitore: "Equazioni", count: 3 }], compiti: 2 },
    ]);
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "in_uso" }), { status: 409 })) as typeof fetch;

    await rendi();
    fireEvent.click(screen.getByRole("button", { name: "elimina" }));

    expect(await screen.findByText("erroreInUso")).toBeInTheDocument();
  });
});
