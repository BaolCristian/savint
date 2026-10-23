import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/classi", () => ({ classiDelDocente: vi.fn() }));
vi.mock("@/lib/esercizi/compiti", () => ({ compitiDellaClasse: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/esercizi/compiti", useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { classiDelDocente } from "@/lib/esercizi/classi";
import { compitiDellaClasse } from "@/lib/esercizi/compiti";
import Page from "../page";

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(classiDelDocente).mockReset().mockResolvedValue([
    { id: "c1", name: "1A", yearLevel: 1, studenti: 20, codice: null },
  ]);
  vi.mocked(compitiDellaClasse).mockReset().mockResolvedValue([]);
});

async function rendi() {
  return render(await Page());
}

describe("pagina dei compiti assegnati", () => {
  it("chiama redirectUnlessTeacher", async () => {
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
  });

  // Nuovo compito, Task 7: in alto "Nuovo compito", e sparisce il
  // <details> "Assegna un compito preparato" col suo modulo (CompitoForm).
  it("in alto c'è \"Nuovo compito\", che porta alla pagina Nuovo compito", async () => {
    await rendi();
    expect(screen.getByRole("link", { name: "nuovo" })).toHaveAttribute("href", "/dashboard/esercizi/compiti/nuovo");
  });

  it("non c'è più il modulo per assegnare un compito preparato", async () => {
    const { container } = await rendi();
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
    expect(screen.queryByRole("button", { name: "assegna" })).toBeNull();
    expect(screen.queryByText("daRaccolta")).toBeNull();
    expect(screen.queryByRole("link", { name: "preparation.title" })).toBeNull();
  });

  it("la barra della sezione ha la scheda Modelli", async () => {
    await rendi();
    expect(screen.getByRole("link", { name: "nav.models" })).toHaveAttribute("href", "/dashboard/esercizi/modelli");
  });

  it("elenca i compiti già assegnati alle classi del docente, linkando al dettaglio", async () => {
    vi.mocked(compitiDellaClasse).mockResolvedValue([
      { id: "comp1", tipo: "COMPITO", batteria: "Verifica 1", dueAt: null, esercizi: 3 },
    ]);
    await rendi();
    const link = screen.getByRole("link", { name: /Verifica 1/ });
    expect(link).toHaveAttribute("href", "/dashboard/esercizi/compiti/comp1");
  });

  it("una verifica compare con l'etichetta «Verifica» e porta alla sua pagina", async () => {
    vi.mocked(compitiDellaClasse).mockResolvedValue([
      { id: "ver1", tipo: "VERIFICA", batteria: "Equazioni (5)", dueAt: null, esercizi: 5 },
      { id: "comp1", tipo: "COMPITO", batteria: "Percentuali (3)", dueAt: null, esercizi: 3 },
    ]);
    await rendi();
    expect(screen.getAllByText("etichettaVerifica")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Equazioni/ })).toHaveAttribute("href", "/dashboard/esercizi/verifiche/ver1");
    expect(screen.getByRole("link", { name: /Percentuali/ })).toHaveAttribute("href", "/dashboard/esercizi/compiti/comp1");
  });

  it("senza classi insegnate lo dice, e \"Nuovo compito\" resta", async () => {
    vi.mocked(classiDelDocente).mockResolvedValue([]);
    await rendi();
    expect(screen.getByText("nessunaClasseInsegnata")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "nuovo" })).toBeInTheDocument();
  });
});
