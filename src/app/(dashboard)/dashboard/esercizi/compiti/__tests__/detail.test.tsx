import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/compiti", () => ({ consegneDelCompito: vi.fn() }));
vi.mock("@/lib/esercizi/statistiche", () => ({ statisticheDelCompito: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { compito: { findUnique: vi.fn() } } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/esercizi/compiti/comp1",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

// Il modulo per date e ritiro (client component) traduce da sé: stesso
// schema chiave:valori del mock server-side qui sopra.
vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => (chiave: string) => chiave),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { consegneDelCompito } from "@/lib/esercizi/compiti";
import { statisticheDelCompito } from "@/lib/esercizi/statistiche";
import { prisma } from "@/lib/db/client";
import { notFound } from "next/navigation";
import Page from "../[id]/page";

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(consegneDelCompito).mockReset();
  vi.mocked(prisma.compito.findUnique).mockReset();
  vi.mocked(statisticheDelCompito).mockReset().mockResolvedValue({ ok: true, iscritti: 0, righe: [] });
});

async function rendi(id = "comp1") {
  render(await Page({ params: Promise.resolve({ id }) }));
}

describe("pagina di dettaglio di un compito (consegne)", () => {
  it("chiama redirectUnlessTeacher", async () => {
    vi.mocked(prisma.compito.findUnique).mockResolvedValue({
      id: "comp1", classe: { name: "1A" }, batteria: { name: "Verifica 1" }, dueAt: null,
    } as never);
    vi.mocked(consegneDelCompito).mockResolvedValue({ ok: true, righe: [] });
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
  });

  it("passa il docente della sessione (chi guarda), non un id arbitrario", async () => {
    vi.mocked(prisma.compito.findUnique).mockResolvedValue({
      id: "comp1", classe: { name: "1A" }, batteria: { name: "Verifica 1" }, dueAt: null,
    } as never);
    vi.mocked(consegneDelCompito).mockResolvedValue({ ok: true, righe: [] });
    await rendi();
    expect(consegneDelCompito).toHaveBeenCalledWith("comp1", "doc1");
  });

  // Fix round 1: prima di questo test, la pagina non passava affatto un
  // secondo argomento a `consegneDelCompito` e mostrava le consegne di
  // QUALUNQUE compito a QUALUNQUE docente autenticato. Il rifiuto del
  // dominio deve tradursi in un 404 — non un 403, che confermerebbe
  // l'esistenza del compito a un docente che sta sondando id altrui.
  it("404 (non un errore diverso) se il docente non insegna la classe del compito, e non legge i metadati", async () => {
    vi.mocked(consegneDelCompito).mockResolvedValue({ ok: false, motivo: "non_insegni_questa_classe" });
    await expect(Page({ params: Promise.resolve({ id: "comp1" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    // Il nome della batteria/classe non deve nemmeno essere interrogato dopo
    // un rifiuto: nessuna occasione di far trapelare quei dati altrove.
    expect(prisma.compito.findUnique).not.toHaveBeenCalled();
  });

  it("404 se il compito non esiste", async () => {
    vi.mocked(consegneDelCompito).mockResolvedValue({ ok: true, righe: [] });
    vi.mocked(prisma.compito.findUnique).mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ id: "boh" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("mostra, per ciascuno studente, nome, quanti esercizi su quanti e il punteggio", async () => {
    vi.mocked(prisma.compito.findUnique).mockResolvedValue({
      id: "comp1", classe: { name: "1A" }, batteria: { name: "Verifica 1" }, dueAt: null,
    } as never);
    vi.mocked(consegneDelCompito).mockResolvedValue({
      ok: true,
      righe: [{ studentId: "s1", nome: "Mario Rossi", fatti: 2, totali: 3, punteggio: 7, massimo: 10 }],
    });

    await rendi();

    expect(screen.getByText("Mario Rossi")).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();
    expect(screen.getByText("7/10")).toBeInTheDocument();
  });

  it("non presenta un punteggio 0/0 come se fosse una valutazione", async () => {
    vi.mocked(prisma.compito.findUnique).mockResolvedValue({
      id: "comp1", classe: { name: "1A" }, batteria: { name: "Verifica 1" }, dueAt: null,
    } as never);
    vi.mocked(consegneDelCompito).mockResolvedValue({
      ok: true,
      righe: [{ studentId: "s1", nome: "Mario Rossi", fatti: 0, totali: 0, punteggio: 0, massimo: 0 }],
    });

    await rendi();

    expect(screen.queryByText("0/0")).toBeNull();
    expect(screen.getByText("tasks.progressToDo")).toBeInTheDocument();
    expect(screen.getByText("tasks.noScore")).toBeInTheDocument();
  });

  it("senza studenti iscritti mostra il messaggio vuoto", async () => {
    vi.mocked(prisma.compito.findUnique).mockResolvedValue({
      id: "comp1", classe: { name: "1A" }, batteria: { name: "Verifica 1" }, dueAt: null,
    } as never);
    vi.mocked(consegneDelCompito).mockResolvedValue({ ok: true, righe: [] });
    await rendi();
    expect(screen.getByText("nessunoIscritto")).toBeInTheDocument();
  });

  // Il ritiro è un soft delete: la riga esiste ancora, e una lettura per id
  // la troverebbe. La pagina deve trattarla come inesistente, non mostrarne
  // le consegne né il modulo per cambiarle le date.
  it("404 se il compito è stato ritirato", async () => {
    vi.mocked(consegneDelCompito).mockResolvedValue({ ok: true, righe: [] });
    vi.mocked(prisma.compito.findUnique).mockResolvedValue({
      id: "comp1", classe: { name: "1A" }, batteria: { name: "Verifica 1" }, dueAt: null, opensAt: null,
      ritiratoAt: new Date(),
    } as never);
    await expect(Page({ params: Promise.resolve({ id: "comp1" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("offre il modulo per cambiare le date, precompilato, e il pulsante per ritirarlo", async () => {
    vi.mocked(prisma.compito.findUnique).mockResolvedValue({
      id: "comp1", classe: { name: "1A" }, batteria: { name: "Verifica 1" },
      opensAt: new Date("2099-01-02T00:00:00.000Z"), dueAt: new Date("2099-01-09T00:00:00.000Z"), ritiratoAt: null,
    } as never);
    vi.mocked(consegneDelCompito).mockResolvedValue({ ok: true, righe: [] });
    await rendi();
    expect(screen.getByLabelText("apertura")).toHaveValue("2099-01-02");
    expect(screen.getByLabelText("scadenza")).toHaveValue("2099-01-09");
    expect(screen.getByRole("button", { name: "ritira" })).toBeInTheDocument();
  });

  describe("esercizio per esercizio", () => {
    const compitoValido = {
      id: "comp1", classe: { name: "1A" }, batteria: { name: "Verifica 1" }, opensAt: null, dueAt: null, ritiratoAt: null,
    };

    it("chiede le statistiche per il docente della sessione", async () => {
      vi.mocked(prisma.compito.findUnique).mockResolvedValue(compitoValido as never);
      vi.mocked(consegneDelCompito).mockResolvedValue({ ok: true, righe: [] });
      await rendi();
      expect(statisticheDelCompito).toHaveBeenCalledWith("comp1", "doc1");
    });

    it("mostra titolo, argomento, completati su iscritti, iniziati e punteggio medio di ogni esercizio", async () => {
      vi.mocked(prisma.compito.findUnique).mockResolvedValue(compitoValido as never);
      vi.mocked(consegneDelCompito).mockResolvedValue({ ok: true, righe: [] });
      vi.mocked(statisticheDelCompito).mockResolvedValue({
        ok: true,
        iscritti: 4,
        righe: [
          { esercizioId: "e1", titolo: "Somma di frazioni", argomento: "frazioni", completati: 3, iniziati: 1, mediaPercentuale: 72 },
          { esercizioId: "e2", titolo: "Equazione lineare", argomento: "equazioni", completati: 0, iniziati: 0, mediaPercentuale: null },
        ],
      });
      await rendi();

      const tabella = screen.getByRole("table", { name: "statistiche.perEsercizioTitolo" });
      const righe = within(tabella).getAllByRole("row").slice(1);
      expect(within(righe[0]!).getByText("Somma di frazioni")).toBeInTheDocument();
      expect(within(righe[0]!).getByText("frazioni")).toBeInTheDocument();
      expect(within(righe[0]!).getByText('statistiche.completatiValore:{"completati":3,"iscritti":4}')).toBeInTheDocument();
      expect(within(righe[0]!).getByText("1")).toBeInTheDocument();
      expect(within(righe[0]!).getByText('statistiche.percentuale:{"valore":72}')).toBeInTheDocument();
      // Nessuna media non è uno 0%: nessuno l'ha completato.
      expect(within(righe[1]!).getByText("statistiche.nessunaMedia")).toBeInTheDocument();
    });

    // L'evidenza è un testo, non solo un colore: si legge anche senza
    // distinguere i colori, e da uno screen reader.
    it("segnala a parole gli esercizi completati da meno della metà della classe", async () => {
      vi.mocked(prisma.compito.findUnique).mockResolvedValue(compitoValido as never);
      vi.mocked(consegneDelCompito).mockResolvedValue({ ok: true, righe: [] });
      vi.mocked(statisticheDelCompito).mockResolvedValue({
        ok: true,
        iscritti: 4,
        righe: [
          { esercizioId: "e1", titolo: "Metà esatta", argomento: "a", completati: 2, iniziati: 0, mediaPercentuale: 50 },
          { esercizioId: "e2", titolo: "Sotto la metà", argomento: "a", completati: 1, iniziati: 2, mediaPercentuale: 40 },
        ],
      });
      await rendi();

      const righe = within(screen.getByRole("table", { name: "statistiche.perEsercizioTitolo" })).getAllByRole("row").slice(1);
      expect(within(righe[0]!).queryByText("statistiche.sottoMeta")).toBeNull();
      expect(within(righe[1]!).getByText("statistiche.sottoMeta")).toBeInTheDocument();
    });

    it("senza iscritti non mostra la tabella per esercizio", async () => {
      vi.mocked(prisma.compito.findUnique).mockResolvedValue(compitoValido as never);
      vi.mocked(consegneDelCompito).mockResolvedValue({ ok: true, righe: [] });
      vi.mocked(statisticheDelCompito).mockResolvedValue({
        ok: true,
        iscritti: 0,
        righe: [{ esercizioId: "e1", titolo: "Uno", argomento: "a", completati: 0, iniziati: 0, mediaPercentuale: null }],
      });
      await rendi();
      expect(screen.queryByRole("table", { name: "statistiche.perEsercizioTitolo" })).toBeNull();
    });

    it("404 se le statistiche rispondono 'non trovato' (ritirato nel frattempo)", async () => {
      vi.mocked(prisma.compito.findUnique).mockResolvedValue(compitoValido as never);
      vi.mocked(consegneDelCompito).mockResolvedValue({ ok: true, righe: [] });
      vi.mocked(statisticheDelCompito).mockResolvedValue({ ok: false, motivo: "compito_non_trovato" });
      await expect(Page({ params: Promise.resolve({ id: "comp1" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    });
  });
});
