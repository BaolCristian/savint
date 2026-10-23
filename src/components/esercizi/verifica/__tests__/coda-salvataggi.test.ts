import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestionState } from "@savint/engine";
import { CodaSalvataggi, type StatoCoda } from "../coda-salvataggi";

const stato = (answer: string) =>
  ({ seed: "s", parts: [{ path: "p0", answered: true, answer }] }) as unknown as QuestionState;

const CHIAVE = "savint:verifica:c1:s1";

function memoria() {
  const dati = new Map<string, string>();
  return {
    dati,
    getItem: (k: string) => dati.get(k) ?? null,
    setItem: (k: string, v: string) => void dati.set(k, v),
    removeItem: (k: string) => void dati.delete(k),
  };
}

const ok = { ok: true as const, oraServer: "2026-10-23T10:00:00.000Z", scadenza: "2026-10-23T11:00:00.000Z" };

let code: CodaSalvataggi[] = [];
function nuova(o: Partial<ConstructorParameters<typeof CodaSalvataggi>[0]> = {}) {
  const fasi: StatoCoda[] = [];
  const coda = new CodaSalvataggi({
    compitoId: "c1",
    studentId: "s1",
    invia: vi.fn(async () => ok),
    onCambio: (s) => fasi.push(s),
    ...o,
  });
  code.push(coda);
  return { coda, fasi };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  code.forEach((c) => c.ferma());
  code = [];
  vi.useRealTimers();
});

describe("CodaSalvataggi", () => {
  it("per lo stesso tentativo invia una volta sola, con l'ultimo stato", async () => {
    const invia = vi.fn(async () => ok);
    const { coda, fasi } = nuova({ invia, storage: memoria() });
    coda.metti("t1", stato("a"));
    coda.metti("t1", stato("b"));
    await vi.runAllTimersAsync();
    expect(invia).toHaveBeenCalledTimes(1);
    expect(invia).toHaveBeenCalledWith("t1", stato("b"));
    expect(fasi.at(-1)).toMatchObject({ fase: "salvato", oraServer: ok.oraServer, scadenza: ok.scadenza });
    expect(fasi.at(-1)?.ultimoSalvataggio).toBeInstanceOf(Date);
    expect(coda.pendenti().size).toBe(0);
  });

  it("un errore di rete lascia lo stato non salvato e ritenta dopo 1 s", async () => {
    const invia = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("rete"))
      .mockResolvedValue(ok);
    const storage = memoria();
    const { coda, fasi } = nuova({ invia, storage });
    coda.metti("t1", stato("a"));
    await vi.advanceTimersByTimeAsync(0);
    expect(invia).toHaveBeenCalledTimes(1);
    expect(fasi.at(-1)?.fase).toBe("non_salvato");
    expect(storage.dati.has(CHIAVE)).toBe(true);

    await vi.advanceTimersByTimeAsync(999);
    expect(invia).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(invia).toHaveBeenCalledTimes(2);
    expect(fasi.at(-1)?.fase).toBe("salvato");
    expect(storage.dati.has(CHIAVE)).toBe(false);
  });

  it("i ritardi crescono e restano poi fissi a 15 s", async () => {
    const invia = vi.fn(async () => ({ ok: false as const, definitivo: false }));
    const { coda } = nuova({ invia, storage: memoria() });
    coda.metti("t1", stato("a"));
    await vi.advanceTimersByTimeAsync(0);
    const attese = [1000, 2000, 4000, 8000, 15000, 15000];
    for (const [i, ms] of attese.entries()) {
      await vi.advanceTimersByTimeAsync(ms - 1);
      expect(invia).toHaveBeenCalledTimes(i + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(invia).toHaveBeenCalledTimes(i + 2);
    }
  });

  it("all'evento online ritenta subito", async () => {
    const invia = vi.fn().mockRejectedValueOnce(new TypeError("rete")).mockResolvedValue(ok);
    const { coda, fasi } = nuova({ invia, storage: memoria() });
    coda.metti("t1", stato("a"));
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(invia).toHaveBeenCalledTimes(2);
    expect(fasi.at(-1)?.fase).toBe("salvato");
  });

  it("un esito definitivo chiude la coda, svuota lo storage e non invia più nulla", async () => {
    const invia = vi.fn(async () => ({
      ok: false as const,
      definitivo: true,
      motivo: "tempo_scaduto",
      oraServer: "2026-10-23T11:00:31.000Z",
    }));
    const storage = memoria();
    const { coda, fasi } = nuova({ invia, storage });
    coda.metti("t1", stato("a"));
    coda.metti("t2", stato("b"));
    await vi.runAllTimersAsync();
    expect(invia).toHaveBeenCalledTimes(1);
    expect(fasi.at(-1)).toMatchObject({ fase: "chiuso", motivo: "tempo_scaduto" });
    expect(coda.pendenti().size).toBe(0);
    expect(storage.dati.has(CHIAVE)).toBe(false);

    coda.metti("t1", stato("c"));
    await coda.svuota();
    await vi.runAllTimersAsync();
    expect(invia).toHaveBeenCalledTimes(1);
    expect(storage.dati.has(CHIAVE)).toBe(false);
  });

  it("una nuova coda con lo stesso storage ritrova i pendenti", async () => {
    const storage = memoria();
    const invia = vi.fn(async () => ({ ok: false as const, definitivo: false }));
    const { coda } = nuova({ invia, storage });
    coda.metti("t1", stato("a"));
    coda.metti("t2", stato("b"));
    coda.ferma();

    const { coda: dopo } = nuova({ invia: vi.fn(async () => ok), storage });
    expect(dopo.pendenti()).toEqual(new Map([["t1", stato("a")], ["t2", stato("b")]]));
  });

  it("svuota invia subito quello che è in attesa, senza aspettare il ritardo", async () => {
    const invia = vi.fn().mockRejectedValueOnce(new TypeError("rete")).mockResolvedValue(ok);
    const { coda } = nuova({ invia, storage: memoria() });
    coda.metti("t1", stato("a"));
    await vi.advanceTimersByTimeAsync(0);
    await coda.svuota();
    expect(invia).toHaveBeenCalledTimes(2);
    expect(coda.pendenti().size).toBe(0);
  });

  it("uno storage che lancia non ferma la coda: lavora in memoria", async () => {
    const rotto = {
      getItem: () => { throw new Error("negato"); },
      setItem: () => { throw new Error("negato"); },
      removeItem: () => { throw new Error("negato"); },
    };
    const invia = vi.fn(async () => ok);
    const { coda, fasi } = nuova({ invia, storage: rotto });
    coda.metti("t1", stato("a"));
    expect(coda.pendenti().get("t1")).toEqual(stato("a"));
    await vi.runAllTimersAsync();
    expect(invia).toHaveBeenCalledWith("t1", stato("a"));
    expect(fasi.at(-1)?.fase).toBe("salvato");
  });
});
