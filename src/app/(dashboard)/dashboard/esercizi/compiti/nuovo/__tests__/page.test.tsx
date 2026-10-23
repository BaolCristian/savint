import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/classi", () => ({ classiDelDocente: vi.fn() }));
vi.mock("@/lib/esercizi/batterie", () => ({ argomentiDisponibili: vi.fn(), caricaModello: vi.fn() }));
vi.mock("@/lib/esercizi/contenitori", () => ({ elencoContenitori: vi.fn() }));
vi.mock("@/lib/esercizi/estrazione", () => ({ eserciziAssegnabili: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/esercizi/compiti/nuovo",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string) => chiave),
  getLocale: vi.fn(async () => "it"),
}));
vi.mock("@/components/esercizi/player/player-esercizio-lazy", () => ({ PlayerEsercizioLazy: () => null }));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { classiDelDocente } from "@/lib/esercizi/classi";
import { argomentiDisponibili, caricaModello } from "@/lib/esercizi/batterie";
import { elencoContenitori } from "@/lib/esercizi/contenitori";
import { eserciziAssegnabili } from "@/lib/esercizi/estrazione";
import Page from "../page";

const classe = (id: string, name: string, yearLevel: number | null) => ({ id, name, yearLevel, studenti: 20, codice: null });

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(classiDelDocente).mockReset().mockResolvedValue([classe("c1", "2ª B", 2), classe("c2", "3ª A", 3)]);
  vi.mocked(argomentiDisponibili).mockReset().mockImplementation(async (_chi, anno) =>
    anno === 2 ? [{ argomento: "Equazioni", quanti: 12 }] : [{ argomento: "Geometria", quanti: 3 }],
  );
  vi.mocked(caricaModello).mockReset().mockResolvedValue(null);
  vi.mocked(elencoContenitori).mockReset().mockResolvedValue([
    { id: "r1", name: "Percentuali 2ª", description: null, esercizi: 6, ruolo: "PROPRIETARIO" },
  ]);
  vi.mocked(eserciziAssegnabili).mockReset().mockResolvedValue([
    { id: "e1", titolo: "Lo sconto", argomento: "Percentuali", anno: 2 },
  ]);
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ blocchi: [], duplicatiTolti: 0, totale: 0, sufficiente: false, esercizi: [] }))) as typeof fetch;
});

async function rendi(parametri: Record<string, string> = {}) {
  const pagina = await Page({ searchParams: Promise.resolve(parametri) });
  render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      {pagina}
    </NextIntlClientProvider>,
  );
}

const classeScelta = () => (screen.getByLabelText("Classe") as HTMLSelectElement).value;

describe("pagina Nuovo compito", () => {
  it("chiama redirectUnlessTeacher e mostra le tre zone", async () => {
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
    expect(screen.getByText("1 · Per chi")).toBeInTheDocument();
    expect(screen.getByText("2 · Cosa — da dove prendere gli esercizi")).toBeInTheDocument();
    expect(screen.getByText("3 · Riepilogo")).toBeInTheDocument();
  });

  it("?raccolta= crea un blocco raccolta, prendi 5 a caso", async () => {
    await rendi({ raccolta: "r1" });
    expect(screen.getByRole("button", { name: "Togli il blocco Percentuali 2ª" })).toBeInTheDocument();
    expect(screen.getByLabelText("Quanti esercizi prendere da Percentuali 2ª")).toHaveValue(5);
  });

  it("?raccolta= di una raccolta che non si vede non crea niente", async () => {
    await rendi({ raccolta: "altrui" });
    expect(screen.getByText(/Aggiungi almeno un blocco/)).toBeInTheDocument();
  });

  it("?argomento= crea un blocco argomento senza anno (lo mette la classe)", async () => {
    await rendi({ argomento: "Equazioni", classe: "c1" });
    expect(screen.getByRole("button", { name: "Togli il blocco Equazioni" })).toBeInTheDocument();
    expect(screen.getByText("(12 disponibili)")).toBeInTheDocument();
  });

  it("?esercizio= crea un blocco di scelti a mano", async () => {
    await rendi({ esercizio: "e1" });
    expect(screen.getByText("Lo sconto")).toBeInTheDocument();
    expect(screen.getByText("quello")).toBeInTheDocument();
  });

  it("?modello= carica i blocchi del modello e lo dice", async () => {
    vi.mocked(caricaModello).mockResolvedValue({
      id: "m1",
      nome: "Verifica",
      blocchi: [{ tipo: "argomento", argomento: "Equazioni", quanti: 3 }, { tipo: "raccolta", contenitoreId: "r1", quanti: 2 }],
    });
    await rendi({ modello: "m1" });
    expect(caricaModello).toHaveBeenCalledWith("m1");
    expect(screen.getByText(/Dal modello «Verifica»/)).toBeInTheDocument();
    expect(screen.getByLabelText("Quanti esercizi prendere da Equazioni")).toHaveValue(3);
    expect(screen.getByLabelText("Quanti esercizi prendere da Percentuali 2ª")).toHaveValue(2);
  });

  it("?classe= sceglie la classe; senza, con più classi, nessuna è scelta", async () => {
    await rendi({ classe: "c2" });
    expect(classeScelta()).toBe("c2");
  });

  it("senza ?classe= e con più classi nessuna è scelta", async () => {
    await rendi();
    expect(classeScelta()).toBe("");
  });

  it("con una sola classe è già scelta", async () => {
    vi.mocked(classiDelDocente).mockResolvedValue([classe("c1", "2ª B", 2)]);
    await rendi();
    expect(classeScelta()).toBe("c1");
  });

  it("gli argomenti si chiedono per ogni anno delle classi, come docente", async () => {
    vi.mocked(redirectUnlessTeacher).mockResolvedValue({ user: { id: "adm1", role: "ADMIN" } } as never);
    await rendi();
    expect(argomentiDisponibili).toHaveBeenCalledWith({ id: "adm1", admin: false }, 2);
    expect(argomentiDisponibili).toHaveBeenCalledWith({ id: "adm1", admin: false }, 3);
    expect(elencoContenitori).toHaveBeenCalledWith({ id: "adm1", admin: false });
    expect(eserciziAssegnabili).toHaveBeenCalledWith({ id: "adm1", admin: false });
  });
});
