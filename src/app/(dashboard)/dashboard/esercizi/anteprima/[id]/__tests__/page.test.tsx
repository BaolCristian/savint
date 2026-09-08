import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/redazione", () => ({ caricaPerAnteprima: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
  getLocale: vi.fn(async () => "it"),
}));
// Come in redazione/[id]/__tests__/page.test.tsx: il player vero (e tutto
// ciò che gli sta intorno, `@savint/engine` incluso) non serve per provare
// COSA fa questa pagina — se prendere l'esercizio, se dire 404, se dire
// chiaramente che non c'è nessuna versione — solo che passa i dati giusti
// al componente che lo monta davvero (già provato per conto suo in
// anteprima-docente-client.test.tsx).
vi.mock("../anteprima-docente-client", () => ({
  AnteprimaDocenteClient: (props: { esercizioId?: string; content?: unknown; locale?: string }) => (
    <div
      data-testid="anteprima-client"
      data-esercizio-id={props.esercizioId ?? ""}
      data-locale={props.locale ?? ""}
      data-ha-contenuto={String(props.content !== undefined)}
    />
  ),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { caricaPerAnteprima } from "@/lib/esercizi/redazione";
import { notFound } from "next/navigation";
import Page from "../page";

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(caricaPerAnteprima).mockReset();
});

async function rendi(id = "e1") {
  render(await Page({ params: Promise.resolve({ id }) }));
}

describe("pagina di anteprima del docente su un esercizio", () => {
  it("chiama redirectUnlessTeacher", async () => {
    vi.mocked(caricaPerAnteprima).mockResolvedValue({ ok: true, titolo: "Prova", versione: 1, content: { a: 1 } });
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
  });

  // Il cuore del gap che questo task chiude: un esercizio che l'editor
  // rifiuta deve comunque montare il player qui, col suo contenuto grezzo.
  it("un esercizio con una versione salvata monta il player col suo contenuto, anche se l'editor lo rifiuterebbe", async () => {
    vi.mocked(caricaPerAnteprima).mockResolvedValue({
      ok: true, titolo: "Griglia complessa", versione: 3, content: { a: 1 },
    });
    await rendi("e1");
    const stub = screen.getByTestId("anteprima-client");
    expect(stub).toHaveAttribute("data-esercizio-id", "e1");
    expect(stub).toHaveAttribute("data-ha-contenuto", "true");
    expect(screen.getByText("Griglia complessa")).toBeInTheDocument();
  });

  it("un id inesistente dà 404", async () => {
    vi.mocked(caricaPerAnteprima).mockResolvedValue({ ok: false, motivo: "non_trovato" });
    await expect(Page({ params: Promise.resolve({ id: "boh" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  // Il seminato contiene righe senza nessuna versione: la specifica chiede
  // di dirlo chiaramente, mai un player montato su un contenuto vuoto.
  it("un esercizio senza nessuna versione dice chiaramente che non c'è niente da mostrare, senza montare il player", async () => {
    vi.mocked(caricaPerAnteprima).mockResolvedValue({ ok: false, motivo: "senza_versione" });
    await rendi("e2");
    expect(screen.queryByTestId("anteprima-client")).toBeNull();
    expect(screen.getByText("senzaVersioneTesto")).toBeInTheDocument();
  });
});
