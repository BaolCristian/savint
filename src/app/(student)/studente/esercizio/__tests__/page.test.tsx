import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth/config", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", role: "STUDENT" } })) }));
vi.mock("@/lib/esercizi/tentativo", () => ({ avviaORiprendi: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "it") }));

import { avviaORiprendi } from "@/lib/esercizi/tentativo";
import { notFound } from "next/navigation";
import Page from "../[esercizioId]/page";

describe("pagina dell'esercizio", () => {
  it("404 se l'esercizio non esiste", async () => {
    vi.mocked(avviaORiprendi).mockResolvedValue(null);
    await expect(Page({ params: Promise.resolve({ esercizioId: "boh" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("passa al player tentativo, seme, contenuto e stato", async () => {
    const ultimaAttivita = new Date("2026-09-01T10:00:00Z");
    vi.mocked(avviaORiprendi).mockResolvedValue({
      tentativoId: "t1", seed: "s1", content: { name: "x" }, state: null,
      score: 0, maxScore: 2, status: "IN_PROGRESS", lastActivityAt: ultimaAttivita,
    });
    const albero = await Page({ params: Promise.resolve({ esercizioId: "01-equazione-primo-grado" }) });
    const props = (albero as { props: Record<string, unknown> }).props;
    expect(props.tentativoId).toBe("t1");
    expect(props.seed).toBe("s1");
    expect(props.statoIniziale).toBeNull();
    expect(props.lastActivityAt).toBe(ultimaAttivita);
  });

  // Onda "spiega la ripresa": senza una `key` diversa per tentativo, dopo un
  // abbandono (`router.refresh()`, vedi il player) React riutilizzerebbe la
  // stessa istanza del player invece di montarne una nuova sul tentativo
  // appena creato — la domanda e il seme restano quelli fissati al primo
  // montaggio (commento gemello in `player-esercizio.tsx`).
  it("usa il tentativoId come key, cosi' un tentativo diverso rimonta il player", async () => {
    vi.mocked(avviaORiprendi).mockResolvedValue({
      tentativoId: "t1", seed: "s1", content: { name: "x" }, state: null,
      score: 0, maxScore: 2, status: "IN_PROGRESS", lastActivityAt: new Date(),
    });
    const albero = await Page({ params: Promise.resolve({ esercizioId: "01-equazione-primo-grado" }) });
    expect((albero as { key: string | null }).key).toBe("t1");
  });

  // Task 7: un esercizio aperto da un compito (link con ?compitoId=...) deve
  // registrare quel compito sul tentativo — altrimenti `avviaORiprendi`
  // riprenderebbe/creerebbe sempre il tentativo "libero", vedi il commento
  // gemello nel dominio (tentativo.ts).
  it("inoltra il compitoId dai searchParams ad avviaORiprendi", async () => {
    vi.mocked(avviaORiprendi).mockResolvedValue({
      tentativoId: "t1", seed: "s1", content: { name: "x" }, state: null,
      score: 0, maxScore: 2, status: "IN_PROGRESS", lastActivityAt: new Date(),
    });
    await Page({
      params: Promise.resolve({ esercizioId: "01-equazione-primo-grado" }),
      searchParams: Promise.resolve({ compitoId: "compito-1" }),
    });
    expect(avviaORiprendi).toHaveBeenCalledWith("u1", "01-equazione-primo-grado", "compito-1");
  });

  it("senza compitoId nei searchParams, avviaORiprendi si comporta come per un esercizio libero", async () => {
    vi.mocked(avviaORiprendi).mockResolvedValue({
      tentativoId: "t1", seed: "s1", content: { name: "x" }, state: null,
      score: 0, maxScore: 2, status: "IN_PROGRESS", lastActivityAt: new Date(),
    });
    await Page({ params: Promise.resolve({ esercizioId: "01-equazione-primo-grado" }) });
    expect(avviaORiprendi).toHaveBeenCalledWith("u1", "01-equazione-primo-grado", undefined);
  });
});
