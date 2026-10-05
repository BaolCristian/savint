import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/config", () => ({ auth: vi.fn(async () => ({ user: { id: "s1", role: "STUDENT" } })) }));
vi.mock("@/lib/esercizi/percorso-compito", () => ({ percorsoCompitoStudente: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }), notFound: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));

import { percorsoCompitoStudente } from "@/lib/esercizi/percorso-compito";
import Page from "../[compitoId]/page";

describe("resolver del percorso compito", () => {
  it("reindirizza al primo esercizio non completato senza creare un nuovo tentativo", async () => {
    vi.mocked(percorsoCompitoStudente).mockResolvedValue({
      titolo: "Algebra",
      totale: 3,
      esercizi: [],
      prossimo: { esercizioId: "e2", titolo: "Secondo", indice: 2, completato: false },
    });

    await expect(Page({ params: Promise.resolve({ compitoId: "c1" }) })).rejects.toThrow(
      "REDIRECT:/studente/esercizio/e2?compitoId=c1&percorso=1",
    );
  });

  it("mostra il riepilogo solo dopo tutti gli esercizi congelati", async () => {
    vi.mocked(percorsoCompitoStudente).mockResolvedValue({ titolo: "Algebra", totale: 2, esercizi: [], prossimo: null });

    const albero = await Page({ params: Promise.resolve({ compitoId: "c1" }) });

    render(albero);
    expect(screen.getByRole("heading", { name: "assignmentCompleted", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "backToExercises" })).toHaveAttribute("href", "/studente");
  });
});
