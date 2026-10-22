import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import messaggiIt from "@/messages/it.json";

import { CommentiEsercizio, type CommentoVista, type TestiCommenti } from "../commenti-esercizio";

// I testi veri (it.json), col segnaposto `{n}` di "Risolti ({n})" intatto:
// la sezione li riceve già tradotti dalla pagina.
const T = messaggiIt.esercizi.commenti as unknown as TestiCommenti;

const APERTO: CommentoVista = {
  id: "c1", autoreNome: "Mario Rossi", testo: "Mi sembra ci sia un errore nella parte b",
  createdAt: "2026-10-20T10:00:00.000Z", risolto: false, mio: false,
  risposte: [{ id: "r1", autoreNome: "Io Docente", testo: "Controllo subito", createdAt: "2026-10-20T11:00:00.000Z", mio: true }],
};
const RISOLTO: CommentoVista = {
  id: "c2", autoreNome: "Anna Bianchi", testo: "Il testo non è troppo chiaro",
  createdAt: "2026-10-19T10:00:00.000Z", risolto: true, mio: false, risposte: [],
};

const TUTTI = { commentare: true, risolvere: true, eliminaTutti: true };

function finto(commenti: CommentoVista[] = [APERTO, RISOLTO], status = 200) {
  const f = vi.fn(async (_url: string, opzioni?: RequestInit) => {
    const metodo = opzioni?.method ?? "GET";
    if (metodo === "GET") return new Response(JSON.stringify({ commenti }));
    return new Response(JSON.stringify(status < 300 ? { ok: true } : { error: "testo_non_valido" }), { status });
  });
  global.fetch = f as never;
  return f;
}

function rendi(permessi = TUTTI, commenti = [APERTO, RISOLTO]) {
  render(<CommentiEsercizio esercizioId="e1" iniziali={commenti} permessi={permessi} testi={T} locale="it" />);
}

beforeEach(() => {
  finto();
});

describe("CommentiEsercizio", () => {
  it("mostra gli aperti con le risposte; i risolti in un gruppo richiudibile", async () => {
    rendi();
    expect(screen.getByText("Mi sembra ci sia un errore nella parte b")).toBeInTheDocument();
    expect(screen.getByText("Controllo subito")).toBeInTheDocument();
    const gruppo = screen.getByText("Risolti (1)");
    // Chiuso: il commento risolto non si vede finché non lo si apre.
    expect(screen.getByText("Il testo non è troppo chiaro")).not.toBeVisible();
    await userEvent.click(gruppo);
    expect(screen.getByText("Il testo non è troppo chiaro")).toBeVisible();
  });

  it("senza il permesso di commentare il campo non c'è, né Rispondi, né Segna come risolto", () => {
    rendi({ commentare: false, risolvere: false, eliminaTutti: false });
    expect(screen.queryByLabelText(T.scrivi)).toBeNull();
    expect(screen.queryByRole("button", { name: T.rispondi })).toBeNull();
    expect(screen.queryByRole("button", { name: T.segnaRisolto })).toBeNull();
    // "Elimina" resta solo sulla propria risposta.
    expect(screen.getAllByRole("button", { name: T.elimina })).toHaveLength(1);
  });

  it("il COMMENTATORE scrive e risponde ma non risolve", async () => {
    const f = finto();
    rendi({ commentare: true, risolvere: false, eliminaTutti: false });
    expect(screen.queryByRole("button", { name: T.segnaRisolto })).toBeNull();
    await userEvent.type(screen.getByLabelText(T.scrivi), "  Nuova nota  ");
    await userEvent.click(screen.getByRole("button", { name: T.invia }));
    await waitFor(() => expect(f.mock.calls.some(([, o]) => (o as RequestInit | undefined)?.method === "POST")).toBe(true));
    const [url, opzioni] = f.mock.calls.find(([, o]) => (o as RequestInit | undefined)?.method === "POST")!;
    expect(url).toContain("/api/esercizi/redazione/e1/commenti");
    expect(JSON.parse((opzioni as RequestInit).body as string)).toEqual({ testo: "Nuova nota" });

    await userEvent.click(screen.getAllByRole("button", { name: T.rispondi })[0]);
    await userEvent.type(screen.getByLabelText(T.scriviRisposta), "Una risposta");
    await userEvent.click(screen.getByRole("button", { name: T.inviaRisposta }));
    await waitFor(() => {
      const post = f.mock.calls.filter(([, o]) => (o as RequestInit | undefined)?.method === "POST");
      expect(JSON.parse((post[1][1] as RequestInit).body as string)).toEqual({ testo: "Una risposta", parentId: "c1" });
    });
  });

  it("Segna come risolto manda il PATCH", async () => {
    const f = finto();
    rendi();
    await userEvent.click(screen.getByRole("button", { name: T.segnaRisolto }));
    await waitFor(() => {
      const patch = f.mock.calls.find(([, o]) => (o as RequestInit | undefined)?.method === "PATCH");
      expect(patch?.[0]).toContain("/api/esercizi/commenti/c1");
      expect(JSON.parse((patch![1] as RequestInit).body as string)).toEqual({ risolto: true });
    });
  });

  it("eliminare un commento con risposte chiede conferma e lo dice", async () => {
    const f = finto();
    rendi();
    const articolo = screen.getByText("Mi sembra ci sia un errore nella parte b").closest("article")!;
    await userEvent.click(within(articolo).getAllByRole("button", { name: T.elimina })[0]);
    expect(screen.getByText(T.confermaElimina)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: T.eliminaConRisposte }));
    await waitFor(() => {
      const del = f.mock.calls.find(([, o]) => (o as RequestInit | undefined)?.method === "DELETE");
      expect(del?.[0]).toContain("/api/esercizi/commenti/c1");
    });
  });

  it("un rifiuto del server si mostra come errore", async () => {
    finto([APERTO], 422);
    rendi();
    await userEvent.type(screen.getByLabelText(T.scrivi), "x");
    await userEvent.click(screen.getByRole("button", { name: T.invia }));
    expect(await screen.findByText(T.erroreTesto)).toBeInTheDocument();
  });

  it("richiudibile (nell'editor) parte chiuso e si apre dal titolo", async () => {
    render(<CommentiEsercizio esercizioId="e1" iniziali={[APERTO]} permessi={TUTTI} testi={T} locale="it" richiudibile />);
    const titolo = screen.getByRole("button", { name: /Commenti/ });
    expect(titolo).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(titolo);
    expect(titolo).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText(T.scrivi)).toBeVisible();
  });

  it("senza commenti lo dice", () => {
    rendi(TUTTI, []);
    expect(screen.getByText(T.nessuno)).toBeInTheDocument();
  });
});
