import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/redazione", () => ({ caricaPerEditor: vi.fn() }));
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));
vi.mock("@/components/esercizi/editor/editor-esercizio", () => ({
  EditorEsercizio: (props: { esercizioId?: string; valoreIniziale?: unknown }) => (
    <div data-testid="editor-stub" data-esercizio-id={props.esercizioId ?? ""} data-ha-valore-iniziale={String(props.valoreIniziale !== undefined)} />
  ),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { caricaPerEditor } from "@/lib/esercizi/redazione";
import { notFound } from "next/navigation";
import Page from "../page";

const EDITOR_VALIDO = {
  meta: { titolo: "Equazione", descrizione: "", anno: 1, argomento: "equazioni", tag: [], difficolta: 1 },
  testo: "Risolvi",
  suggerimento: "",
  variabili: [],
  condizione: "",
  parti: [{ tipo: "numerica", consegna: "x=", punti: 1, valore: "-1", tolleranza: { tipo: "esatta" } }],
};

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(caricaPerEditor).mockReset();
  push.mockReset();
});

async function rendi(id = "e1") {
  render(await Page({ params: Promise.resolve({ id }) }));
}

describe("pagina di modifica di un esercizio esistente", () => {
  it("chiama redirectUnlessTeacher", async () => {
    vi.mocked(caricaPerEditor).mockResolvedValue({
      ok: true, editor: EDITOR_VALIDO as never, versione: 1, autoreNome: "Mario Rossi", aggiornatoIl: new Date(),
    });
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
  });

  it("un esercizio modificabile monta l'editor con il suo valore iniziale", async () => {
    vi.mocked(caricaPerEditor).mockResolvedValue({
      ok: true, editor: EDITOR_VALIDO as never, versione: 1, autoreNome: "Mario Rossi", aggiornatoIl: new Date(),
    });
    await rendi("e1");
    const stub = screen.getByTestId("editor-stub");
    expect(stub).toHaveAttribute("data-esercizio-id", "e1");
    expect(stub).toHaveAttribute("data-ha-valore-iniziale", "true");
  });

  it("un id inesistente dà 404", async () => {
    vi.mocked(caricaPerEditor).mockResolvedValue({ ok: false, motivo: "non_trovato", dettaglio: "boh" });
    await expect(Page({ params: Promise.resolve({ id: "boh" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  // Item I4 dell'onda di correzioni: "duplica" è sparito anche da qui, ed è
  // corretto che resti così — il duplicato di un esercizio non
  // rappresentabile eredita esattamente lo stesso verdetto (contenuto
  // grezzo identico, vedi `duplicaEsercizio` in redazione.ts), quindi
  // offrirlo lascerebbe solo un'altra copia di sola lettura.
  //
  // `esito.dettaglio` è il messaggio del dominio (`daNumbas`,
  // SUGGERIMENTO_REPOSITORIO): chiude già da sé con "il repository dei
  // contenuti" — questa pagina non lo ripete più in un secondo paragrafo
  // (era la stessa frase due volte, corretto insieme a quest'onda).
  it("un esercizio non rappresentabile mostra il motivo del dominio invece dell'editor, una sola volta, e non offre duplica", async () => {
    vi.mocked(caricaPerEditor).mockResolvedValue({
      ok: false,
      motivo: "non_rappresentabile",
      dettaglio: "Contiene un tipo di parte che l'editor non sa ricostruire. Può essere modificato solo intervenendo direttamente nel repository dei contenuti.",
    });
    await rendi("e2");

    expect(screen.queryByTestId("editor-stub")).toBeNull();
    expect(screen.getByText(/non sa ricostruire/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "duplica" })).toBeNull();
    // La frase "repository dei contenuti" compare una sola volta: prima
    // c'era anche in un secondo paragrafo statico (`soloRepository`), ora
    // rimosso — mai due nodi che la contengono.
    expect(screen.getAllByText(/repository dei contenuti/)).toHaveLength(1);
  });
});
