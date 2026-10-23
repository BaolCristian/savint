import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/contenitori", () => ({ contenutoContenitore: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { esercizio: { findMany: vi.fn() } } }));
// `puo` e `utenteDaSessione` restano veri: si finge solo il calcolo dei
// ruoli, che legge il database.
vi.mock("@/lib/esercizi/accesso", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/esercizi/accesso")>()),
  ruoliEsercizi: vi.fn(),
}));
vi.mock("@/lib/esercizi/redazione", () => ({ accessoEsercizi: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/esercizi/contenitori/cont1",
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));
vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { contenutoContenitore } from "@/lib/esercizi/contenitori";
import { prisma } from "@/lib/db/client";
import { ruoliEsercizi } from "@/lib/esercizi/accesso";
import { accessoEsercizi } from "@/lib/esercizi/redazione";
import { notFound } from "next/navigation";
import Page from "../[id]/page";

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(contenutoContenitore).mockReset();
  vi.mocked(prisma.esercizio.findMany).mockReset().mockResolvedValue([]);
  vi.mocked(ruoliEsercizi).mockReset().mockResolvedValue(new Map());
  vi.mocked(accessoEsercizi).mockReset().mockResolvedValue(new Map());
});

// I campi che ogni raccolta di prova porta: di norma è del docente e
// nessun altro ci ha accesso.
const MIA = { ruolo: "PROPRIETARIO" as const, trasmette: false };

async function rendi(id = "cont1") {
  render(await Page({ params: Promise.resolve({ id }) }));
}

