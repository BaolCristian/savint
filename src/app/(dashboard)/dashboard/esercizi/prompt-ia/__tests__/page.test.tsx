import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/esercizi/prompt-ia" }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string) => chiave),
}));
// Il modulo vero ha la sua prova (components/esercizi/__tests__): qui basta
// sapere che la pagina lo monta.
vi.mock("@/components/esercizi/prompt-esercizi", () => ({
  PromptEsercizi: () => <div data-testid="modulo-prompt-esercizi" />,
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import Page from "../page";

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
});

describe("pagina Crea esercizi con l'IA", () => {
  it("è riservata ai docenti", async () => {
    render(await Page());
    expect(redirectUnlessTeacher).toHaveBeenCalled();
  });

  it("ha il suo titolo h1 e monta il modulo del prompt", async () => {
    render(await Page());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("titoloPagina");
    expect(screen.getByTestId("modulo-prompt-esercizi")).toBeInTheDocument();
  });
});
