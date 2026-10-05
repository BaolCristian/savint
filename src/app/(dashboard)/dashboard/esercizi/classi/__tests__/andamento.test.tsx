import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/statistiche", () => ({ andamentoDellaClasse: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/esercizi/classi/c1/andamento",
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
// Il traduttore restituisce chiave e valori: le asserzioni parlano di quale
// messaggio è stato scelto, non del testo italiano di quel messaggio.
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { andamentoDellaClasse } from "@/lib/esercizi/statistiche";
import { notFound } from "next/navigation";
import Page from "../[id]/andamento/page";

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(andamentoDellaClasse).mockReset();
  vi.mocked(notFound).mockClear();
});

async function rendi(id = "c1") {
  render(await Page({ params: Promise.resolve({ id }) }));
}

describe("pagina dell'andamento di una classe per argomento", () => {
  it("chiama redirectUnlessTeacher e chiede l'andamento per il docente della sessione", async () => {
    vi.mocked(andamentoDellaClasse).mockResolvedValue({
      ok: true, classe: { id: "c1", nome: "2B" }, iscritti: 0, compiti: 0, righe: [],
    });
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
    expect(andamentoDellaClasse).toHaveBeenCalledWith("c1", "doc1");
  });

  // 404, non 403: un 403 confermerebbe a chi sonda id altrui che quella
  // classe esiste (convenzione del progetto).
  it("404 se il docente non insegna la classe o la classe non esiste", async () => {
    vi.mocked(andamentoDellaClasse).mockResolvedValue({ ok: false, motivo: "non_trovata" });
    await expect(Page({ params: Promise.resolve({ id: "c1" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("mostra una riga per argomento, nell'ordine del dominio (dal più debole)", async () => {
    vi.mocked(andamentoDellaClasse).mockResolvedValue({
      ok: true,
      classe: { id: "c1", nome: "2B" },
      iscritti: 3,
      compiti: 2,
      righe: [
        { argomento: "equazioni", esercizi: 1, completate: 1, attese: 3, percentualeCompletamento: 33, mediaPercentuale: 20 },
        { argomento: "frazioni", esercizi: 2, completate: 3, attese: 6, percentualeCompletamento: 50, mediaPercentuale: 70 },
      ],
    });
    await rendi();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent('statistiche.andamentoTitolo:{"classe":"2B"}');
    const righe = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(righe).toHaveLength(2);
    expect(within(righe[0]!).getByText("equazioni")).toBeInTheDocument();
    expect(within(righe[0]!).getByText("1")).toBeInTheDocument();
    expect(within(righe[0]!).getByText('statistiche.completamentoValore:{"percentuale":33,"completate":1,"attese":3}')).toBeInTheDocument();
    expect(within(righe[0]!).getByText('statistiche.percentuale:{"valore":20}')).toBeInTheDocument();
    // Sotto la metà: detto a parole, non solo con un colore.
    expect(within(righe[0]!).getByText("statistiche.sottoMeta")).toBeInTheDocument();
    expect(within(righe[1]!).getByText("frazioni")).toBeInTheDocument();
    expect(within(righe[1]!).queryByText("statistiche.sottoMeta")).toBeNull();
  });

  it("senza media né iscritti mostra un trattino, non uno 0%", async () => {
    vi.mocked(andamentoDellaClasse).mockResolvedValue({
      ok: true,
      classe: { id: "c1", nome: "2B" },
      iscritti: 0,
      compiti: 1,
      righe: [{ argomento: "frazioni", esercizi: 1, completate: 0, attese: 0, percentualeCompletamento: null, mediaPercentuale: null }],
    });
    await rendi();
    const riga = within(screen.getByRole("table")).getAllByRole("row")[1]!;
    expect(within(riga).getAllByText("statistiche.nessunaMedia")).toHaveLength(2);
    expect(within(riga).queryByText(/0%/)).toBeNull();
  });

  it("senza compiti mostra il messaggio vuoto, senza tabella", async () => {
    vi.mocked(andamentoDellaClasse).mockResolvedValue({
      ok: true, classe: { id: "c1", nome: "2B" }, iscritti: 3, compiti: 0, righe: [],
    });
    await rendi();
    expect(screen.getByText("statistiche.nessunCompito")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("riporta alla pagina delle classi", async () => {
    vi.mocked(andamentoDellaClasse).mockResolvedValue({
      ok: true, classe: { id: "c1", nome: "2B" }, iscritti: 0, compiti: 0, righe: [],
    });
    await rendi();
    expect(screen.getByRole("link", { name: "statistiche.tornaClassi" })).toHaveAttribute("href", "/dashboard/esercizi/classi");
  });
});
