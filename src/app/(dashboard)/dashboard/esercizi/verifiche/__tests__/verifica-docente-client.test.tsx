import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import { VerificaDocenteClient, type MonitoraggioJson, type MisuraVerificaJson } from "../[id]/verifica-docente-client";

// Un basePath vero: ogni chiamata a /api deve passare da withBasePath.
vi.mock("@/lib/base-path", () => ({
  BASE_PATH: "/demo",
  withBasePath: (percorso: string) => `/demo${percorso}`,
}));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const ORA = "2026-10-23T09:00:00.000Z";
const API = "/demo/api/esercizi/verifiche/v1";

type Riga = MonitoraggioJson["righe"][number];
const riga = (o: Partial<Riga> & { studentId: string; nome: string }): Riga => ({
  stato: "non_entrato",
  recupero: false,
  risposti: 0,
  totale: 5,
  scadenza: "2026-10-23T09:15:00.000Z",
  secondiResidui: 900,
  tempoExtraPct: 0,
  minutiExtra: 0,
  uscite: 0,
  secondiFuori: 0,
  ultimoSalvataggioAt: null,
  recuperabile: false,
  ...o,
});

function monitoraggio(o: { stato?: MonitoraggioJson["verifica"]["stato"]; righe?: Riga[]; recuperiAperti?: number; avvioProgrammatoAt?: string | null } = {}): MonitoraggioJson {
  const stato = o.stato ?? "IN_CORSO";
  return {
    verifica: {
      compitoId: "v1",
      classeId: "c1",
      assignedById: "doc1",
      createdAt: "2026-10-22T09:00:00.000Z",
      durataMinuti: 60,
      avvioProgrammatoAt: o.avvioProgrammatoAt ?? null,
      avviataAt: stato === "PREPARATA" ? null : "2026-10-23T08:45:00.000Z",
      chiusaAt: stato === "CHIUSA" || stato === "PUBBLICATA" ? "2026-10-23T08:59:00.000Z" : null,
      pubblicataAt: stato === "PUBBLICATA" ? "2026-10-23T09:00:00.000Z" : null,
      minutiExtra: 0,
      calcolatrice: "SOLO_PDP",
      formulario: "TUTTI",
      formularioFile: "f-abc.pdf",
      layout: [],
      stato,
    },
    titolo: "Equazioni",
    classe: "2B",
    oraServer: ORA,
    conTempoResiduo: 2,
    recuperiAperti: o.recuperiAperti ?? 0,
    righe: o.righe ?? [
      riga({ studentId: "s1", nome: "Anna Bianchi", recuperabile: true }),
      riga({
        studentId: "s2", nome: "Carlo Rossi", stato: "in_corso", risposti: 2, secondiResidui: 750, scadenza: "2026-10-23T09:12:30.000Z",
        tempoExtraPct: 25, minutiExtra: 10, uscite: 3, secondiFuori: 80, ultimoSalvataggioAt: "2026-10-23T08:58:30.000Z",
      }),
      riga({ studentId: "s3", nome: "Dario Verdi", recuperabile: true }),
      riga({ studentId: "s4", nome: "Elena Neri", stato: "consegnato", risposti: 5, secondiResidui: null }),
    ],
  };
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

let rotte: Record<string, (init?: RequestInit) => Response>;
let fetchMock: ReturnType<typeof vi.fn>;

function chiamate(metodo: string, url: string) {
  return fetchMock.mock.calls.filter(([u, init]) => u === url && ((init as RequestInit | undefined)?.method ?? "GET") === metodo);
}
const corpoDi = (c: unknown[]) => JSON.parse((c[1] as RequestInit).body as string);

beforeEach(() => {
  rotte = {
    [`GET ${API}`]: () => json(monitoraggio()),
    [`POST ${API}/azioni`]: () => json({ ok: true }),
    [`PATCH ${API}`]: () => json({ ok: true }),
    [`GET ${API}/misure`]: () => json({ studenti: [] }),
    [`PUT ${API}/misure`]: () => json({ ok: true }),
    "DELETE /demo/api/esercizi/compiti/v1": () => json({ ok: true }),
  };
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const rotta = rotte[`${init?.method ?? "GET"} ${url}`];
    if (!rotta) throw new Error(`rotta non prevista: ${init?.method ?? "GET"} ${url}`);
    return rotta(init);
  });
  vi.stubGlobal("fetch", fetchMock);
  router.push.mockReset();
  router.refresh.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
});

