import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";

// L'anteprima (Task 7) monta il vero player dello studente: qui, come in
// anteprima.test.tsx, si sostituisce con uno stub — questo file prova il
// resto del modulo (parti, salvataggio, il dettaglio del rifiuto), non
// l'anteprima stessa.
vi.mock("@/components/esercizi/player/player-esercizio-lazy", () => ({
  PlayerEsercizioLazy: () => <div data-testid="player-stub" />,
}));

import { EditorEsercizio } from "../editor-esercizio";

function montaggio(props: Partial<React.ComponentProps<typeof EditorEsercizio>> = {}) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <EditorEsercizio {...props} />
    </NextIntlClientProvider>,
  );
}

const R = messaggiIt.esercizi.redazione;

type MockFetch = (...args: [string | URL | Request, RequestInit?]) => Promise<Response>;

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ esercizioId: "e1", versione: 1 }), { status: 201 })) as never;
});

describe("EditorEsercizio — le parti", () => {
  it("aggiunge una parte numerica e la rende nel form, senza mai mostrare minValue/maxValue", async () => {
    const { container } = montaggio();
    await userEvent.selectOptions(screen.getByLabelText(R.parti.tipo), "numerica");
    await userEvent.click(screen.getByRole("button", { name: R.parti.aggiungi }));

    expect(screen.getByText(R.parti.numerica.valore)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/minValue|maxValue/i);
  });

  it("aggiunge una parte a scelta con due risposte vuote", async () => {
    montaggio();
    await userEvent.selectOptions(screen.getByLabelText(R.parti.tipo), "scelta");
    await userEvent.click(screen.getByRole("button", { name: R.parti.aggiungi }));

    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("aggiunge una parte a formula", async () => {
    montaggio();
    await userEvent.selectOptions(screen.getByLabelText(R.parti.tipo), "espressione");
    await userEvent.click(screen.getByRole("button", { name: R.parti.aggiungi }));

    expect(screen.getByText(R.parti.espressione.risposta)).toBeInTheDocument();
  });

  it("rimuove una parte", async () => {
    montaggio();
    await userEvent.selectOptions(screen.getByLabelText(R.parti.tipo), "espressione");
    await userEvent.click(screen.getByRole("button", { name: R.parti.aggiungi }));
    expect(screen.getByText(R.parti.espressione.risposta)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: R.parti.rimuovi }));
    expect(screen.queryByText(R.parti.espressione.risposta)).toBeNull();
  });

  // Correzione riportata dalla revisione precedente: `numeroParte` era
  // tradotto in entrambe le lingue ma non renderizzato da nessuna parte, e
  // un esercizio con più parti non mostrava nessuna etichetta "Parte N" oltre
  // all'ordine nel DOM.
  it("numera le parti nell'ordine in cui sono state aggiunte", async () => {
    montaggio();
    await userEvent.click(screen.getByRole("button", { name: R.parti.aggiungi })); // numerica
    await userEvent.selectOptions(screen.getByLabelText(R.parti.tipo), "espressione");
    await userEvent.click(screen.getByRole("button", { name: R.parti.aggiungi }));

    expect(screen.getByText(R.parti.numeroParte.replace("{numero}", "1"))).toBeInTheDocument();
    expect(screen.getByText(R.parti.numeroParte.replace("{numero}", "2"))).toBeInTheDocument();
  });
});

describe("EditorEsercizio — l'anteprima", () => {
  it("mostra l'anteprima con tre riquadri", () => {
    montaggio();
    expect(screen.getAllByTestId("player-stub")).toHaveLength(3);
  });
});

