import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/redazione", () => ({
  elencoRedazione: vi.fn(),
}));
// Il pulsante "duplica" (ricomparso sulle righe modificabili, vedi sotto) è
// un client component che chiama `useRouter()`: senza questo mock la
// prova andrebbe in errore appena l'elenco include una riga modificabile,
// non solo nella prova che clicca il pulsante (stesso schema di
// `nuovo/__tests__/page.test.tsx`).
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { elencoRedazione } from "@/lib/esercizi/redazione";
import Page from "../page";

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(elencoRedazione).mockReset();
  push.mockReset();
});

async function rendi() {
  render(await Page());
}

// Task 8: l'elenco della redazione. Deve distinguere a vista modificabile
// da sola lettura, dire il perché per i secondi, e mostrare autore + data
// dell'ultima versione — perché qualunque docente può modificare qualunque
// esercizio, e quel rischio va reso visibile. Offre "duplica" SOLO sulle
// righe modificabili (vedi sotto): l'item I4 dell'onda di correzioni lo
// aveva tolto da entrambe le direzioni, una correzione eccessiva rispetto a
// quanto richiesto — restringerlo alle righe modificabili, non toglierlo.
describe("elenco della redazione", () => {
  it("chiama redirectUnlessTeacher", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([]);
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
  });

  it("dichiara che qualunque docente può modificare qualunque esercizio", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([]);
    await rendi();
    expect(screen.getByText("chiunquePuoModificare")).toBeInTheDocument();
  });

  // Le due direzioni della correzione, nello stesso test: I4 aveva tolto
  // "duplica" da ENTRAMBE — dalle righe di sola lettura (corretto, vedi il
  // test sotto: duplicare non cambia il verdetto di `daNumbas`) e da quelle
  // già modificabili (una correzione eccessiva: qui è il percorso più
  // battuto per partire da un esercizio che già funziona, non va perso).
  it("un esercizio modificabile mostra un link diretto all'editor, autore, data e il pulsante duplica", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([
      {
        id: "e1",
        titolo: "Equazione di primo grado",
        argomento: "equazioni",
        anno: 1,
        ultimaVersione: 3,
        modificabile: true,
        motivo: null,
        autoreNome: "Mario Rossi",
        aggiornatoIl: new Date("2026-01-15T10:30:00Z"),
      },
    ]);
    await rendi();

    expect(screen.getByText("Equazione di primo grado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "apri" })).toHaveAttribute("href", "/dashboard/esercizi/redazione/e1");
    expect(screen.getByText(/Mario Rossi/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "duplica" })).toBeInTheDocument();
  });

  // Il motivo del dominio (`daNumbas`, SUGGERIMENTO_REPOSITORIO) chiude già
  // da sé con "il repository dei contenuti": questa pagina non lo ripete
  // più in un secondo paragrafo (era la stessa frase due volte).
  //
  // "Duplica" resta assente qui: `duplicaEsercizio` copia il contenuto
  // GREZZO dell'ultima versione (vedi redazione.ts) — per un esercizio non
  // rappresentabile il duplicato ha lo stesso identico contenuto, quindi
  // `daNumbas` lo rifiuta allo stesso identico modo, mai un duplicato
  // diventato modificabile. Offrirlo qui lascerebbe solo un'altra riga di
  // sola lettura.
  //
  // Item I5 (chiuso lato dominio): il motivo viene ora direttamente da
  // `elencoRedazione` (campo `motivo`), non più da una rilettura con
  // `caricaPerEditor` per ogni riga non modificabile — questa pagina non
  // chiama più quella funzione affatto.
  it("un esercizio non modificabile mostra solo il motivo del dominio, non un link all'editor né il pulsante duplica", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([
      {
        id: "e2",
        titolo: "Griglia complessa",
        argomento: "geometria",
        anno: 3,
        ultimaVersione: 2,
        modificabile: false,
        motivo:
          "Contiene un tipo di parte (gapfill) che l'editor non sa ricostruire. Può essere modificato solo intervenendo direttamente nel repository dei contenuti.",
        autoreNome: null,
        aggiornatoIl: new Date("2026-02-01T08:00:00Z"),
      },
    ]);

    await rendi();

    expect(screen.getByText(/non sa ricostruire/)).toBeInTheDocument();
    expect(
      screen.queryAllByRole("link").find((a) => a.getAttribute("href") === "/dashboard/esercizi/redazione/e2"),
    ).toBeUndefined();
    expect(screen.queryByRole("button", { name: "duplica" })).toBeNull();
    // La frase "repository dei contenuti" compare una sola volta: prima
    // c'era anche in un secondo paragrafo statico (`soloRepository`), ora
    // rimosso.
    expect(screen.getAllByText(/repository dei contenuti/)).toHaveLength(1);
  });

  it("un esercizio non modificabile senza un motivo dal dominio mostra il motivo generico", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([
      {
        id: "e3",
        titolo: "Esercizio senza versione",
        argomento: "geometria",
        anno: 3,
        ultimaVersione: 0,
        modificabile: false,
        motivo: null,
        autoreNome: null,
        aggiornatoIl: new Date("2026-02-01T08:00:00Z"),
      },
    ]);

    await rendi();

    expect(screen.getByText("motivoGenerico")).toBeInTheDocument();
  });

  it("senza esercizi mostra il messaggio vuoto", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([]);
    await rendi();
    expect(screen.getByText("nessunEsercizio")).toBeInTheDocument();
  });
});
