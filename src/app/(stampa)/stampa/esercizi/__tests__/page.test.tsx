import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn(async () => ({ user: { id: "d1", role: "TEACHER" } })) }));
vi.mock("@/lib/esercizi/accesso", () => ({ utenteDaSessione: vi.fn(() => ({ id: "d1", admin: false })) }));
vi.mock("@/lib/esercizi/stampa-esercitazione", async (originale) => ({
  ...(await originale<typeof import("@/lib/esercizi/stampa-esercitazione")>()),
  datiStampaEsercitazione: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "it"),
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));
vi.mock("@/components/esercizi/stampa/verifica-stampabile-lazy", () => ({
  VerificaStampabileLazy: (props: { titolo: string; conSoluzioni: boolean; soloSoluzioni?: boolean; fogli: unknown[] }) => (
    <div
      data-testid="stampa"
      data-titolo={props.titolo}
      data-fogli={props.fogli.length}
      data-soluzioni={String(props.conSoluzioni)}
      data-sole={String(Boolean(props.soloSoluzioni))}
    />
  ),
}));

import { datiStampaEsercitazione } from "@/lib/esercizi/stampa-esercitazione";
import Page from "../page";

const dati = {
  titolo: "Numeri",
  indietro: "/dashboard/esercizi/redazione",
  esercizi: [{ titolo: "E1", content: {} }],
  foglio: { etichetta: "", nominativo: false, seme: "esercitazione:argomento:numeri:" },
};

async function apri(query: Record<string, string>) {
  render(await Page({ searchParams: Promise.resolve(query) }));
  return screen.getByTestId("stampa");
}

beforeEach(() => {
  vi.mocked(datiStampaEsercitazione).mockReset().mockResolvedValue(dati);
});

describe("pagina di stampa dell'esercitazione", () => {
  it("di base stampa gli esercizi con le soluzioni in fondo", async () => {
    const s = await apri({ argomento: "Numeri" });
    expect(datiStampaEsercitazione).toHaveBeenCalledWith({ tipo: "argomento", argomento: "Numeri", anno: null }, { id: "d1", admin: false });
    expect(s).toHaveAttribute("data-fogli", "1");
    expect(s).toHaveAttribute("data-soluzioni", "true");
    expect(s).toHaveAttribute("data-sole", "false");
    expect(screen.getByRole("combobox")).toHaveValue("fondo");
    expect(screen.getByRole("link", { name: "torna" })).toHaveAttribute("href", "/dashboard/esercizi/redazione");
  });

  it("chiede le soluzioni: niente, oppure solo loro", async () => {
    expect(await apri({ argomento: "Numeri", soluzioni: "no" })).toHaveAttribute("data-soluzioni", "false");
    document.body.innerHTML = "";
    const sole = await apri({ argomento: "Numeri", soluzioni: "sole" });
    expect(sole).toHaveAttribute("data-sole", "true");
    expect(sole).toHaveAttribute("data-soluzioni", "false");
  });

  it("con la classe la mette nel titolo e la tiene nel modulo", async () => {
    const s = await apri({ argomento: "Numeri", anno: "2" });
    expect(s).toHaveAttribute("data-titolo", 'titoloConClasse:{"titolo":"Numeri","anno":2}');
    expect(document.querySelector('input[name="anno"]')).toHaveValue("2");
    expect(document.querySelector('input[name="argomento"]')).toHaveValue("Numeri");
  });

  it("una raccolta tiene il suo id nel modulo", async () => {
    vi.mocked(datiStampaEsercitazione).mockResolvedValue({ ...dati, titolo: "Ripasso", indietro: "/dashboard/esercizi/contenitori/r1" });
    await apri({ raccolta: "r1" });
    expect(document.querySelector('input[name="raccolta"]')).toHaveValue("r1");
    expect(screen.getByRole("link", { name: "torna" })).toHaveAttribute("href", "/dashboard/esercizi/contenitori/r1");
  });

  it("senza esercizi lo dice", async () => {
    vi.mocked(datiStampaEsercitazione).mockResolvedValue({ ...dati, esercizi: [] });
    render(await Page({ searchParams: Promise.resolve({ argomento: "Vuoto" }) }));
    expect(screen.getByText("nessunEsercizio")).toBeInTheDocument();
    expect(screen.queryByTestId("stampa")).not.toBeInTheDocument();
  });

  it("non trovato senza fonte o per una raccolta che non vede", async () => {
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    vi.mocked(datiStampaEsercitazione).mockResolvedValue(null);
    await expect(Page({ searchParams: Promise.resolve({ raccolta: "r9" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
