import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { EventoInput } from "@/lib/esercizi/prova-verifica";
import { InvioEventi, usaSorveglianza } from "../usa-sorveglianza";

// Lo stato del documento che la sorveglianza legge, comandato dai test:
// jsdom non ha l'API dello schermo intero né cambia la visibilità da sé.
let visibilita: DocumentVisibilityState = "visible";
let schermoIntero: Element | null = null;
let schermoAbilitato = false;

function nascondi() {
  visibilita = "hidden";
  document.dispatchEvent(new Event("visibilitychange"));
}
function mostra() {
  visibilita = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
}
function esciDaSchermoIntero() {
  schermoIntero = null;
  document.dispatchEvent(new Event("fullscreenchange"));
}
function tornaASchermoIntero() {
  schermoIntero = document.documentElement;
  document.dispatchEvent(new Event("fullscreenchange"));
}

const INIZIO = Date.parse("2026-10-23T09:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(INIZIO);
  visibilita = "visible";
  schermoIntero = null;
  schermoAbilitato = false;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibilita });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => schermoIntero });
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => schermoAbilitato });
});
const requestFullscreenOriginale = document.documentElement.requestFullscreen;
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // Via le proprietà finte: tornano quelle di jsdom (del prototipo).
  for (const nome of ["visibilityState", "fullscreenElement", "fullscreenEnabled"]) {
    delete (document as unknown as Record<string, unknown>)[nome];
  }
  document.documentElement.requestFullscreen = requestFullscreenOriginale;
  vi.useRealTimers();
});

function monta(scartoMs = 0) {
  const eventi: EventoInput[] = [];
  const utils = renderHook((p: { attiva: boolean }) =>
    usaSorveglianza({ attiva: p.attiva, scartoMs, onEvento: (e) => eventi.push(e) }), { initialProps: { attiva: true } });
  return { ...utils, eventi };
}

describe("usaSorveglianza", () => {
  it("una scheda nascosta e poi di nuovo visibile: un'uscita (SCHEDA) e un rientro con la durata", () => {
    const { result, eventi } = monta();
    act(() => nascondi());
    expect(result.current.fuori).toBe(true);
    act(() => vi.advanceTimersByTime(4000));
    act(() => mostra());

    expect(eventi).toEqual([
      { tipo: "USCITA", motivo: "SCHEDA", at: new Date(INIZIO).toISOString() },
      { tipo: "RIENTRO", at: new Date(INIZIO + 4000).toISOString(), durataMs: 4000 },
    ]);
    expect(result.current.fuori).toBe(false);
  });

  it("un blur di 1 s non è un'uscita", () => {
    const { result, eventi } = monta();
    act(() => window.dispatchEvent(new Event("blur")));
    act(() => vi.advanceTimersByTime(1000));
    act(() => window.dispatchEvent(new Event("focus")));
    act(() => vi.advanceTimersByTime(5000));
    expect(eventi).toEqual([]);
    expect(result.current.fuori).toBe(false);
  });

  it("un blur di 3 s è un'uscita (FOCUS) che comincia all'inizio del blur", () => {
    const { result, eventi } = monta();
    act(() => window.dispatchEvent(new Event("blur")));
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.fuori).toBe(true);
    act(() => window.dispatchEvent(new Event("focus")));

    expect(eventi).toEqual([
      { tipo: "USCITA", motivo: "FOCUS", at: new Date(INIZIO).toISOString() },
      { tipo: "RIENTRO", at: new Date(INIZIO + 3000).toISOString(), durataMs: 3000 },
    ]);
  });

  it("uscita dallo schermo intero e cambio di scheda insieme: un solo episodio", () => {
    schermoAbilitato = true;
    schermoIntero = document.documentElement;
    const { eventi } = monta();
    act(() => esciDaSchermoIntero());
    act(() => nascondi());
    act(() => vi.advanceTimersByTime(2000));
    act(() => mostra());
    // Visibile ma non ancora a schermo intero: l'episodio continua.
    expect(eventi.filter((e) => e.tipo === "RIENTRO")).toEqual([]);
    act(() => tornaASchermoIntero());

    expect(eventi.filter((e) => e.tipo === "USCITA")).toEqual([
      { tipo: "USCITA", motivo: "SCHERMO_INTERO", at: new Date(INIZIO).toISOString() },
    ]);
    expect(eventi.filter((e) => e.tipo === "RIENTRO")).toEqual([
      { tipo: "RIENTRO", at: new Date(INIZIO + 2000).toISOString(), durataMs: 2000 },
    ]);
  });

  it("le ore sono quelle del server: ora del PC più lo scarto", () => {
    const { eventi } = monta(600_000);
    act(() => nascondi());
    expect(eventi[0]!.at).toBe(new Date(INIZIO + 600_000).toISOString());
  });

  it("schermo intero rifiutato all'avvio: l'uscita è registrata subito", () => {
    schermoAbilitato = true;
    const { result, eventi } = monta();
    expect(result.current.fuori).toBe(true);
    expect(eventi).toEqual([{ tipo: "USCITA", motivo: "SCHERMO_INTERO", at: new Date(INIZIO).toISOString() }]);
  });

  it("senza l'API dello schermo intero (iPhone) si sorvegliano solo scheda e focus", () => {
    schermoAbilitato = false;
    const { result, eventi } = monta();
    act(() => document.dispatchEvent(new Event("fullscreenchange")));
    expect(result.current.fuori).toBe(false);
    expect(eventi).toEqual([]);
  });

  it("spenta non registra nulla", () => {
    const { rerender, eventi } = monta();
    rerender({ attiva: false });
    act(() => nascondi());
    act(() => mostra());
    expect(eventi).toEqual([]);
  });

  it("rientra() chiede di nuovo lo schermo intero", async () => {
    schermoAbilitato = true;
    const richiesta = vi.fn(async () => {});
    document.documentElement.requestFullscreen = richiesta;
    const { result } = monta();
    await act(() => result.current.rientra());
    expect(richiesta).toHaveBeenCalled();
  });
});

describe("InvioEventi", () => {
  const ev = (n: number): EventoInput => ({ tipo: "USCITA", motivo: "SCHEDA", at: new Date(INIZIO + n).toISOString() });

  it("manda gli eventi dello stesso giro in un solo lotto", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const invio = new InvioEventi({ compitoId: "v1" });
    invio.aggiungi(ev(1));
    invio.aggiungi(ev(2));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/esercizi/verifiche/v1/prova/eventi");
    expect(JSON.parse(init.body as string)).toEqual({ eventi: [ev(1), ev(2)] });
  });

  it("ritenta un lotto dopo un errore di rete e lo rimanda con quelli nuovi", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const invio = new InvioEventi({ compitoId: "v1", ritardi: [1000] });
    invio.aggiungi(ev(1));
    await act(() => vi.advanceTimersByTimeAsync(0));
    invio.aggiungi(ev(2));
    await act(() => vi.advanceTimersByTimeAsync(1000));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)).toEqual({ eventi: [ev(1), ev(2)] });
  });

  it("un lotto che continua a fallire si perde e non blocca i successivi", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const invio = new InvioEventi({ compitoId: "v1", ritardi: [1000] });
    invio.aggiungi(ev(1));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    invio.aggiungi(ev(2));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(JSON.parse((fetchMock.mock.calls[2]![1] as RequestInit).body as string)).toEqual({ eventi: [ev(2)] });
  });

  it("un rifiuto del server (4xx) scarta il lotto senza ritentare", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "non_trovata" }), { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const invio = new InvioEventi({ compitoId: "v1", ritardi: [1000] });
    invio.aggiungi(ev(1));
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
