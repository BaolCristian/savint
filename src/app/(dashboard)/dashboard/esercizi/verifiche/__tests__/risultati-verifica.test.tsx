import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import { RisultatiVerifica, type RisultatiJson } from "../[id]/risultati-verifica";

// Un basePath vero: ogni chiamata a /api deve passare da withBasePath.
vi.mock("@/lib/base-path", () => ({
  BASE_PATH: "/demo",
  withBasePath: (percorso: string) => `/demo${percorso}`,
}));
// La revisione vera carica il motore: qui basta sapere che riceve la risposta.
vi.mock("@/components/esercizi/verifica/revisione-esercizio", () => ({
  RevisioneEsercizio: ({ seed }: { seed: string }) => <div data-testid="revisione">{seed}</div>,
}));

const API = "/demo/api/esercizi/verifiche/v1";
const r = messaggiIt.esercizi.verifica.risultati.docente;

type Riga = RisultatiJson["righe"][number];
type Cella = NonNullable<Riga["celle"][number]>;
const cella = (posizione: number, o: Partial<Cella> = {}): Cella => ({
  posizione, tentativoId: `t${posizione}`, esercizioId: `e${posizione}`, titolo: `E${posizione}`, punti: 2, puntiMax: 2, manuale: false, ...o,
});
const riga = (o: Partial<Riga> & { studentId: string; nome: string }): Riga => ({
  stato: "consegnato", recupero: false, menoEsercizi: false, celle: [cella(0), cella(1)],
  ottenuto: 4, totaleStudente: 4, finale: 4, percentuale: 100, uscite: 0, secondiFuori: 0, eventi: [], pubblicata: false, ...o,
});

