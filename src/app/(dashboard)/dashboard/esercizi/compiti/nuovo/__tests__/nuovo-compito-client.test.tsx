import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import messaggiEn from "@/messages/en.json";
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
let risposteEstrai: ((corpo: Record<string, unknown>) => Risposta | Promise<Risposta>) | null;
let risposteAssegna: Risposta[];
let rispostaFormulario: Risposta;
const chiamate = (url: string) =>
  vi.mocked(global.fetch).mock.calls.filter(([u]) => String(u) === url).map(([, init]) => JSON.parse(String(init!.body)));

beforeEach(() => {
  push.mockReset();
  risposteEstrai = () => ({ status: 200, body: riepilogo() });
  risposteAssegna = [{ status: 201, body: { compitoId: "comp9" } }];
  rispostaFormulario = { status: 201, body: { file: "11111111-2222-3333-4444-555555555555.pdf" } };
  global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    // Il formulario va come multipart (FormData), non come JSON.
    if (String(url) === "/api/esercizi/verifiche/formulari") return new Response(JSON.stringify(rispostaFormulario.body), { status: rispostaFormulario.status });
    const corpo = JSON.parse(String(init?.body ?? "{}"));
    const r = String(url) === "/api/esercizi/compiti/estrai" ? await risposteEstrai!(corpo) : risposteAssegna.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as typeof fetch;
});

function rendi(props: Partial<NuovoCompitoProps> = {}, lingua: "it" | "en" = "it") {
  return render(
    <NextIntlClientProvider locale={lingua} messages={lingua === "en" ? messaggiEn : messaggiIt}>
      <NuovoCompitoClient {...PROPS} {...props} />
    </NextIntlClientProvider>,
  );
}

