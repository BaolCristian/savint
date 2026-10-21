import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";

// Il player vero monta il motore Numbas: qui serve solo sapere che riceve il
// `content` della verifica, in modalità locale, e che "Altri numeri" cambia
// il sorteggio (stesso stub di anteprima-docente-client.test.tsx).
vi.mock("@/components/esercizi/player/player-esercizio-lazy", () => ({
  PlayerEsercizioLazy: (props: { seed: string; soloLocale?: boolean; content: unknown }) => (
    <div data-testid="player" data-seed={props.seed} data-solo-locale={String(props.soloLocale === true)}>
      {JSON.stringify(props.content)}
    </div>
  ),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

import { ImportaClient } from "../importa-client";

const testi = messaggiIt.esercizi.redazione.importa;

function elemento(titolo: string, anno = 2) {
  return { meta: { titolo, argomento: "equazioni", anno, difficolta: 2 }, testo: "x", parti: [] };
}

const ELEMENTI = [elemento("Primo"), elemento("Secondo"), elemento("Terzo")];

const ESITI_CONTROLLO = [
  { indice: 0, stato: "ok", titolo: "Primo", content: { name: "contenuto-primo" } },
  {
    indice: 1,
    stato: "invalido",
    titolo: "Secondo",
    problemi: [{ percorso: "meta.anno", messaggio: "deve essere un numero" }],
  },
  { indice: 2, stato: "gia_presente", titolo: "Terzo", titoloEsistente: "Terzo vecchio" },
];

function risposta(status: number, corpo: unknown) {
  return Promise.resolve(new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } }));
}

const fetchMock = vi.fn();
const writeText = vi.fn();

beforeEach(() => {
  push.mockReset();
  fetchMock.mockReset();
  writeText.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function monta() {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <ImportaClient locale="it" />
    </NextIntlClientProvider>,
  );
}

function incolla(testo: string) {
  fireEvent.change(screen.getByLabelText(testi.incolla), { target: { value: testo } });
}

async function controllaTre() {
  fetchMock.mockImplementationOnce(() => risposta(200, { esiti: ESITI_CONTROLLO }));
  monta();
  incolla(JSON.stringify({ esercizi: ELEMENTI }));
  fireEvent.click(screen.getByRole("button", { name: testi.controlla }));
  await screen.findByText("Primo");
}

describe("ImportaClient", () => {
  it("un testo che non è JSON mostra subito l'errore, senza chiamare il server", async () => {
    monta();
    incolla("questo non è json");
    fireEvent.click(screen.getByRole("button", { name: testi.controlla }));

    expect(await screen.findByRole("alert")).toHaveTextContent(testi.erroreTesto.non_json);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un file .json scelto riempie l'area di testo", async () => {
    monta();
    const file = new File(['{"esercizi": []}'], "esercizi.json", { type: "application/json" });
    // jsdom non implementa `Blob.text()`, che il browser invece ha.
    Object.defineProperty(file, "text", { value: () => Promise.resolve('{"esercizi": []}') });
    fireEvent.change(screen.getByLabelText(testi.file), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByLabelText(testi.incolla)).toHaveValue('{"esercizi": []}'));
  });

  it("manda al controllo gli elementi estratti e mostra una scheda per esito", async () => {
    await controllaTre();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/esercizi/redazione/importa/verifica");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ esercizi: ELEMENTI });

    expect(screen.getAllByRole("article")).toHaveLength(3);
    // L'anteprima del solo esercizio ok, con il content della verifica.
    const player = screen.getByTestId("player");
    expect(player).toHaveAttribute("data-solo-locale", "true");
    expect(player.textContent).toContain("contenuto-primo");
    // L'errore in chiaro, e il doppione con il titolo esistente.
    expect(screen.getByText(/meta\.anno/)).toBeInTheDocument();
    expect(screen.getByText(/Terzo vecchio/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importa 1 esercizio" })).toBeEnabled();
  });

  it("\"Altri numeri\" cambia il sorteggio dell'anteprima", async () => {
    await controllaTre();
    const prima = screen.getByTestId("player").getAttribute("data-seed");
    fireEvent.click(screen.getByRole("button", { name: testi.altriNumeri }));
    expect(screen.getByTestId("player").getAttribute("data-seed")).not.toBe(prima);
  });

  it("\"Copia l'errore per l'IA\" copia un testo con il percorso del campo", async () => {
    await controllaTre();
    const scheda = screen.getAllByRole("article")[1]!;
    fireEvent.click(within(scheda).getByRole("button", { name: testi.copiaErrore }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]![0]).toContain("meta.anno");
  });

  it("Importa manda solo gli elementi ok, una volta sola, e torna all'elenco con i conteggi", async () => {
    await controllaTre();

    let rispondi!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => { rispondi = r; }));

    const pulsante = screen.getByRole("button", { name: "Importa 1 esercizio" });
    fireEvent.click(pulsante);
    fireEvent.click(pulsante);

    await waitFor(() => expect(pulsante).toBeDisabled());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe("/api/esercizi/redazione/importa");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ esercizi: [ELEMENTI[0]] });

    rispondi(new Response(JSON.stringify({
      esiti: [{ indice: 0, stato: "creato", titolo: "Primo", esercizioId: "e9" }],
    }), { status: 200 }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/dashboard/esercizi/redazione?importati=1&saltati=2"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("senza esercizi ok il pulsante Importa è disabilitato", async () => {
    fetchMock.mockImplementationOnce(() => risposta(200, { esiti: [ESITI_CONTROLLO[1]] }));
    monta();
    incolla(JSON.stringify([ELEMENTI[1]]));
    fireEvent.click(screen.getByRole("button", { name: testi.controlla }));
    await screen.findByText("Secondo");
    expect(screen.getByRole("button", { name: "Importa 0 esercizi" })).toBeDisabled();
  });

  it("una risposta non 200 del controllo mostra un messaggio leggibile", async () => {
    fetchMock.mockImplementationOnce(() => risposta(429, { error: "rate_limited" }));
    monta();
    incolla(JSON.stringify(ELEMENTI));
    fireEvent.click(screen.getByRole("button", { name: testi.controlla }));
    expect(await screen.findByRole("alert")).toHaveTextContent(testi.erroreServer.rate_limited);
  });

  it("cambiare il testo dopo il controllo toglie gli esiti, per non importare roba vecchia", async () => {
    await controllaTre();
    incolla("[]");
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });
});