function risultati(o: Partial<RisultatiJson> = {}): RisultatiJson {
  return {
    stato: "CHIUSA",
    totalePieno: 4,
    colonne: [{ posizione: 0, punti: 2 }, { posizione: 1, punti: 2 }],
    righe: [
      riga({ studentId: "s1", nome: "Anna Bianchi" }),
      riga({
        studentId: "s2", nome: "Carlo Rossi", celle: [cella(0), cella(1, { punti: 1.25, manuale: true })],
        ottenuto: 3.25, finale: 3.25, percentuale: 81.25, uscite: 2, secondiFuori: 75,
        eventi: [
          { tipo: "USCITA", motivo: "SCHEDA", at: "2026-10-23T08:10:00.000Z", durataMs: null },
          { tipo: "RIENTRO", motivo: null, at: "2026-10-23T08:11:15.000Z", durataMs: 75_000 },
        ],
      }),
      riga({ studentId: "s3", nome: "Dario Verdi", stato: "assente", celle: [null, null], ottenuto: 0, totaleStudente: 0, finale: 0, percentuale: 0 }),
    ],
    ...o,
  };
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
let attuali: RisultatiJson;

beforeEach(() => {
  attuali = risultati();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? "GET";
    if (metodo === "GET" && url === `${API}/risultati`) return json(attuali);
    if (metodo === "GET" && url.startsWith(`${API}/risultati?tentativo=`)) {
      return json({ seed: "seme-dettaglio", content: {}, state: null, punti: 1.25, puntiMax: 2, manuale: true });
    }
    if (metodo === "PUT" && url === `${API}/punti`) return json({ ok: true });
    throw new Error(`rotta non prevista: ${metodo} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

function monta(onPubblica = vi.fn(async () => true)) {
  render(
    <NextIntlClientProvider locale="it" messages={messaggiIt} timeZone="Europe/Rome">
      <RisultatiVerifica compitoId="v1" aggiornamento="x" onPubblica={onPubblica} />
    </NextIntlClientProvider>,
  );
  return { onPubblica };
}

const chiamate = (metodo: string, url: string) =>
  fetchMock.mock.calls.filter(([u, init]) => u === url && ((init as RequestInit | undefined)?.method ?? "GET") === metodo);

describe("RisultatiVerifica", () => {
  it("tabella studenti × esercizi con totale, % e uscite; la cella manuale è evidenziata", async () => {
    monta();
    const tabella = await screen.findByRole("table");
    expect(chiamate("GET", `${API}/risultati`)).toHaveLength(1);
    expect(within(tabella).getByRole("columnheader", { name: /Esercizio 1/ })).toBeInTheDocument();
    const carlo = within(tabella).getByText("Carlo Rossi").closest("tr")!;
    const manuale = within(carlo).getByRole("button", { name: "Esercizio 2 di Carlo Rossi: 1,25 su 2" });
    expect(manuale.className).toContain("border-brand-orange");
    expect(within(manuale).getByText(r.modificato)).toBeInTheDocument();
    const auto = within(carlo).getByRole("button", { name: "Esercizio 1 di Carlo Rossi: 2 su 2" });
    expect(auto.className).not.toContain("border-brand-orange");
    expect(within(carlo).getByText("3,25")).toBeInTheDocument();
    expect(within(carlo).getByText("81,25%")).toBeInTheDocument();
    const dario = within(tabella).getByText("Dario Verdi").closest("tr")!;
    expect(within(dario).getByText(r.assente)).toBeInTheDocument();
  });

  it("clic su una cella: la revisione e il salvataggio dei punti con PUT .../punti", async () => {
    monta();
    fireEvent.click(await screen.findByRole("button", { name: "Esercizio 2 di Carlo Rossi: 1,25 su 2" }));
    const dialogo = await screen.findByRole("dialog");
    expect(await within(dialogo).findByTestId("revisione")).toHaveTextContent("seme-dettaglio");
    expect(chiamate("GET", `${API}/risultati?tentativo=t1`)).toHaveLength(1);

    const campo = within(dialogo).getByLabelText("Punti (da 0 a 2, a passi di 0,25)");
    fireEvent.change(campo, { target: { value: "1,3" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: r.salva }));
    expect(await within(dialogo).findByRole("alert")).toBeInTheDocument();
    expect(chiamate("PUT", `${API}/punti`)).toHaveLength(0);

    fireEvent.change(campo, { target: { value: "1,25" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: r.salva }));
    await waitFor(() => expect(chiamate("PUT", `${API}/punti`)).toHaveLength(1));
    const [, init] = chiamate("PUT", `${API}/punti`)[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ tentativoId: "t1", punti: 1.25 });
    await waitFor(() => expect(chiamate("GET", `${API}/risultati`)).toHaveLength(2));
  });

  it("«Torna al calcolo automatico» manda punti null", async () => {
    monta();
    fireEvent.click(await screen.findByRole("button", { name: "Esercizio 2 di Carlo Rossi: 1,25 su 2" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(await within(dialogo).findByRole("button", { name: r.automatico }));
    await waitFor(() => expect(chiamate("PUT", `${API}/punti`)).toHaveLength(1));
    expect(JSON.parse((chiamate("PUT", `${API}/punti`)[0]![1] as RequestInit).body as string)).toEqual({ tentativoId: "t1", punti: null });
  });

  it("clic sulle uscite: il dettaglio orario", async () => {
    monta();
    fireEvent.click(await screen.findByRole("button", { name: "2 uscite" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("10:10:00 — uscita (scheda)")).toBeInTheDocument();
    expect(within(dialogo).getByText("10:11:15 — rientro dopo 01:15")).toBeInTheDocument();
  });

  it("«Pubblica i risultati» in CHIUSA; in PUBBLICATA «Pubblica i nuovi» solo con prove non pubblicate", async () => {
    const { onPubblica } = monta();
    fireEvent.click(await screen.findByRole("button", { name: r.pubblica }));
    await waitFor(() => expect(onPubblica).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(chiamate("GET", `${API}/risultati`)).toHaveLength(2));
  });

  it("una pubblicazione che fallisce riabilita il pulsante", async () => {
    monta(vi.fn(async () => { throw new Error("rete assente"); }));
    const pulsante = await screen.findByRole("button", { name: r.pubblica });
    fireEvent.click(pulsante);
    await waitFor(() => expect(pulsante).toBeEnabled());
  });

  it("in PUBBLICATA con tutto pubblicato nessun pulsante; con un recupero consegnato «Pubblica i nuovi»", async () => {
    attuali = risultati({ stato: "PUBBLICATA", righe: [riga({ studentId: "s1", nome: "Anna Bianchi", pubblicata: true })] });
    monta();
    expect(await screen.findByText(r.pubblicati)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: r.pubblica })).toBeNull();
    expect(screen.queryByRole("button", { name: r.pubblicaNuovi })).toBeNull();
  });

  it("in PUBBLICATA con una prova consegnata non pubblicata ⇒ «Pubblica i nuovi»", async () => {
    attuali = risultati({
      stato: "PUBBLICATA",
      righe: [riga({ studentId: "s1", nome: "Anna Bianchi", pubblicata: true }), riga({ studentId: "s2", nome: "Carlo Rossi", recupero: true })],
    });
    monta();
    expect(await screen.findByRole("button", { name: r.pubblicaNuovi })).toBeInTheDocument();
    expect(screen.getByText(r.nonPubblicato)).toBeInTheDocument();
  });
});
