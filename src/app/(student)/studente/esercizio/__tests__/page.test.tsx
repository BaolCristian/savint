import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth/config", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", role: "STUDENT" } })) }));
vi.mock("@/lib/esercizi/tentativo", () => ({ avviaORiprendi: vi.fn() }));
vi.mock("@/lib/esercizi/percorso-compito", () => ({ percorsoCompitoStudente: vi.fn() }));
// Di norma l'esercizio è apribile: i test sul cancello lo dicono esplicitamente.
vi.mock("@/lib/esercizi/pratica", () => ({ esercizioApribileDaStudente: vi.fn(async () => true) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }), notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }));
vi.mock("next-intl/server", () => ({ getLocale: vi.fn(async () => "it") }));

import { avviaORiprendi } from "@/lib/esercizi/tentativo";
import { percorsoCompitoStudente } from "@/lib/esercizi/percorso-compito";
import { esercizioApribileDaStudente } from "@/lib/esercizi/pratica";
import { notFound, redirect } from "next/navigation";
import Page from "../[esercizioId]/page";

describe("pagina dell'esercizio", () => {
  it("non apre un nuovo tentativo da un URL percorso ormai superato", async () => {
    vi.mocked(percorsoCompitoStudente).mockResolvedValue({
      titolo: "Algebra", totale: 2, esercizi: [],
      prossimo: { esercizioId: "e2", titolo: "Secondo", indice: 2, completato: false },
    });

    await expect(Page({
      params: Promise.resolve({ esercizioId: "e1" }),
      searchParams: Promise.resolve({ compitoId: "c1", percorso: "1" }),
    })).rejects.toThrow("REDIRECT:/studente/compito/c1");
    expect(avviaORiprendi).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/studente/compito/c1");
  });
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
      richiestaCompitoRifiutata: false,
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
      richiestaCompitoRifiutata: false,
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
      richiestaCompitoRifiutata: false,
    });
    await Page({
      params: Promise.resolve({ esercizioId: "01-equazione-primo-grado" }),
      searchParams: Promise.resolve({ compitoId: "compito-1" }),
    });
    expect(avviaORiprendi).toHaveBeenCalledWith("u1", "01-equazione-primo-grado", "compito-1", "it");
  });

  it("senza compitoId nei searchParams, avviaORiprendi si comporta come per un esercizio libero", async () => {
    vi.mocked(avviaORiprendi).mockResolvedValue({
      tentativoId: "t1", seed: "s1", content: { name: "x" }, state: null,
      score: 0, maxScore: 2, status: "IN_PROGRESS", lastActivityAt: new Date(),
      richiestaCompitoRifiutata: false,
    });
    await Page({ params: Promise.resolve({ esercizioId: "01-equazione-primo-grado" }) });
    expect(avviaORiprendi).toHaveBeenCalledWith("u1", "01-equazione-primo-grado", undefined, "it");
  });

  // Secondo giro, item 2: la pagina deve inoltrare al player il segnale che
  // il compito richiesto è stato respinto, non limitarsi a leggerlo dal
  // dominio e buttarlo via — senza questo, il player non avrebbe modo di
  // sapere che deve mostrare la riga di pratica libera.
  it("inoltra richiestaCompitoRifiutata al player", async () => {
    vi.mocked(avviaORiprendi).mockResolvedValue({
      tentativoId: "t1", seed: "s1", content: { name: "x" }, state: null,
      score: 0, maxScore: 2, status: "IN_PROGRESS", lastActivityAt: new Date(),
      richiestaCompitoRifiutata: true,
    });
    const albero = await Page({
      params: Promise.resolve({ esercizioId: "01-equazione-primo-grado" }),
      searchParams: Promise.resolve({ compitoId: "compito-caduto" }),
    });
    const props = (albero as { props: Record<string, unknown> }).props;
    expect(props.richiestaCompitoRifiutata).toBe(true);
  });

  // Pratica libera: dal link senza compito un esercizio che lo studente non
  // può aprire risponde "non trovato", prima di aprire alcun tentativo.
  it("senza compitoId, un esercizio non apribile dallo studente è non trovato", async () => {
    vi.mocked(esercizioApribileDaStudente).mockResolvedValueOnce(false);
    vi.mocked(avviaORiprendi).mockClear();
    await expect(Page({ params: Promise.resolve({ esercizioId: "privato" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(esercizioApribileDaStudente).toHaveBeenCalledWith("u1", "privato");
    expect(avviaORiprendi).not.toHaveBeenCalled();
  });

  // Un `compitoId` inventato non apre un esercizio nascosto: senza il
  // cancello `avviaORiprendi` ricadrebbe sul tentativo libero.
  it("con un compitoId inventato, un esercizio non apribile è non trovato", async () => {
    vi.mocked(esercizioApribileDaStudente).mockResolvedValueOnce(false);
    vi.mocked(avviaORiprendi).mockClear();
    await expect(Page({
      params: Promise.resolve({ esercizioId: "nascosto" }),
      searchParams: Promise.resolve({ compitoId: "inventato" }),
    })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(esercizioApribileDaStudente).toHaveBeenCalledWith("u1", "nascosto");
    expect(avviaORiprendi).not.toHaveBeenCalled();
  });

  // Un link di compito legittimo passa il cancello (eccezione del compito) e
  // apre il tentativo sul compito.
  it("con un compitoId legittimo l'esercizio si apre sul compito", async () => {
    vi.mocked(esercizioApribileDaStudente).mockClear().mockResolvedValueOnce(true);
    vi.mocked(avviaORiprendi).mockResolvedValue({
      tentativoId: "t1", seed: "s1", content: { name: "x" }, state: null,
      score: 0, maxScore: 2, status: "IN_PROGRESS", lastActivityAt: new Date(),
      richiestaCompitoRifiutata: false,
    });
    const albero = await Page({
      params: Promise.resolve({ esercizioId: "assegnato" }),
      searchParams: Promise.resolve({ compitoId: "compito-1" }),
    });
    expect(esercizioApribileDaStudente).toHaveBeenCalledWith("u1", "assegnato");
    expect(avviaORiprendi).toHaveBeenCalledWith("u1", "assegnato", "compito-1", "it");
    expect((albero as { props: Record<string, unknown> }).props.contesto).toBe("assigned");
  });
});