describe("pagina di dettaglio di un contenitore", () => {
  it("chiama redirectUnlessTeacher", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue({
      id: "cont1", name: "Equazioni", description: null, esercizi: [], ...MIA,
    });
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
  });

  // Nuovo compito, Task 7: dalla raccolta si assegna direttamente.
  it("\"Assegna questa raccolta\" apre il Nuovo compito con la raccolta", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue({
      id: "cont1", name: "Equazioni", description: null, ...MIA,
      esercizi: [{ id: "e1", title: "Primo grado", yearLevel: 1, topic: "algebra", difficulty: 1 }],
    });
    await rendi();
    expect(screen.getByRole("link", { name: "assegna" })).toHaveAttribute(
      "href", "/dashboard/esercizi/compiti/nuovo?raccolta=cont1",
    );
  });

  it("una raccolta vuota non offre di essere assegnata", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue({
      id: "cont1", name: "Equazioni", description: null, esercizi: [], ...MIA,
    });
    await rendi();
    expect(screen.queryByRole("link", { name: "assegna" })).toBeNull();
  });

  it("404 se il contenitore non esiste", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ id: "boh" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("elenca gli esercizi già dentro, ciascuno con un pulsante di rimozione e un link all'anteprima", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue({
      id: "cont1",
      name: "Equazioni",
      description: null,
      ...MIA,
      esercizi: [{ id: "e1", title: "Primo grado", yearLevel: 1, topic: "algebra", difficulty: 1 }],
    });
    await rendi();
    expect(screen.getByText("Equazioni")).toBeInTheDocument();
    expect(screen.getByText("Primo grado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "rimuovi" })).toBeInTheDocument();
    // Il gap che questo task chiude: dove il docente sceglie alla cieca —
    // qui, e nella prova gemella sotto per chi è ancora fuori — un link
    // all'anteprima su ciascun esercizio.
    const preview = screen.getByRole("link", { name: "anteprima" });
    expect(preview).toHaveAttribute(
      "href", "/dashboard/esercizi/anteprima/e1",
    );
    expect(preview).toHaveAttribute("target", "_blank");
    expect(preview).toHaveAttribute("rel", "noreferrer");
  });

  it("rimuovere un esercizio chiama la DELETE dell'API", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue({
      id: "cont1",
      name: "Equazioni",
      description: null,
      ...MIA,
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

  it("offre solo gli esercizi non ancora presenti per l'aggiunta, ciascuno con un link all'anteprima", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue({
      id: "cont1",
      name: "Equazioni",
      description: null,
      ...MIA,
      esercizi: [{ id: "e1", title: "Dentro", yearLevel: 1, topic: "algebra", difficulty: 1 }],
    });
    vi.mocked(prisma.esercizio.findMany).mockResolvedValue([
      { id: "e2", title: "Fuori", yearLevel: 1, topic: "algebra", difficulty: 1 },
    ] as never);

    await rendi();
    expect(screen.getByText("Fuori")).toBeInTheDocument();
    expect(screen.queryAllByText("Dentro")).toHaveLength(1); // solo nell'elenco di chi c'è già
    // Il posto dove il docente sceglie alla cieca oggi: un esercizio ancora
    // fuori dal contenitore deve poter essere visto prima di essere spuntato
    // per l'aggiunta, non solo dopo — sia lui (e2) sia chi è già dentro (e1)
    // portano il link, quindi qui si cerca quello giusto per href.
    expect(
      screen.getAllByRole("link", { name: "anteprima" }).map((a) => a.getAttribute("href")),
    ).toEqual(expect.arrayContaining(["/dashboard/esercizi/anteprima/e1", "/dashboard/esercizi/anteprima/e2"]));
  });

  it("aggiungere esercizi selezionati chiama la POST dell'API", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue({
      id: "cont1", name: "Equazioni", description: null, esercizi: [], ...MIA,
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

  it("mantiene la selezione mentre filtra e apre l'anteprima in una nuova scheda", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue({ id: "cont1", name: "Equazioni", description: null, esercizi: [], ...MIA });
    vi.mocked(prisma.esercizio.findMany).mockResolvedValue([
      { id: "e2", title: "Equazione", yearLevel: 1, topic: "algebra", difficulty: 1 },
      { id: "e3", title: "Triangolo", yearLevel: 2, topic: "geometria", difficulty: 1 },
    ] as never);

    await rendi();
    fireEvent.click(screen.getByRole("checkbox", { name: /Equazione/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "collections.search" }), { target: { value: "Triangolo" } });

    expect(screen.getByRole("checkbox", { name: /Triangolo/ })).not.toBeChecked();
    expect(screen.getByText(/collections.selected/).textContent).toContain("1");
    const preview = screen.getByRole("link", { name: "anteprima" });
    expect(preview).toHaveAttribute("target", "_blank");
    expect(preview).toHaveAttribute("rel", "noreferrer");
  });

  it("passa al contenuto il docente e i suoi esercizi visibili, e offre da aggiungere solo quelli", async () => {
    const visibili = new Map([["e2", "EDITOR" as const], ["e1", "PROPRIETARIO" as const]]);
    vi.mocked(ruoliEsercizi).mockResolvedValue(visibili);
    vi.mocked(contenutoContenitore).mockResolvedValue({
      id: "cont1", name: "Equazioni", description: null, ...MIA,
      esercizi: [{ id: "e1", title: "Dentro", yearLevel: 1, topic: "algebra", difficulty: 1 }],
    });
    await rendi();
    expect(contenutoContenitore).toHaveBeenCalledWith("cont1", { id: "doc1", admin: false }, visibili);
    expect(vi.mocked(prisma.esercizio.findMany).mock.calls[0]![0]).toMatchObject({ where: { id: { in: ["e2"] } } });
  });

  it("il proprietario della raccolta ha Condividi", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue({ id: "cont1", name: "Equazioni", description: null, esercizi: [], ...MIA });
    await rendi();
    expect(screen.getByRole("button", { name: "condividi" })).toBeInTheDocument();
  });

  it("chi ha la raccolta da editor non ha Condividi", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue({
      id: "cont1", name: "Equazioni", description: null, esercizi: [], ruolo: "EDITOR", trasmette: true,
    });
    await rendi();
    expect(screen.queryByRole("button", { name: "condividi" })).toBeNull();
  });

  it("in sola lettura niente pulsanti di rimozione e niente sezione per aggiungere", async () => {
    vi.mocked(contenutoContenitore).mockResolvedValue({
      id: "cont1", name: "Equazioni", description: null, ruolo: "VISUALIZZATORE", trasmette: true,
      esercizi: [{ id: "e1", title: "Dentro", yearLevel: 1, topic: "algebra", difficulty: 1 }],
    });
    await rendi();
    expect(screen.getByText("Dentro")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "rimuovi" })).toBeNull();
    expect(screen.queryByText("aggiungiEsercizi")).toBeNull();
    expect(prisma.esercizio.findMany).not.toHaveBeenCalled();
  });

  describe("un esercizio proprio e privato in una raccolta condivisa", () => {
    beforeEach(() => {
      vi.mocked(ruoliEsercizi).mockResolvedValue(new Map([["e2", "PROPRIETARIO" as const], ["e3", "PROPRIETARIO" as const]]));
      vi.mocked(contenutoContenitore).mockResolvedValue({
        id: "cont1", name: "Equazioni", description: null, ruolo: "PROPRIETARIO", trasmette: true, esercizi: [],
      });
      vi.mocked(prisma.esercizio.findMany).mockResolvedValue([
        { id: "e2", title: "Mio privato", yearLevel: 1, topic: "algebra", difficulty: 1, authorId: "doc1" },
        { id: "e3", title: "Mio condiviso", yearLevel: 1, topic: "algebra", difficulty: 1, authorId: "doc1" },
      ] as never);
      vi.mocked(accessoEsercizi).mockResolvedValue(new Map([["e2", "privato" as const], ["e3", "scuola" as const]]));
      global.fetch = vi.fn(async () => new Response(JSON.stringify({ aggiunti: 1 }), { status: 200 })) as typeof fetch;
    });

    it("chiede conferma prima di aggiungerlo, e lo aggiunge solo dopo", async () => {
      await rendi();
      fireEvent.click(screen.getByRole("checkbox", { name: /Mio privato/ }));
      fireEvent.click(screen.getByRole("button", { name: "aggiungi" }));

      const avviso = screen.getByRole("alertdialog");
      expect(avviso).toHaveTextContent("avvisoPrivato");
      expect(global.fetch).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "confermaAggiunta" }));
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
      const body = JSON.parse((vi.mocked(global.fetch).mock.calls[0]![1] as RequestInit).body as string);
      expect(body).toEqual({ esercizioIds: ["e2"] });
    });

    it("annullare non aggiunge niente", async () => {
      await rendi();
      fireEvent.click(screen.getByRole("checkbox", { name: /Mio privato/ }));
      fireEvent.click(screen.getByRole("button", { name: "aggiungi" }));
      fireEvent.click(screen.getByRole("button", { name: "annulla" }));
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("un esercizio già condiviso si aggiunge senza avviso", async () => {
      await rendi();
      fireEvent.click(screen.getByRole("checkbox", { name: /Mio condiviso/ }));
      fireEvent.click(screen.getByRole("button", { name: "aggiungi" }));
      expect(screen.queryByRole("alertdialog")).toBeNull();
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    });

    it("in una raccolta che non trasmette non c'è avviso (e non si calcola nemmeno l'accesso)", async () => {
      vi.mocked(contenutoContenitore).mockResolvedValue({
        id: "cont1", name: "Equazioni", description: null, ruolo: "PROPRIETARIO", trasmette: false, esercizi: [],
      });
      await rendi();
      fireEvent.click(screen.getByRole("checkbox", { name: /Mio privato/ }));
      fireEvent.click(screen.getByRole("button", { name: "aggiungi" }));
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(accessoEsercizi).toHaveBeenCalledWith([]);
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    });

    it("l'esercizio di un altro autore non porta l'avviso, anche se privato", async () => {
      vi.mocked(prisma.esercizio.findMany).mockResolvedValue([
        { id: "e2", title: "Mio privato", yearLevel: 1, topic: "algebra", difficulty: 1, authorId: "altro" },
      ] as never);
      await rendi();
      fireEvent.click(screen.getByRole("checkbox", { name: /Mio privato/ }));
      fireEvent.click(screen.getByRole("button", { name: "aggiungi" }));
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });
});