/** Una risposta di /estrai che arriva quando la prova lo decide. */
function differita() {
  let risolvi!: (r: Risposta) => void;
  const promessa = new Promise<Risposta>((ok) => (risolvi = ok));
  return { promessa, risolvi };
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
    rendi({ iniziale: { ...PROPS.iniziale, blocchi: [{ tipo: "scelti", esercizioIds: ["e1", "e2"] }] } });
    expect(await screen.findByText("Lo sconto non è più disponibile", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByText("Scelti a mano: ne hai scelti 2, ne sono disponibili 1")).toBeInTheDocument();
  });

  it("le righe insufficienti di scelti e raccolta non disponibile usano le parole della pagina, non quelle (italiane) del server", async () => {
    risposteEstrai = () => ({
      status: 200,
      body: riepilogo({
        blocchi: [
          { etichetta: "Esercizi scelti", richiesti: 2, disponibili: 1, nonDisponibili: [] },
          { etichetta: "Raccolta non disponibile", richiesti: 3, disponibili: 0, nonDisponibili: [] },
        ],
        totale: 5,
        sufficiente: false,
        esercizi: [],
      }),
    });
    rendi(
      {
        iniziale: {
          ...PROPS.iniziale,
          blocchi: [{ tipo: "scelti", esercizioIds: ["e1", "e2"] }, { tipo: "raccolta", contenitoreId: "altrui", quanti: 3 }],
        },
      },
      "en",
    );
    expect(await screen.findByText("Hand-picked: you chose 2, 1 are available", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByText("Collection not available: you ask for 3, there are 0")).toBeInTheDocument();
  });

  it("un riepilogo insufficiente non promette il totale: dice che mancano esercizi", async () => {
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
    expect(await screen.findByText("Mancano esercizi: correggi i blocchi segnati in rosso.", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByText(/Ogni studente riceverà/)).toBeNull();
  });

  it("la frase del modo è quella del riepilogo mostrato, non del modo appena scelto", async () => {
    const studente = differita();
    risposteEstrai = (c) => (c.modo === "STUDENTE" ? studente.promessa : { status: 200, body: riepilogo() });
    rendi();
    await attendiRiepilogo();
    fireEvent.click(screen.getByLabelText("Domande diverse per ogni studente"));
    await waitFor(() => expect(chiamate("/api/esercizi/compiti/estrai").at(-1)!.modo).toBe("STUDENTE"), { timeout: 2000 });
    // Il riepilogo a schermo è ancora quello "stesse domande".
    expect(screen.getByText(/Gli esercizi sono gli stessi per tutta la classe/)).toBeInTheDocument();
    expect(screen.queryByText(/Ogni studente riceve la sua estrazione/)).toBeNull();
    studente.risolvi({ status: 200, body: riepilogo() });
    expect(await screen.findByText(/Ogni studente riceve la sua estrazione/, {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("due risposte di /estrai arrivate al contrario: la più vecchia si ignora", async () => {
    const vecchia = differita();
    risposteEstrai = (c) =>
      (c.blocchi as { quanti: number }[])[0]!.quanti === 2 ? vecchia.promessa : { status: 200, body: riepilogo({ totale: 3 }) };
    rendi();
    await waitFor(() => expect(chiamate("/api/esercizi/compiti/estrai")).toHaveLength(1), { timeout: 2000 });
    fireEvent.change(screen.getByLabelText("Quanti esercizi prendere da Percentuali 2ª"), { target: { value: "3" } });
    expect(await screen.findByText("Ogni studente riceverà 3 esercizi.", {}, { timeout: 2000 })).toBeInTheDocument();
    vecchia.risolvi({ status: 200, body: riepilogo({ totale: 2 }) });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText("Ogni studente riceverà 3 esercizi.")).toBeInTheDocument();
    expect(screen.queryByText("Ogni studente riceverà 2 esercizi.")).toBeNull();
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

// Modalità verifica (Task 7): lo stesso Nuovo compito, con l'interruttore
// Compito / Verifica in cima. Una verifica ha durata e avvio al posto delle
// date, punti e misure PDP sui blocchi, formulario e strumenti.
describe("NuovoCompitoClient — modalità verifica", () => {
  const crea = () => screen.getByRole("button", { name: /^Crea la verifica/ });
  const passaAVerifica = () => fireEvent.click(screen.getByRole("radio", { name: "Verifica" }));
  const scriviDurata = (minuti: string) => fireEvent.change(screen.getByLabelText("Durata (minuti)"), { target: { value: minuti } });

  it("di default è un compito: nessun campo della verifica", async () => {
    rendi();
    await attendiRiepilogo();
    expect(screen.getByRole("radio", { name: "Compito" })).toBeChecked();
    expect(screen.queryByLabelText("Durata (minuti)")).toBeNull();
    expect(screen.queryByLabelText(/^Punti per esercizio/)).toBeNull();
    expect(screen.queryByText(/Totale della verifica/)).toBeNull();
  });

  it("in modo Verifica le date spariscono e compare la durata; senza durata Crea è disabilitato", async () => {
    rendi();
    await attendiRiepilogo();
    passaAVerifica();
    expect(screen.queryByLabelText("Si apre")).toBeNull();
    expect(screen.queryByLabelText("Scade")).toBeNull();
    expect(screen.getByLabelText("Durata (minuti)")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "quando premo Avvia" })).toBeChecked();
    expect(crea()).toBeDisabled();
    scriviDurata("50");
    await waitFor(() => expect(crea()).toBeEnabled());
    scriviDurata("3");
    expect(crea()).toBeDisabled();
  });

  it("Crea manda tipo, verifica e i blocchi con punti e quantiPdp, poi apre la pagina della verifica", async () => {
    rendi();
    await attendiRiepilogo();
    passaAVerifica();
    fireEvent.change(screen.getByLabelText("Quanti esercizi prendere da Percentuali 2ª"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Punti per esercizio di Percentuali 2ª"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Quanti per gli studenti con meno esercizi da Percentuali 2ª"), { target: { value: "3" } });
    scriviDurata("50");
    await waitFor(() => expect(crea()).toBeEnabled(), { timeout: 2000 });
    fireEvent.click(crea());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/esercizi/verifiche/comp9"));
    expect(chiamate("/api/esercizi/compiti")[0]).toEqual({
      classeId: "c1",
      blocchi: [{ tipo: "raccolta", contenitoreId: "r1", quanti: 5, punti: 2, quantiPdp: 3 }],
      modo: "CLASSE",
      seme: "s0",
      versioniViste: ["v1", "v2"],
      tipo: "VERIFICA",
      verifica: { durataMinuti: 50, calcolatrice: "SOLO_PDP", formulario: "NESSUNO" },
    });
  });

  it("i punti e i quanti per chi ha meno esercizi non cambiano il riepilogo chiesto a /estrai", async () => {
    rendi();
    await attendiRiepilogo();
    passaAVerifica();
    fireEvent.change(screen.getByLabelText("Punti per esercizio di Percentuali 2ª"), { target: { value: "2" } });
    await waitFor(() => expect(screen.getByText("Totale della verifica: 4 punti")).toBeInTheDocument());
    for (const corpo of chiamate("/api/esercizi/compiti/estrai")) expect(corpo.blocchi).toEqual([{ tipo: "raccolta", contenitoreId: "r1", quanti: 2 }]);
  });

  it("«quanti per chi ha meno esercizi» segue quanti finché il docente non lo tocca", async () => {
    rendi();
    await attendiRiepilogo();
    passaAVerifica();
    const quanti = screen.getByLabelText("Quanti esercizi prendere da Percentuali 2ª");
    const pdp = screen.getByLabelText("Quanti per gli studenti con meno esercizi da Percentuali 2ª");
    expect(pdp).toHaveValue(2);
    fireEvent.change(quanti, { target: { value: "4" } });
    expect(pdp).toHaveValue(4);
    fireEvent.change(pdp, { target: { value: "1" } });
    fireEvent.change(quanti, { target: { value: "6" } });
    expect(pdp).toHaveValue(1);
  });

  it("totale dei punti e quanti esercizi per chi ha meno esercizi", async () => {
    rendi();
    await attendiRiepilogo();
    passaAVerifica();
    fireEvent.change(screen.getByLabelText("Quanti esercizi prendere da Percentuali 2ª"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Punti per esercizio di Percentuali 2ª"), { target: { value: "2" } });
    expect(screen.getByText("Totale della verifica: 10 punti")).toBeInTheDocument();
    expect(screen.getByText("Con meno esercizi: 5 esercizi")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Punti per esercizio di Percentuali 2ª"), { target: { value: "1.5" } });
    expect(screen.getByText("Totale della verifica: 7,5 punti")).toBeInTheDocument();
  });

  it("con zero esercizi per chi ha meno esercizi: avviso e Crea disabilitato", async () => {
    rendi();
    await attendiRiepilogo();
    passaAVerifica();
    scriviDurata("50");
    await waitFor(() => expect(crea()).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Quanti per gli studenti con meno esercizi da Percentuali 2ª"), { target: { value: "0" } });
    expect(screen.getByText("Con meno esercizi: 0 esercizi")).toBeInTheDocument();
    expect(screen.getByText(/non avrebbe nessun esercizio/)).toBeInTheDocument();
    expect(crea()).toBeDisabled();
  });

  it("un blocco scelto a mano: la spunta «non per PDP» manda nonPerPdp", async () => {
    rendi({ iniziale: { ...PROPS.iniziale, blocchi: [{ tipo: "scelti", esercizioIds: ["e1", "e2"] }] } });
    await attendiRiepilogo();
    passaAVerifica();
    fireEvent.click(screen.getByLabelText("Il punto di pareggio: non per PDP"));
    expect(screen.getByText("Con meno esercizi: 1 esercizio")).toBeInTheDocument();
    scriviDurata("50");
    await waitFor(() => expect(crea()).toBeEnabled());
    fireEvent.click(crea());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(chiamate("/api/esercizi/compiti")[0].blocchi).toEqual([
      { tipo: "scelti", esercizioIds: ["e1", "e2"], punti: 1, nonPerPdp: ["e2"] },
    ]);
  });

  it("«a un orario» manda avvioProgrammatoAt come ISO; senza orario Crea è disabilitato", async () => {
    rendi();
    await attendiRiepilogo();
    passaAVerifica();
    scriviDurata("60");
    fireEvent.click(screen.getByRole("radio", { name: "a un orario" }));
    expect(crea()).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Orario di avvio"), { target: { value: "2099-05-04T08:30" } });
    await waitFor(() => expect(crea()).toBeEnabled());
    fireEvent.click(crea());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(chiamate("/api/esercizi/compiti")[0].verifica).toEqual({
      durataMinuti: 60,
      avvioProgrammatoAt: new Date("2099-05-04T08:30").toISOString(),
      calcolatrice: "SOLO_PDP",
      formulario: "NESSUNO",
    });
  });

  it("caricare il formulario lo manda subito, abilita il suo strumento e porta formularioFile nel corpo", async () => {
    rendi();
    await attendiRiepilogo();
    passaAVerifica();
    expect(screen.getByLabelText("Formulario")).toBeDisabled();
    const file = new File(["%PDF-1.4"], "formule.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Formulario (facoltativo)"), { target: { files: [file] } });
    expect(await screen.findByText("formule.pdf")).toBeInTheDocument();
    const upload = vi.mocked(global.fetch).mock.calls.find(([u]) => String(u) === "/api/esercizi/verifiche/formulari")!;
    expect((upload[1]!.body as FormData).get("file")).toBeInstanceOf(File);
    expect(screen.getByLabelText("Formulario")).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Calcolatrice"), { target: { value: "TUTTI" } });
    scriviDurata("50");
    await waitFor(() => expect(crea()).toBeEnabled());
    fireEvent.click(crea());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(chiamate("/api/esercizi/compiti")[0].verifica).toEqual({
      durataMinuti: 50,
      calcolatrice: "TUTTI",
      formulario: "SOLO_PDP",
      formularioFile: "11111111-2222-3333-4444-555555555555.pdf",
    });
  });

  it("«Togli» toglie il formulario; un file non ammesso lo dice", async () => {
    rendi();
    await attendiRiepilogo();
    passaAVerifica();
    fireEvent.change(screen.getByLabelText("Formulario (facoltativo)"), { target: { files: [new File(["x"], "f.pdf", { type: "application/pdf" })] } });
    fireEvent.click(await screen.findByRole("button", { name: "Togli" }));
    expect(screen.queryByText("f.pdf")).toBeNull();
    expect(screen.getByLabelText("Formulario")).toBeDisabled();
    rispostaFormulario = { status: 400, body: { error: "troppo_grande" } };
    fireEvent.change(screen.getByLabelText("Formulario (facoltativo)"), { target: { files: [new File(["x"], "g.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByText("Il file è troppo grande: al massimo 10 MB.")).toBeInTheDocument();
  });

  it("tornando a Compito il corpo è quello di un compito: niente tipo, verifica, punti", async () => {
    rendi();
    await attendiRiepilogo();
    passaAVerifica();
    fireEvent.change(screen.getByLabelText("Punti per esercizio di Percentuali 2ª"), { target: { value: "2" } });
    scriviDurata("50");
    fireEvent.click(screen.getByRole("radio", { name: "Compito" }));
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

  it("parte in modo Verifica con i campi precompilati dai blocchi (modello di una verifica)", async () => {
    rendi({
      iniziale: {
        ...PROPS.iniziale,
        tipo: "VERIFICA",
        blocchi: [{ tipo: "raccolta", contenitoreId: "r1", quanti: 4, punti: 2.5, quantiPdp: 2 }],
      },
    });
    await attendiRiepilogo();
    expect(screen.getByRole("radio", { name: "Verifica" })).toBeChecked();
    expect(screen.getByLabelText("Punti per esercizio di Percentuali 2ª")).toHaveValue(2.5);
    expect(screen.getByLabelText("Quanti per gli studenti con meno esercizi da Percentuali 2ª")).toHaveValue(2);
    expect(screen.getByText("Totale della verifica: 10 punti")).toBeInTheDocument();
  });

  it.each([
    ["verifica_non_valida", /Controlla la durata/],
    ["pdp_senza_esercizi", /non avrebbe nessun esercizio/],
    ["formulario_non_trovato", /Il formulario non si trova più/],
  ])("l'errore %s ha il suo messaggio", async (error, testo) => {
    risposteAssegna = [{ status: 400, body: { error } }];
    rendi();
    await attendiRiepilogo();
    passaAVerifica();
    scriviDurata("50");
    await waitFor(() => expect(crea()).toBeEnabled());
    fireEvent.click(crea());
    expect(await screen.findByRole("alert")).toHaveTextContent(testo);
    expect(push).not.toHaveBeenCalled();
  });
});