function rendi(iniziale: MonitoraggioJson, misure: MisuraVerificaJson[] | null = null) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt} timeZone="Europe/Rome">
      <VerificaDocenteClient compitoId="v1" iniziale={iniziale} misureIniziali={misure} />
    </NextIntlClientProvider>,
  );
}

describe("VerificaDocenteClient — monitoraggio in corso", () => {
  it("mostra stato, risposte, tempo residuo con l'extra e le uscite di ogni studente", () => {
    rendi(monitoraggio());
    const tabella = screen.getByRole("table");
    const carlo = within(tabella).getByText("Carlo Rossi").closest("tr")!;
    expect(within(carlo).getByText("in corso")).toBeInTheDocument();
    expect(within(carlo).getByText("2 / 5")).toBeInTheDocument();
    expect(within(carlo).getByText("12:30")).toBeInTheDocument();
    expect(within(carlo).getByText("+25%")).toBeInTheDocument();
    expect(within(carlo).getByText("+10 min")).toBeInTheDocument();
    expect(within(carlo).getByText("3 uscite")).toBeInTheDocument();
    expect(within(carlo).getByText("01:20 fuori")).toBeInTheDocument();
    expect(within(tabella).getAllByText("non entrato")).toHaveLength(2);
    expect(screen.getByText("In corso")).toBeInTheDocument();
  });

  it("non mostra nessun punteggio nella tabella", () => {
    rendi(monitoraggio());
    expect(within(screen.getByRole("table")).queryByText(/punt/i)).toBeNull();
  });

  it("interroga il server ogni 5 secondi, con il basePath, e si ferma a scheda nascosta", async () => {
    vi.useFakeTimers();
    rendi(monitoraggio());
    expect(chiamate("GET", API)).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(chiamate("GET", API)).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(chiamate("GET", API)).toHaveLength(2);

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(chiamate("GET", API)).toHaveLength(2);

    // Al ritorno sulla scheda si rilegge subito.
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(chiamate("GET", API)).toHaveLength(3);
  });

  it("«Chiudi» chiede conferma dicendo quanti hanno ancora tempo, poi chiude e rilegge", async () => {
    rendi(monitoraggio());
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("2 studenti hanno ancora tempo. Chiudere per tutti?")).toBeInTheDocument();
    expect(chiamate("POST", `${API}/azioni`)).toHaveLength(0);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Sì, chiudi" }));
    await waitFor(() => expect(chiamate("POST", `${API}/azioni`)).toHaveLength(1));
    expect(corpoDi(chiamate("POST", `${API}/azioni`)[0])).toEqual({ azione: "chiudi" });
    await waitFor(() => expect(chiamate("GET", API)).toHaveLength(1));
  });

  it("«+ minuti» su una riga dà i minuti scelti solo a quello studente", async () => {
    rendi(monitoraggio());
    fireEvent.click(screen.getByRole("button", { name: "+ minuti per Carlo Rossi" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "+10 min" }));
    await waitFor(() => expect(chiamate("POST", `${API}/azioni`)).toHaveLength(1));
    expect(corpoDi(chiamate("POST", `${API}/azioni`)[0])).toEqual({ azione: "minuti", minuti: 10, studentId: "s2" });
  });

  it("«+ minuti a tutti» accetta anche un valore scritto, e rifiuta quelli fuori misura", async () => {
    rendi(monitoraggio());
    fireEvent.click(screen.getByRole("button", { name: "+ minuti a tutti" }));
    const dialogo = await screen.findByRole("dialog");
    const campo = within(dialogo).getByLabelText("Altro valore (da 1 a 120)");
    fireEvent.change(campo, { target: { value: "200" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Aggiungi" }));
    expect(within(dialogo).getByText("Scrivi un numero intero da 1 a 120.")).toBeInTheDocument();
    fireEvent.change(campo, { target: { value: "7" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(chiamate("POST", `${API}/azioni`)).toHaveLength(1));
    expect(corpoDi(chiamate("POST", `${API}/azioni`)[0])).toEqual({ azione: "minuti", minuti: 7 });
  });

  it("nessun «+ minuti» per chi ha già consegnato", () => {
    rendi(monitoraggio());
    expect(screen.queryByRole("button", { name: "+ minuti per Elena Neri" })).toBeNull();
  });

  it("selezionati due assenti, «Avvia recupero (2)» li manda insieme", async () => {
    rendi(monitoraggio());
    expect(screen.getByRole("button", { name: "Avvia recupero (0)" })).toBeDisabled();
    // Solo le righe recuperabili hanno la casella.
    expect(screen.queryByRole("checkbox", { name: "Seleziona Carlo Rossi per il recupero" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona Anna Bianchi per il recupero" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona Dario Verdi per il recupero" }));
    fireEvent.click(screen.getByRole("button", { name: "Avvia recupero (2)" }));
    await waitFor(() => expect(chiamate("POST", `${API}/azioni`)).toHaveLength(1));
    expect(corpoDi(chiamate("POST", `${API}/azioni`)[0])).toEqual({ azione: "recupero", studentIds: ["s1", "s3"] });
    await waitFor(() => expect(screen.getByRole("button", { name: "Avvia recupero (0)" })).toBeInTheDocument());
  });

  it("un recupero aperto si chiude dalla sua riga", async () => {
    rendi(monitoraggio({
      stato: "CHIUSA",
      recuperiAperti: 1,
      righe: [riga({ studentId: "s1", nome: "Anna Bianchi", stato: "in_corso", recupero: true, secondiResidui: 600 })],
    }));
    fireEvent.click(screen.getByRole("button", { name: "Chiudi recupero di Anna Bianchi" }));
    await waitFor(() => expect(chiamate("POST", `${API}/azioni`)).toHaveLength(1));
    expect(corpoDi(chiamate("POST", `${API}/azioni`)[0])).toEqual({ azione: "chiudiRecupero", studentIds: ["s1"] });
  });

  it("mostra il motivo di un rifiuto e rilegge lo stato", async () => {
    rotte[`POST ${API}/azioni`] = () => json({ error: "stato_non_valido" }, 409);
    rendi(monitoraggio());
    fireEvent.click(screen.getByRole("button", { name: "+ minuti per Carlo Rossi" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "+5 min" }));
    expect(await screen.findByText("La verifica è cambiata nel frattempo: qui sotto lo stato aggiornato.")).toBeInTheDocument();
    await waitFor(() => expect(chiamate("GET", API)).toHaveLength(1));
  });
});

describe("VerificaDocenteClient — chiusa", () => {
  it("in CHIUSA senza recuperi aperti non interroga il server e lascia lo spazio ai risultati", async () => {
    vi.useFakeTimers();
    rendi(monitoraggio({ stato: "CHIUSA" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(chiamate("GET", API)).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Risultati" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chiudi" })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ minuti a tutti" })).toBeNull();
  });

  it("in CHIUSA con un recupero aperto continua a interrogare", async () => {
    vi.useFakeTimers();
    rendi(monitoraggio({
      stato: "CHIUSA",
      recuperiAperti: 1,
      righe: [riga({ studentId: "s1", nome: "Anna Bianchi", recupero: true })],
    }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(chiamate("GET", API)).toHaveLength(1);
  });
});

describe("VerificaDocenteClient — preparata", () => {
  const preparata = (o: { avvioProgrammatoAt?: string | null } = {}) =>
    monitoraggio({ stato: "PREPARATA", ...o, righe: [riga({ studentId: "s1", nome: "Anna Bianchi", secondiResidui: null, scadenza: null })] });

  it("mostra Avvia e le impostazioni, non la tabella", () => {
    rendi(preparata(), []);
    expect(screen.getByRole("button", { name: "Avvia" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Impostazioni" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Preparata")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Apri il formulario" })).toHaveAttribute("href", `${API}/formulario`);
  });

  it("«Avvia» chiede conferma e poi avvia", async () => {
    rendi(preparata(), []);
    fireEvent.click(screen.getByRole("button", { name: "Avvia" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Sì, avvia" }));
    await waitFor(() => expect(chiamate("POST", `${API}/azioni`)).toHaveLength(1));
    expect(corpoDi(chiamate("POST", `${API}/azioni`)[0])).toEqual({ azione: "avvia" });
  });

  it("senza avvio programmato non interroga; con l'avvio programmato una volta sola, all'orario", async () => {
    vi.useFakeTimers();
    const { unmount } = rendi(preparata(), []);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(chiamate("GET", API)).toHaveLength(0);
    unmount();

    rendi(preparata({ avvioProgrammatoAt: "2026-10-23T09:01:00.000Z" }), []);
    await act(async () => { await vi.advanceTimersByTimeAsync(59_000); });
    expect(chiamate("GET", API)).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(chiamate("GET", API)).toHaveLength(1);
  });

  it("salva le impostazioni con PATCH", async () => {
    rotte[`GET ${API}`] = () => json(preparata());
    rendi(preparata(), []);
    fireEvent.change(screen.getByLabelText("Durata (minuti)"), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText("Calcolatrice"), { target: { value: "TUTTI" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva le impostazioni" }));
    await waitFor(() => expect(chiamate("PATCH", API)).toHaveLength(1));
    expect(corpoDi(chiamate("PATCH", API)[0])).toEqual({
      durataMinuti: 45,
      avvioProgrammatoAt: null,
      calcolatrice: "TUTTI",
      formulario: "TUTTI",
      formularioFile: "f-abc.pdf",
    });
    expect(await screen.findByText("Impostazioni salvate.")).toBeInTheDocument();
  });

  it("«Togli» il formulario manda formularioFile null e formulario NESSUNO", async () => {
    rendi(preparata(), []);
    fireEvent.click(screen.getByRole("button", { name: "Togli" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva le impostazioni" }));
    await waitFor(() => expect(chiamate("PATCH", API)).toHaveLength(1));
    expect(corpoDi(chiamate("PATCH", API)[0])).toMatchObject({ formulario: "NESSUNO", formularioFile: null });
  });

  it("elenca gli studenti con misure PDP e le rilegge dopo una modifica", async () => {
    const misure: MisuraVerificaJson[] = [{
      studentId: "s1", nome: "Anna Bianchi", personalizzate: false,
      misure: { tempoExtraPct: 25, menoEsercizi: true, calcolatrice: false, formulario: false },
    }];
    rotte[`GET ${API}/misure`] = () => json({ studenti: [{ ...misure[0], personalizzate: true }] });
    rendi(preparata(), misure);
    expect(screen.getByText("+25% di tempo · meno esercizi")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Modifica per questa verifica le misure di Anna Bianchi" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(chiamate("PUT", `${API}/misure`)).toHaveLength(1));
    await waitFor(() => expect(chiamate("GET", `${API}/misure`)).toHaveLength(1));
    expect(await screen.findByText("solo per questa verifica")).toBeInTheDocument();
  });

  it("«Ritira la verifica» chiede conferma, ritira e torna ai compiti", async () => {
    rendi(preparata(), []);
    fireEvent.click(screen.getByRole("button", { name: "Ritira la verifica" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Sì, ritira" }));
    await waitFor(() => expect(chiamate("DELETE", "/demo/api/esercizi/compiti/v1")).toHaveLength(1));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard/esercizi/compiti"));
  });
});
