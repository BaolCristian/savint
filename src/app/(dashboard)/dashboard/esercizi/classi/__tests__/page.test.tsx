import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/classi", () => ({
  classiDisponibili: vi.fn(),
  classiDelDocente: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// Il traduttore restituisce chiave e valori: le asserzioni parlano di quale
// messaggio è stato scelto, non del testo italiano di quel messaggio.
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { classiDisponibili, classiDelDocente } from "@/lib/esercizi/classi";
import Page from "../page";

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(classiDisponibili).mockReset();
  vi.mocked(classiDelDocente).mockReset();
});

async function rendi() {
  render(await Page());
}

describe("pagina delle classi del docente", () => {
  it("chiama redirectUnlessTeacher", async () => {
    vi.mocked(classiDisponibili).mockResolvedValue([]);
    vi.mocked(classiDelDocente).mockResolvedValue([]);
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
  });

  it("mostra una casella per ciascuna classe disponibile, spuntando quelle già insegnate", async () => {
    vi.mocked(classiDisponibili).mockResolvedValue([
      { id: "c1", name: "1A", yearLevel: 1 },
      { id: "c2", name: "2B", yearLevel: 2 },
    ]);
    vi.mocked(classiDelDocente).mockResolvedValue([
      { id: "c1", name: "1A", yearLevel: 1, studenti: 20 },
    ] as never);

    await rendi();

    const cb1 = screen.getByRole("checkbox", { name: /1A/ });
    const cb2 = screen.getByRole("checkbox", { name: /2B/ });
    expect(cb1).toBeChecked();
    expect(cb2).not.toBeChecked();
  });

  it("senza classi disponibili non mostra il modulo", async () => {
    vi.mocked(classiDisponibili).mockResolvedValue([]);
    vi.mocked(classiDelDocente).mockResolvedValue([]);
    await rendi();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText("nessunaClasse")).toBeInTheDocument();
  });

  it("salvare chiama dichiaraInsegnamento via l'API con le classi selezionate", async () => {
    vi.mocked(classiDisponibili).mockResolvedValue([
      { id: "c1", name: "1A", yearLevel: 1 },
      { id: "c2", name: "2B", yearLevel: 2 },
    ]);
    vi.mocked(classiDelDocente).mockResolvedValue([
      { id: "c1", name: "1A", yearLevel: 1, studenti: 20 },
    ] as never);
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;

    await rendi();
    fireEvent.click(screen.getByRole("checkbox", { name: /2B/ }));
    fireEvent.click(screen.getByRole("button", { name: "salva" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/esercizi/classi/insegnate",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const body = JSON.parse((vi.mocked(global.fetch).mock.calls[0]![1] as RequestInit).body as string);
    expect(new Set(body.classeIds)).toEqual(new Set(["c1", "c2"]));
    expect(await screen.findByText("salvato")).toBeInTheDocument();
  });

  it("un errore di salvataggio mostra il messaggio d'errore", async () => {
    vi.mocked(classiDisponibili).mockResolvedValue([{ id: "c1", name: "1A", yearLevel: 1 }]);
    vi.mocked(classiDelDocente).mockResolvedValue([]);
    global.fetch = vi.fn(async () => new Response(null, { status: 500 })) as typeof fetch;

    await rendi();
    fireEvent.click(screen.getByRole("button", { name: "salva" }));

    expect(await screen.findByText("erroreSalvataggio")).toBeInTheDocument();
  });
});
