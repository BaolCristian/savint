import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import type { Riepilogo } from "@/lib/esercizi/estrazione";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/components/esercizi/player/player-esercizio-lazy", () => ({
  PlayerEsercizioLazy: (props: { esercizioId: string }) => <div data-testid="player" data-esercizio-id={props.esercizioId} />,
}));

import { NuovoCompitoClient, type NuovoCompitoProps } from "../nuovo-compito-client";

const CLASSI = [
  { id: "c1", nome: "2ª B", anno: 2 },
  { id: "c2", nome: "3ª A", anno: 3 },
];
const PROPS: NuovoCompitoProps = {
  classi: CLASSI,
  argomentiPerAnno: { "2": [{ argomento: "Equazioni", quanti: 12 }, { argomento: "Percentuali", quanti: 4 }] },
  raccolte: [{ id: "r1", nome: "Percentuali 2ª", esercizi: 6 }],
  catalogo: [
    { id: "e1", titolo: "Lo sconto", argomento: "Percentuali", anno: 2 },
    { id: "e2", titolo: "Il punto di pareggio", argomento: "Equazioni", anno: 2 },
    { id: "e9", titolo: "Il teorema", argomento: "Geometria", anno: 3 },
  ],
  iniziale: { classeId: "c1", blocchi: [{ tipo: "raccolta", contenitoreId: "r1", quanti: 2 }], modello: null },
  semeIniziale: "s0",
  locale: "it",
};

const es = (n: number) => ({ esercizioId: `e${n}`, versioneId: `v${n}`, titolo: `Esercizio ${n}`, content: { n } });

function riepilogo(p: Partial<Riepilogo> = {}): Riepilogo {
  return {
    blocchi: [{ etichetta: "Percentuali 2ª", richiesti: 2, disponibili: 6, nonDisponibili: [] }],
    duplicatiTolti: 0,
    totale: 2,
    sufficiente: true,
    esercizi: [es(1), es(2)],
    ...p,
  };
}

type Risposta = { status: number; body: unknown };
let risposteEstrai: ((corpo: Record<string, unknown>) => Risposta) | null;
let risposteAssegna: Risposta[];
const chiamate = (url: string) =>
  vi.mocked(global.fetch).mock.calls.filter(([u]) => String(u) === url).map(([, init]) => JSON.parse(String(init!.body)));

beforeEach(() => {
  push.mockReset();
  risposteEstrai = () => ({ status: 200, body: riepilogo() });
  risposteAssegna = [{ status: 201, body: { compitoId: "comp9" } }];
  global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const corpo = JSON.parse(String(init?.body ?? "{}"));
    const r = String(url) === "/api/esercizi/compiti/estrai" ? risposteEstrai!(corpo) : risposteAssegna.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
});

function rendi(props: Partial<NuovoCompitoProps> = {}) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <NuovoCompitoClient {...PROPS} {...props} />
    </NextIntlClientProvider>,
  );
}

const assegna = () => screen.getByRole("button", { name: /^Assegna a/ });
const attendiRiepilogo = () => screen.findByText(/Ogni studente riceverà/, {}, { timeout: 2000 });

