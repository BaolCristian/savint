import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => (key: string) => key),
}));

import { CatalogoEsercizi } from "../catalogo-esercizi";

describe("CatalogoEsercizi", () => {
  it("restringe il catalogo per ricerca e offre di azzerare una ricerca senza risultati", () => {
    render(
      <CatalogoEsercizi
        esercizi={[
          { id: "e1", title: "Equazioni", yearLevel: 1, topic: "Algebra", difficulty: 2, status: "notStarted" },
          { id: "e2", title: "Sistemi", yearLevel: 2, topic: "Algebra", difficulty: 3, status: "inProgress" },
        ]}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "geometria" } });
    expect(screen.getByText("catalogNoMatches")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "catalogReset" }));
    expect(screen.getByText("Equazioni")).toBeInTheDocument();
    expect(screen.getByText("Sistemi")).toBeInTheDocument();
  });
});
