import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import type { IntroProva } from "@/lib/esercizi/prova-verifica";
import { opzioniMotore } from "@/lib/esercizi/opzioni-motore";
import messaggiIt from "@/messages/it.json";
import { ProvaVerificaClient, esitoDaRisposta } from "../[id]/prova-verifica-client";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

// Una parte di testo libero per esercizio: basta per scrivere una risposta.
const unaParte = (risposta: string) => ({
  name: "Esercizio",
  statement: "<p>Testo</p>",
  variables: {},
  parts: [{ type: "patternmatch", marks: 1, matchMode: "exact", answer: risposta, prompt: "<p>Scrivi</p>" }],
}) as unknown as NumbasQuestionJSON;

const ORA_PC = Date.parse("2026-10-23T09:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

const intro: IntroProva = {
  compitoId: "v1",
  quando: new Date(ORA_PC),
  durataMinuti: 60,
  esercizi: 3,
  stato: "aperta",
  giaEntrato: false,
};

function provaAperta(o: { esercizi?: number; calcolatrice?: boolean; oraServer?: number; scadenza?: number } = {}) {
  const quanti = o.esercizi ?? 3;
  const oraServer = o.oraServer ?? ORA_PC;
  return {
    esercizi: Array.from({ length: quanti }, (_, i) => ({
      tentativoId: `t${i + 1}`, numero: i + 1, seed: `s${i + 1}`, content: unaParte(`r${i + 1}`), state: null,
    })),
    scadenza: iso(o.scadenza ?? oraServer + 60 * 60_000),
    oraServer: iso(oraServer),
    calcolatrice: o.calcolatrice ?? false,
    formulario: false,
    formularioTipo: null,
  };
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

type Rotta = (init: RequestInit | undefined) => Response | Promise<Response>;
let rotte: Record<string, Rotta>;
let fetchMock: ReturnType<typeof vi.fn>;

function chiamate(metodo: string, url: string) {
  return fetchMock.mock.calls.filter(([u, init]) => u === url && ((init as RequestInit | undefined)?.method ?? "GET") === metodo);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(ORA_PC);
  localStorage.clear();
  rotte = {
    "POST /api/esercizi/verifiche/v1/prova": () => json(provaAperta()),
    "GET /api/esercizi/verifiche/v1/prova": () => json({ scadenza: iso(ORA_PC + 3_600_000), oraServer: iso(Date.now()), consegnata: false }),
    "PUT /api/esercizi/verifiche/v1/prova/risposte": () =>
      json({ salvatoAt: iso(Date.now()), scadenza: iso(ORA_PC + 3_600_000), oraServer: iso(Date.now()) }),
    "POST /api/esercizi/verifiche/v1/prova/consegna": () => json({ ok: true }),
    "POST /api/esercizi/verifiche/v1/prova/eventi": () => new Response(null, { status: 204 }),
  };
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const rotta = rotte[`${init?.method ?? "GET"} ${url}`];
    if (!rotta) throw new Error(`rotta non prevista: ${init?.method ?? "GET"} ${url}`);
    return rotta(init);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  document.documentElement.requestFullscreen = vi.fn(async () => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function monta(i: Partial<IntroProva> = {}) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <ProvaVerificaClient compitoId="v1" studentId="u1" intro={{ ...intro, ...i }} locale="it" />
    </NextIntlClientProvider>,
  );
}

const p = messaggiIt.esercizi.provaStudente;

async function entra(i: Partial<IntroProva> = {}) {
  const utils = monta(i);
  fireEvent.click(screen.getByRole("button", { name: p.inizia }));
  await act(() => vi.advanceTimersByTimeAsync(0));
  return utils;
}

/** Nessun segnale di giusto/sbagliato, punteggio o svolgimento a schermo. */
function nienteCorrezione() {
  for (const testo of [/Risposta corretta/i, /Punteggio/i, /Come si risolve/i]) {
    expect(screen.queryByText(testo)).toBeNull();
  }
}

describe("ProvaVerificaClient", () => {
  it("l'introduzione dice durata, esercizi e la regola dello schermo intero", () => {
    monta();
    expect(screen.getByText(/60 minuti/)).toBeInTheDocument();
    expect(screen.getByText(/3 esercizi/)).toBeInTheDocument();
    expect(screen.getByText(p.introRegola)).toBeInTheDocument();
    nienteCorrezione();
  });

  it("chi è già entrato vede «Riprendi la verifica»", () => {
    monta({ giaEntrato: true });
    expect(screen.getByRole("button", { name: p.riprendi })).toBeInTheDocument();
  });

  it("«Inizia» chiede lo schermo intero ed entra nella prova", async () => {
    await entra();
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
    expect(chiamate("POST", "/api/esercizi/verifiche/v1/prova")).toHaveLength(1);
  });

  it("uno schermo intero rifiutato non blocca l'ingresso", async () => {
    document.documentElement.requestFullscreen = vi.fn(async () => { throw new Error("negato"); });
    await entra();
    expect(screen.getByRole("button", { name: /^Esercizio 1/ })).toBeInTheDocument();
  });

  it("con tre esercizi la navigazione mostra 1 2 3, e niente calcolatrice se non concessa", async () => {
    await entra();
    const nav = screen.getByRole("navigation", { name: p.navigazione });
    expect(nav.textContent).toContain("1");
    expect(nav.textContent).toContain("2");
    expect(nav.textContent).toContain("3");
    expect(screen.queryByRole("button", { name: p.calcolatrice })).toBeNull();
    nienteCorrezione();
  });

  it("con la calcolatrice concessa c'è il pulsante", async () => {
    rotte["POST /api/esercizi/verifiche/v1/prova"] = () => json(provaAperta({ calcolatrice: true }));
    await entra();
    expect(screen.getByRole("button", { name: p.calcolatrice })).toBeInTheDocument();
  });

  it("non ancora iniziata: lo dice e offre «Riprova»", async () => {
    rotte["POST /api/esercizi/verifiche/v1/prova"] = () => json({ error: "non_iniziata", oraServer: iso(ORA_PC) }, 409);
    await entra();
    expect(screen.getByText(p.nonIniziata)).toBeInTheDocument();
    rotte["POST /api/esercizi/verifiche/v1/prova"] = () => json(provaAperta());
    fireEvent.click(screen.getByRole("button", { name: p.riprova }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByRole("navigation", { name: p.navigazione })).toBeInTheDocument();
  });

  it("verifica chiusa all'ingresso: la schermata finale", async () => {
    rotte["POST /api/esercizi/verifiche/v1/prova"] = () => json({ error: "chiusa", oraServer: iso(ORA_PC) }, 409);
    await entra();
    expect(screen.getByText(p.chiusa)).toBeInTheDocument();
  });

  it("una verifica già consegnata apre direttamente la schermata finale", () => {
    monta({ stato: "consegnata" });
    expect(screen.getByText(p.consegnata)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: p.inizia })).toBeNull();
  });

  it("una risposta si salva dopo 700 ms e l'esercizio diventa «risposto»", async () => {
    await entra();
    expect(screen.getByRole("button", { name: "Esercizio 1: non risposto" })).toBeInTheDocument();
    const [campo] = screen.getAllByRole("textbox");
    fireEvent.change(campo!, { target: { value: "r1" } });
    await act(() => vi.advanceTimersByTimeAsync(699));
    expect(chiamate("PUT", "/api/esercizi/verifiche/v1/prova/risposte")).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(1));

    const put = chiamate("PUT", "/api/esercizi/verifiche/v1/prova/risposte");
    expect(put).toHaveLength(1);
    expect(JSON.parse((put[0]![1] as RequestInit).body as string).tentativoId).toBe("t1");
    expect(screen.getByText(p.salvato)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Esercizio 1: risposto" })).toBeInTheDocument();
    nienteCorrezione();
  });

  it("un salvataggio fallito dice «Non salvato, ritento»", async () => {
    rotte["PUT /api/esercizi/verifiche/v1/prova/risposte"] = () => json({ error: "boom" }, 500);
    await entra();
    fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: "r1" } });
    await act(() => vi.advanceTimersByTimeAsync(700));
    expect(screen.getByText(p.nonSalvato)).toBeInTheDocument();
  });

  it("il conto alla rovescia usa l'ora del server, non quella del PC", async () => {
    const oraServer = ORA_PC + 10 * 60_000;
    rotte["POST /api/esercizi/verifiche/v1/prova"] = () => json(provaAperta({ oraServer, scadenza: oraServer + 5 * 60_000 }));
    await entra();
    expect(screen.getByText("05:00")).toBeInTheDocument();
  });

  it("allo zero dell'orologio consegna da sé, senza dialogo", async () => {
    rotte["POST /api/esercizi/verifiche/v1/prova"] = () => json(provaAperta({ scadenza: ORA_PC + 10_000 }));
    await entra();
    await act(() => vi.advanceTimersByTimeAsync(11_000));

    expect(chiamate("POST", "/api/esercizi/verifiche/v1/prova/consegna")).toHaveLength(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText(p.tempoScaduto)).toBeInTheDocument();
    nienteCorrezione();
  });

  it("«Consegna» con una parte vuota chiede conferma col numero, poi consegna", async () => {
    rotte["POST /api/esercizi/verifiche/v1/prova"] = () => json(provaAperta({ esercizi: 2 }));
    await entra();
    fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: "r1" } });
    await act(() => vi.advanceTimersByTimeAsync(700));

    fireEvent.click(screen.getByRole("button", { name: p.consegna }));
    const dialogo = screen.getByRole("alertdialog");
    expect(dialogo.textContent).toContain("1 parti senza risposta");
    fireEvent.click(screen.getByRole("button", { name: p.consegnaConferma }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(chiamate("POST", "/api/esercizi/verifiche/v1/prova/consegna")).toHaveLength(1);
    expect(screen.getByText(p.consegnata)).toBeInTheDocument();
    nienteCorrezione();
  });

  it("consegnata dal docente: il polling porta alla schermata finale", async () => {
    await entra();
    rotte["GET /api/esercizi/verifiche/v1/prova"] = () => json({ error: "consegnata", oraServer: iso(Date.now()) }, 409);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(screen.getByText(p.consegnata)).toBeInTheDocument();
  });

  it("il polling aggiorna la scadenza (minuti aggiunti dal docente)", async () => {
    rotte["POST /api/esercizi/verifiche/v1/prova"] = () => json(provaAperta({ scadenza: ORA_PC + 5 * 60_000 }));
    await entra();
    rotte["GET /api/esercizi/verifiche/v1/prova"] = () =>
      json({ scadenza: iso(ORA_PC + 15 * 60_000), oraServer: iso(Date.now()), consegnata: false });
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(screen.getByText("14:40")).toBeInTheDocument();
  });

  it("gli stati in sospeso nel localStorage sostituiscono quelli del server e partono subito", async () => {
    // Uno stato vero del motore, come lo avrebbe lasciato la pagina prima del refresh.
    const q = loadQuestion(unaParte("r2"), { seed: "s2", ...opzioniMotore("it") });
    q.getPart(q.parts[0]!.path)!.submit("r2");
    const stato = q.toState();
    localStorage.setItem("savint:verifica:v1:u1", JSON.stringify({ t2: stato }));
    await entra();
    const put = chiamate("PUT", "/api/esercizi/verifiche/v1/prova/risposte");
    expect(put).toHaveLength(1);
    expect(JSON.parse((put[0]![1] as RequestInit).body as string).tentativoId).toBe("t2");
    expect(screen.getByRole("button", { name: "Esercizio 2: risposto" })).toBeInTheDocument();
  });
});