describe("NuovoCompitoClient", () => {
  it("chiede il riepilogo a /estrai con classe, blocchi, seme e modo", async () => {
    rendi();
    await attendiRiepilogo();
    expect(chiamate("/api/esercizi/compiti/estrai").at(-1)).toEqual({
      classeId: "c1",
      blocchi: [{ tipo: "raccolta", contenitoreId: "r1", quanti: 2 }],
      seme: "s0",
      modo: "CLASSE",
    });
  });

  it("cambiare i blocchi rifà la richiesta con i blocchi nuovi (un argomento senza anno: lo mette la classe)", async () => {
    rendi();
    await attendiRiepilogo();
    fireEvent.click(screen.getByRole("button", { name: "+ Aggiungi da un argomento" }));
    fireEvent.click(screen.getByRole("button", { name: /Equazioni — 12 disponibili/ }));
    await waitFor(
      () =>
        expect(chiamate("/api/esercizi/compiti/estrai").at(-1)!.blocchi).toEqual([
          { tipo: "raccolta", contenitoreId: "r1", quanti: 2 },
          { tipo: "argomento", argomento: "Equazioni", quanti: 5 },
        ]),
      { timeout: 2000 },
    );
  });

  it("cambiare il numero di un blocco rifà la richiesta, una sola volta dopo una raffica (debounce)", async () => {
    rendi();
    await attendiRiepilogo();
    const prima = chiamate("/api/esercizi/compiti/estrai").length;
    const campo = screen.getByLabelText("Quanti esercizi prendere da Percentuali 2ª");
    fireEvent.change(campo, { target: { value: "3" } });
    fireEvent.change(campo, { target: { value: "4" } });
    await waitFor(() => expect(chiamate("/api/esercizi/compiti/estrai").length).toBe(prima + 1), { timeout: 2000 });
    expect(chiamate("/api/esercizi/compiti/estrai").at(-1)!.blocchi).toEqual([{ tipo: "raccolta", contenitoreId: "r1", quanti: 4 }]);
  });

  it("scegliere esercizi a mano crea un blocco \"scelti\" con \"tutti e N\"", async () => {
    rendi();
    await attendiRiepilogo();
    fireEvent.click(screen.getByRole("button", { name: "+ scegli esercizi" }));
    fireEvent.change(screen.getByLabelText("Cerca per titolo"), { target: { value: "sconto" } });
    fireEvent.click(screen.getByRole("button", { name: /Lo sconto/ }));
    fireEvent.click(screen.getByRole("button", { name: "+ scegli esercizi" }));
    fireEvent.change(screen.getByLabelText("Cerca per titolo"), { target: { value: "pareggio" } });
    fireEvent.click(screen.getByRole("button", { name: /Il punto di pareggio/ }));
    expect(screen.getByText("tutti e 2")).toBeInTheDocument();
    await waitFor(
      () =>
        expect(chiamate("/api/esercizi/compiti/estrai").at(-1)!.blocchi).toEqual([
          { tipo: "raccolta", contenitoreId: "r1", quanti: 2 },
          { tipo: "scelti", esercizioIds: ["e1", "e2"] },
        ]),
      { timeout: 2000 },
    );
  });

  it("✕ toglie un blocco", async () => {
    rendi();
    await attendiRiepilogo();
    fireEvent.click(screen.getByRole("button", { name: "Togli il blocco Percentuali 2ª" }));
    expect(screen.getByText(/Aggiungi almeno un blocco/)).toBeInTheDocument();
  });

  it("mostra il totale, la frase del modo e i duplicati tolti", async () => {
    risposteEstrai = () => ({ status: 200, body: riepilogo({ duplicatiTolti: 1 }) });
    rendi();
    expect(await attendiRiepilogo()).toHaveTextContent("Ogni studente riceverà 2 esercizi.");
    expect(screen.getByText(/Gli esercizi sono gli stessi per tutta la classe, estratti adesso/)).toBeInTheDocument();
    expect(screen.getByText("1 esercizio era già in un blocco precedente")).toBeInTheDocument();
    // Un blocco che basta non compare fra gli insufficienti.
    expect(screen.queryByText(/ne chiedi/)).not.toBeInTheDocument();
    expect(assegna()).toBeEnabled();
  });

  it("Assegna (stesse domande) manda le versioni viste e poi apre la pagina del compito", async () => {
    rendi();
    await attendiRiepilogo();
    fireEvent.click(assegna());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/esercizi/compiti/comp9"));
    expect(chiamate("/api/esercizi/compiti")[0]).toEqual({
      classeId: "c1",
      blocchi: [{ tipo: "raccolta", contenitoreId: "r1", quanti: 2 }],
      modo: "CLASSE",
      seme: "s0",
      versioniViste: ["v1", "v2"],
    });
  });

  it("Assegna (diverse per studente) NON manda le versioni viste", async () => {
    rendi();
    await attendiRiepilogo();
    fireEvent.click(screen.getByLabelText("Domande diverse per ogni studente"));
    await waitFor(() => expect(chiamate("/api/esercizi/compiti/estrai").at(-1)!.modo).toBe("STUDENTE"), { timeout: 2000 });
    await waitFor(() => expect(assegna()).toBeEnabled());
    expect(screen.getByText(/Ogni studente riceve la sua estrazione/)).toBeInTheDocument();
    fireEvent.click(assegna());
    await waitFor(() => expect(push).toHaveBeenCalled());
    const corpo = chiamate("/api/esercizi/compiti")[0];
    expect(corpo.modo).toBe("STUDENTE");
    expect(corpo).not.toHaveProperty("versioniViste");
  });

  it("409 estrazione_cambiata: mostra l'avviso e il riepilogo nuovo, e il nuovo Assegna manda le versioni nuove", async () => {
    risposteAssegna = [
      { status: 409, body: { error: "estrazione_cambiata", riepilogo: riepilogo({ esercizi: [es(3), es(4)] }) } },
      { status: 201, body: { compitoId: "comp9" } },
    ];
    rendi();
    await attendiRiepilogo();
    fireEvent.click(assegna());
    expect(
      await screen.findByText("Gli esercizi disponibili sono cambiati: controlla l'anteprima e premi di nuovo Assegna"),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Anteprima come la vedono i ragazzi" }));
    expect(screen.getByText("Esercizio 3")).toBeInTheDocument();
    fireEvent.click(assegna());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(chiamate("/api/esercizi/compiti")[1].versioniViste).toEqual(["v3", "v4"]);
  });

  it("un blocco insufficiente lo dice per quel blocco e disabilita Assegna", async () => {
    risposteEstrai = () => ({
      status: 200,
      body: riepilogo({
        blocchi: [{ etichetta: "Equazioni", richiesti: 5, disponibili: 3, nonDisponibili: [] }],
        totale: 5,
        sufficiente: false,
        esercizi: [],
      }),
    });
    rendi();
    expect(await screen.findByText("Equazioni: ne chiedi 5, ce ne sono 3", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(assegna()).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Anteprima come la vedono i ragazzi" })).not.toBeInTheDocument();
  });

  it("nel modo diverse per studente l'insufficienza dice che il numero è garantito per tutti", async () => {
    risposteEstrai = (c) => ({
      status: 200,
      body:
        c.modo === "STUDENTE"
          ? riepilogo({ blocchi: [{ etichetta: "Equazioni", richiesti: 5, disponibili: 3, nonDisponibili: [] }], totale: 5, sufficiente: false, esercizi: [] })
          : riepilogo(),
    });
    rendi();
    await attendiRiepilogo();
    fireEvent.click(screen.getByLabelText("Domande diverse per ogni studente"));
    expect(
      await screen.findByText(
        "Equazioni: ne chiedi 5, ma con domande diverse per ogni studente ne sono garantiti solo 3",
        {},
        { timeout: 2000 },
      ),
    ).toBeInTheDocument();
    expect(assegna()).toBeDisabled();
  });

  it("uno scelto non più disponibile è nominato", async () => {
    risposteEstrai = () => ({
      status: 200,
      body: riepilogo({
        blocchi: [{ etichetta: "Esercizi scelti", richiesti: 2, disponibili: 1, nonDisponibili: ["Lo sconto"] }],
        sufficiente: false,
        esercizi: [],
      }),
    });
    rendi();
    expect(await screen.findByText("Lo sconto non è più disponibile", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByText("Esercizi scelti: ne hai scelti 2, ne sono disponibili 1")).toBeInTheDocument();
  });

  it("senza classe niente riepilogo e Assegna disabilitato", async () => {
    rendi({ iniziale: { ...PROPS.iniziale, classeId: "" } });
    expect(screen.getByRole("button", { name: "Assegna" })).toBeDisabled();
    expect(screen.getByText(/Scegli la classe e aggiungi almeno un blocco/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 500));
    expect(chiamate("/api/esercizi/compiti/estrai")).toHaveLength(0);
  });

  it("l'anteprima mostra gli esercizi del riepilogo nel modo stesse domande", async () => {
    rendi();
    await attendiRiepilogo();
    fireEvent.click(screen.getByRole("button", { name: "Anteprima come la vedono i ragazzi" }));
    expect(screen.getByText("Esercizio 1 di 2")).toBeInTheDocument();
    expect(screen.getByTestId("player")).toHaveAttribute("data-esercizio-id", "e1");
    expect(screen.queryByText("Esempio: ogni studente avrà la sua estrazione")).not.toBeInTheDocument();
  });

  it("nel modo diverse per studente l'anteprima è un esempio", async () => {
    rendi();
    await attendiRiepilogo();
    fireEvent.click(screen.getByLabelText("Domande diverse per ogni studente"));
    await waitFor(() => expect(chiamate("/api/esercizi/compiti/estrai").at(-1)!.modo).toBe("STUDENTE"), { timeout: 2000 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Anteprima come la vedono i ragazzi" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Anteprima come la vedono i ragazzi" }));
    expect(screen.getByText("Esempio: ogni studente avrà la sua estrazione")).toBeInTheDocument();
  });

  it("Estrai di nuovo chiede un'estrazione con un seme nuovo", async () => {
    rendi();
    await attendiRiepilogo();
    fireEvent.click(screen.getByRole("button", { name: "Estrai di nuovo" }));
    await waitFor(() => expect(chiamate("/api/esercizi/compiti/estrai").at(-1)!.seme).not.toBe("s0"), { timeout: 2000 });
  });

  it("Salva anche come modello manda il nome; partendo da un modello manda modelloId", async () => {
    rendi({ iniziale: { ...PROPS.iniziale, modello: { id: "m1", nome: "Verifica" } } });
    await attendiRiepilogo();
    fireEvent.click(screen.getByLabelText("Salva anche come modello"));
    const nome = screen.getByLabelText("Nome del modello");
    fireEvent.change(nome, { target: { value: "Ripasso percentuali" } });
    fireEvent.click(assegna());
    await waitFor(() => expect(push).toHaveBeenCalled());
    const corpo = chiamate("/api/esercizi/compiti")[0];
    expect(corpo.salvaModello).toEqual({ nome: "Ripasso percentuali" });
    expect(corpo.modelloId).toBe("m1");
  });

  it("le date scelte partono con l'assegnazione", async () => {
    rendi();
    await attendiRiepilogo();
    fireEvent.change(screen.getByLabelText("Scade"), { target: { value: "2099-10-30" } });
    await waitFor(() => expect(assegna()).toBeEnabled());
    fireEvent.click(assegna());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(chiamate("/api/esercizi/compiti")[0].dueAt).toBe("2099-10-30T00:00:00.000Z");
  });

  it("un errore sulle date resta sulla pagina con il suo messaggio", async () => {
    risposteAssegna = [{ status: 400, body: { error: "date_non_valide", dettaglio: "scadenza_nel_passato" } }];
    rendi();
    await attendiRiepilogo();
    fireEvent.click(assegna());
    expect(await screen.findByText("La scadenza è già nel passato.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("il menu argomenti mostra quelli dell'anno della classe con quanti disponibili", async () => {
    rendi();
    fireEvent.click(screen.getByRole("button", { name: "+ Aggiungi da un argomento" }));
    const menu = screen.getByRole("group", { name: "+ Aggiungi da un argomento" });
    expect(within(menu).getByRole("button", { name: /Percentuali — 4 disponibili/ })).toBeInTheDocument();
  });
});
