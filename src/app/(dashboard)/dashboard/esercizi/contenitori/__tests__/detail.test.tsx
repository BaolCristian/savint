import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/contenitori", () => ({ contenutoContenitore: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { esercizio: { findMany: vi.fn() } } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { contenutoContenitore } from "@/lib/esercizi/contenitori";
import { prisma } from "@/lib/db/client";
import { notFound } from "next/navigation";
import Page from "../[id]/page";

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(contenutoContenitore).mockReset();
  vi.mocked(prisma.esercizio.findMany).mockReset().mockResolvedValue([]);
});

async function rendi(id = "cont1") {
  render(await Page({ params: Promise.resolve({ id }) }));
}

describe("pagina di dettaglio di un contenitore", () => {
  it("chiama redirectUnlessTeacher", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue({
      id: "cont1", name: "Equazioni", description: null, esercizi: [],
    });
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
  });

  it("404 se il contenitore non esiste", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ id: "boh" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("elenca gli esercizi già dentro, ciascuno con un pulsante di rimozione", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue({
      id: "cont1",
      name: "Equazioni",
      description: null,
      esercizi: [{ id: "e1", title: "Primo grado", yearLevel: 1, topic: "algebra", difficulty: 1 }],
    });
    await rendi();
    expect(screen.getByText("Equazioni")).toBeInTheDocument();
    expect(screen.getByText("Primo grado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "rimuovi" })).toBeInTheDocument();
  });

  it("rimuovere un esercizio chiama la DELETE dell'API", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue({
      id: "cont1",
      name: "Equazioni",
      description: null,
      esercizi: [{ id: "e1", title: "Primo grado", yearLevel: 1, topic: "algebra", difficulty: 1 }],
    });
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;

    await rendi();
    fireEvent.click(screen.getByRole("button", { name: "rimuovi" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/esercizi/contenitori/cont1/esercizi",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
    const body = JSON.parse((vi.mocked(global.fetch).mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ esercizioId: "e1" });
  });

  it("offre solo gli esercizi non ancora presenti per l'aggiunta", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue({
      id: "cont1",
      name: "Equazioni",
      description: null,
      esercizi: [{ id: "e1", title: "Dentro", yearLevel: 1, topic: "algebra", difficulty: 1 }],
    });
    vi.mocked(prisma.esercizio.findMany).mockResolvedValue([
      { id: "e2", title: "Fuori", yearLevel: 1, topic: "algebra", difficulty: 1 },
    ] as never);

    await rendi();
    expect(screen.getByText("Fuori")).toBeInTheDocument();
    expect(screen.queryAllByText("Dentro")).toHaveLength(1); // solo nell'elenco di chi c'è già
  });

  it("aggiungere esercizi selezionati chiama la POST dell'API", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue({
      id: "cont1", name: "Equazioni", description: null, esercizi: [],
    });
    vi.mocked(prisma.esercizio.findMany).mockResolvedValue([
      { id: "e2", title: "Fuori", yearLevel: 1, topic: "algebra", difficulty: 1 },
    ] as never);
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ aggiunti: 1 }), { status: 200 })) as typeof fetch;

    await rendi();
    fireEvent.click(screen.getByRole("checkbox", { name: /Fuori/ }));
    fireEvent.click(screen.getByRole("button", { name: "aggiungi" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/esercizi/contenitori/cont1/esercizi",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const body = JSON.parse((vi.mocked(global.fetch).mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ esercizioIds: ["e2"] });
  });
});
