import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/classi", () => ({ classiDelDocente: vi.fn() }));
vi.mock("@/lib/esercizi/batterie", () => ({ elencoBatterie: vi.fn() }));
vi.mock("@/lib/esercizi/compiti", () => ({ compitiDellaClasse: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));
// Il modulo client "next-intl" (usato dal form, per l'interpolazione del
// dettaglio d'errore ricevuto solo a runtime dopo la fetch) segue lo stesso
// schema chiave:valori del mock server-side qui sopra.
vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { classiDelDocente } from "@/lib/esercizi/classi";
import { elencoBatterie } from "@/lib/esercizi/batterie";
import { compitiDellaClasse } from "@/lib/esercizi/compiti";
import Page from "../page";

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(classiDelDocente).mockReset().mockResolvedValue([
    { id: "c1", name: "1A", yearLevel: 1, studenti: 20, codice: null },
  ]);
  vi.mocked(elencoBatterie).mockReset().mockResolvedValue([
    { id: "b1", name: "Verifica 1", regole: [{ contenitore: "Equazioni", count: 3 }], compiti: 0 },
  ]);
  vi.mocked(compitiDellaClasse).mockReset().mockResolvedValue([]);
});

async function rendi() {
  render(await Page());
}

describe("pagina di assegnazione dei compiti", () => {
  it("chiama redirectUnlessTeacher", async () => {
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
  });

  it("assegna una batteria a una classe tramite l'API", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ compitoId: "comp1" }), { status: 201 })) as typeof fetch;

    await rendi();
    fireEvent.click(screen.getByRole("button", { name: "assegna" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/esercizi/compiti",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const body = JSON.parse((vi.mocked(global.fetch).mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({ batteriaId: "b1", classeId: "c1" });
  });

  // Il caso che conta di più: la spec chiede che, quando il rifiuto è
  // `esercizi_insufficienti`, il docente veda QUALE contenitore ed ENTRAMBI
  // i numeri — non un messaggio generico che nasconde il lavoro che
  // `assegna` (dominio) e la rotta hanno già fatto per produrre il dettaglio.
  it("un rifiuto per capienza mostra il contenitore e i due numeri", async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: "esercizi_insufficienti", dettaglio: { contenitore: "Equazioni", richiesti: 5, disponibili: 3 } }),
        { status: 409 },
      ),
    ) as typeof fetch;

    await rendi();
    fireEvent.click(screen.getByRole("button", { name: "assegna" }));

    const messaggio = await screen.findByText(/erroreCapienza/);
    expect(messaggio.textContent).toContain("Equazioni");
    expect(messaggio.textContent).toContain("5");
    expect(messaggio.textContent).toContain("3");
  });

  it("un rifiuto per classe non insegnata mostra il motivo", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "non_insegni_questa_classe" }), { status: 403 }),
    ) as typeof fetch;

    await rendi();
    fireEvent.click(screen.getByRole("button", { name: "assegna" }));

    expect(await screen.findByText("erroreNonInsegni")).toBeInTheDocument();
  });

  // Fix round finale, item 4: `assegna` (dominio) rifiuta ora una scadenza
  // prima dell'apertura o già nel passato — surfaced nel form con lo stesso
  // schema del rifiuto per capienza (un ramo dedicato in `messaggioErrore`).
  it("un rifiuto per scadenza prima dell'apertura mostra il motivo", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "scadenza_prima_apertura" }), { status: 400 }),
    ) as typeof fetch;

    await rendi();
    fireEvent.click(screen.getByRole("button", { name: "assegna" }));

    expect(await screen.findByText("erroreScadenzaPrimaApertura")).toBeInTheDocument();
  });

  it("un rifiuto per scadenza già nel passato mostra il motivo", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "scadenza_nel_passato" }), { status: 400 }),
    ) as typeof fetch;

    await rendi();
    fireEvent.click(screen.getByRole("button", { name: "assegna" }));

    expect(await screen.findByText("erroreScadenzaPassata")).toBeInTheDocument();
  });

  it("elenca i compiti già assegnati alle classi del docente, linkando al dettaglio", async () => {
    vi.mocked(compitiDellaClasse).mockResolvedValue([
      { id: "comp1", batteria: "Verifica 1", dueAt: null, esercizi: 3 },
    ]);
    await rendi();
    const link = screen.getByRole("link", { name: /Verifica 1/ });
    expect(link).toHaveAttribute("href", "/dashboard/esercizi/compiti/comp1");
  });

  it("senza classi insegnate non mostra il modulo di assegnazione", async () => {
    vi.mocked(classiDelDocente).mockResolvedValue([]);
    await rendi();
    expect(screen.queryByRole("button", { name: "assegna" })).toBeNull();
    expect(screen.getByText("nessunaClasseInsegnata")).toBeInTheDocument();
  });
});