describe("EditorEsercizio — salvataggio e il dettaglio del rifiuto", () => {
  it("un salvataggio riuscito chiama POST e mostra la conferma", async () => {
    const fetchMock: MockFetch = vi.fn(async () => new Response(JSON.stringify({ esercizioId: "e1", versione: 1 }), { status: 201 }));
    global.fetch = fetchMock as never;
    montaggio();

    await userEvent.click(screen.getByRole("button", { name: R.salva }));

    await waitFor(() => expect(screen.getByText(R.salvato)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opzioni] = vi.mocked(fetchMock).mock.calls[0]!;
    expect(String(url)).toContain("/api/esercizi/redazione");
    expect((opzioni as RequestInit).method).toBe("POST");
  });

  it("con un esercizioId, il salvataggio chiama PUT sulla rotta di quell'esercizio", async () => {
    const fetchMock: MockFetch = vi.fn(async () => new Response(JSON.stringify({ esercizioId: "e1", versione: 2 }), { status: 200 }));
    global.fetch = fetchMock as never;
    montaggio({ esercizioId: "e1" });

    await userEvent.click(screen.getByRole("button", { name: R.salva }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, opzioni] = vi.mocked(fetchMock).mock.calls[0]!;
    expect(String(url)).toContain("/api/esercizi/redazione/e1");
    expect((opzioni as RequestInit).method).toBe("PUT");
  });

  // Il cuore del task: la verifica a venti semi rifiuta con {seme, fase,
  // messaggio}, e questo è il dettaglio più prezioso che il sistema sa
  // produrre — deve arrivare intatto sullo schermo, non appiattito su un
  // "salvataggio non riuscito" generico (vedi il brief).
  it("un rifiuto per verifica fallita mostra il seme, la fase e il messaggio", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({
        error: "verifica_fallita",
        dettaglio: { seme: 14, fase: "risposta", messaggio: "la parte \"p0\" ha come risposta \"1/a\", che non valuta a un numero finito" },
      }),
      { status: 422 },
    ));
    global.fetch = fetchMock as never;
    montaggio();

    await userEvent.click(screen.getByRole("button", { name: R.salva }));

    const rifiuto = await screen.findByRole("alert");
    expect(rifiuto.querySelector("[data-seme]")?.textContent).toBe("14");
    expect(rifiuto.querySelector("[data-fase]")?.textContent).toBe(R.erroreVerifica.faseRisposta);
    expect(within(rifiuto).getByText(/non valuta a un numero finito/)).toBeInTheDocument();
    expect(screen.queryByText(R.salvato)).toBeNull();
  });

  it("un conflitto di versione mostra un messaggio dedicato, non il generico", async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ error: "versione_in_conflitto", dettaglio: "un altro salvataggio ha già scritto una versione nel frattempo; riprova" }),
      { status: 409 },
    ));
    global.fetch = fetchMock as never;
    montaggio({ esercizioId: "e1" });

    await userEvent.click(screen.getByRole("button", { name: R.salva }));

    await waitFor(() => expect(screen.getByText(R.erroreSalvataggio.versioneInConflitto)).toBeInTheDocument());
  });

  it("il pulsante «controlla» chiama la rotta di verifica senza salvare", async () => {
    const fetchMock: MockFetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    global.fetch = fetchMock as never;
    montaggio();

    await userEvent.click(screen.getByRole("button", { name: R.verifica }));

    await waitFor(() => expect(screen.getByText(R.verificaOk)).toBeInTheDocument());
    const [url] = vi.mocked(fetchMock).mock.calls[0]!;
    expect(String(url)).toContain("/api/esercizi/redazione/verifica");
  });

  // Giro di correzioni 1: la versione precedente teneva "manca una scelta"
  // come stato locale dentro ParteScelta, che il salvataggio non vedeva —
  // `indiceGiusta` tornava comunque a 0 (un valore VALIDO) nel modello
  // nell'istante stesso della rimozione, e "salva" lo scriveva senza che il
  // docente scegliesse nulla, avviso o no. Qui si preme davvero "salva" e si
  // ispeziona il corpo della richiesta — non l'avviso — riproducendo esattamente
  // il modo in cui la revisione lo ha dimostrato.
  it("rimuovere la risposta corretta blocca il salvataggio finché non se ne sceglie una nuova, e la richiesta non porta mai un indice indovinato", async () => {
    const fetchMock: MockFetch = vi.fn(async () => new Response(JSON.stringify({ esercizioId: "e1", versione: 1 }), { status: 201 }));
    global.fetch = fetchMock as never;
    montaggio();

    await userEvent.selectOptions(screen.getByLabelText(R.parti.tipo), "scelta");
    await userEvent.click(screen.getByRole("button", { name: R.parti.aggiungi }));

    // Una parte nuova parte con due risposte, e il pulsante "rimuovi
    // risposta" è disabilitato a due (MIN_RISPOSTE): ne serve una terza
    // prima di poter rimuovere quella segnata come corretta.
    await userEvent.click(screen.getByRole("button", { name: R.parti.scelta.aggiungiRisposta }));

    // Segna la seconda risposta come corretta, poi la rimuove.
    const radios = screen.getAllByRole("radio");
    await userEvent.click(radios[1]!);
    const bottoniRimuovi = screen.getAllByRole("button", { name: R.parti.scelta.rimuoviRisposta });
    await userEvent.click(bottoniRimuovi[1]!);

    const salvaBtn = screen.getByRole("button", { name: R.salva });
    expect(salvaBtn).toBeDisabled();

    // Il repro esatto della revisione: premere "salva" senza toccare nessun
    // radio. Prima della correzione questo mandava una richiesta con
    // `indiceGiusta: 0`.
    await userEvent.click(salvaBtn);
    expect(fetchMock).not.toHaveBeenCalled();

    // Solo una scelta vera sblocca il salvataggio, e porta l'indice appena
    // scelto — mai un valore preimpostato in silenzio.
    await userEvent.click(screen.getAllByRole("radio")[0]!);
    expect(salvaBtn).not.toBeDisabled();

    await userEvent.click(salvaBtn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const corpo = JSON.parse((vi.mocked(fetchMock).mock.calls[0]![1] as RequestInit).body as string);
    expect(corpo.editor.parti[0].indiceGiusta).toBe(0);
  });
});
