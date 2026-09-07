import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

// `EditorEsercizio` è già collaudato per conto suo (Task 7): qui si prova
// solo il filo che questa pagina aggiunge, cioè che è montato senza un
// esercizio di partenza e che un salvataggio riuscito porta alla pagina di
// modifica del nuovo esercizio.
vi.mock("@/components/esercizi/editor/editor-esercizio", () => ({
  EditorEsercizio: (props: { esercizioId?: string; valoreIniziale?: unknown; onSalvato?: (e: { esercizioId: string; versione: number }) => void }) => (
    <div data-testid="editor-stub" data-esercizio-id={props.esercizioId ?? ""} data-ha-valore-iniziale={String(props.valoreIniziale !== undefined)}>
      <button onClick={() => props.onSalvato?.({ esercizioId: "nuovo1", versione: 1 })}>salva-stub</button>
    </div>
  ),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import Page from "../page";

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  push.mockReset();
});

async function rendi() {
  render(await Page());
}

describe("pagina «nuovo esercizio»", () => {
  it("chiama redirectUnlessTeacher", async () => {
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
  });

  it("monta l'editor senza esercizioId né valore iniziale", async () => {
    await rendi();
    const stub = screen.getByTestId("editor-stub");
    expect(stub).toHaveAttribute("data-esercizio-id", "");
    expect(stub).toHaveAttribute("data-ha-valore-iniziale", "false");
  });

  it("un salvataggio riuscito naviga sulla pagina di modifica del nuovo esercizio", async () => {
    await rendi();
    await userEvent.click(screen.getByText("salva-stub"));
    expect(push).toHaveBeenCalledWith("/dashboard/esercizi/redazione/nuovo1");
  });
});