describe("esitoDaRisposta", () => {
  const ora = iso(ORA_PC);

  it("200 è un salvataggio riuscito, con ora del server e scadenza", () => {
    expect(esitoDaRisposta(200, { scadenza: ora, oraServer: ora })).toEqual({ ok: true, oraServer: ora, scadenza: ora });
  });

  it("400 invalid_state scarta solo quello stato", () => {
    expect(esitoDaRisposta(400, { error: "invalid_state" })).toEqual({ ok: false, definitivo: false, scarta: true, motivo: "invalid_state" });
  });

  it.each(["tempo_scaduto", "consegnata", "chiusa"])("409 %s chiude la coda", (motivo) => {
    expect(esitoDaRisposta(409, { error: motivo, oraServer: ora })).toEqual({ ok: false, definitivo: true, motivo, oraServer: ora });
  });

  it("404 chiude la coda", () => {
    expect(esitoDaRisposta(404, { error: "non_trovata" })).toMatchObject({ ok: false, definitivo: true, motivo: "non_trovata" });
  });

  it("409 non_iniziata, 5xx e risposte illeggibili si ritentano", () => {
    expect(esitoDaRisposta(409, { error: "non_iniziata", oraServer: ora })).toMatchObject({ ok: false, definitivo: false });
    expect(esitoDaRisposta(409, { error: "non_iniziata", oraServer: ora })).not.toHaveProperty("scarta");
    expect(esitoDaRisposta(500, null)).toMatchObject({ ok: false, definitivo: false });
    expect(esitoDaRisposta(503, { error: "x" })).not.toHaveProperty("scarta");
    expect(esitoDaRisposta(429, { error: "rate_limited" })).toMatchObject({ ok: false, definitivo: false });
  });
});
