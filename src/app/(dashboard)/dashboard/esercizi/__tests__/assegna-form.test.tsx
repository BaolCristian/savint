import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";

// Task 5 (docente-via-veloce): il modulo che sostituisce cinque schermate e
// tre concetti («contenitore», «batteria», «regola») con uno solo — classe,
// argomento, quanti, entro quando, difficoltà. L'anno NON si chiede: viene
// dalla classe, tranne quando la classe non ne ha uno (una classe creata a
// mano, vedi crea-classe-form.tsx). Sotto i filtri, "quanti esercizi
// corrispondono", aggiornato mentre si sceglie MA con un debounce sulla
// chiamata di rete — vedi il commento su DEBOUNCE_CONTEGGIO_MS nel
// componente. Il conteggio non blocca l'invio: il rifiuto vero resta lato
// server (`esercizi_insufficienti`), il numero qui riduce la sorpresa senza
// eliminarla (design doc, "Rischi accettati").

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { AssegnaForm } from "../assegna-form";

const classeConAnno = { id: "c1", name: "1A", yearLevel: 1 };
const classeSenzaAnno = { id: "c2", name: "Classe a mano", yearLevel: null };

function montaggio(props: Partial<React.ComponentProps<typeof AssegnaForm>> = {}) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <AssegnaForm classi={props.classi ?? [classeConAnno]} candidati={props.candidati ?? []} />
    </NextIntlClientProvider>,
  );
}

const t = messaggiIt.esercizi.assegnaForm;

function rispostaJson(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status });
}

// I timer finti servono davvero: una di queste prove dimostra che due
// modifiche ravvicinate producono UNA sola richiesta di conteggio, e senza
// controllare l'orologio non si puo' asserire.
//
// `shouldAdvanceTime` e' la parte che non si puo' omettere: senza, `waitFor`
// e `findBy*` di testing-library restano appesi — attendono sull'orologio
// VERO, che con i timer finti non avanza piu' — e ogni prova fallisce per
// scadenza dopo cinque secondi invece che per la ragione giusta. Con esso
// l'orologio finto avanza anche da solo, e le due cose convivono.
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AssegnaForm", () => {
  it("mostra classe, argomento, quanti, difficoltà e scadenza, ma non l'anno, quando la classe scelta ne ha già uno", async () => {
    global.fetch = vi.fn(async () => rispostaJson([{ argomento: "Equazioni", quanti: 5 }])) as typeof fetch;
    montaggio({ classi: [classeConAnno] });

    expect(screen.getByLabelText(t.classe)).toBeInTheDocument();
    expect(screen.getByLabelText(t.quanti)).toBeInTheDocument();
    expect(screen.getByLabelText(t.difficolta)).toBeInTheDocument();
    expect(screen.getByLabelText(t.scadenza)).toBeInTheDocument();
    expect(screen.queryByLabelText(t.anno)).toBeNull();

    await vi.runOnlyPendingTimersAsync();
    expect(await screen.findByLabelText(t.argomento)).toBeInTheDocument();
  });

  it("chiede l'anno solo quando la classe scelta non ne ha uno, e non interroga gli argomenti finché non è scritto", async () => {
    global.fetch = vi.fn(async () => rispostaJson([{ argomento: "Equazioni", quanti: 5 }])) as typeof fetch;
    montaggio({ classi: [classeSenzaAnno] });

    expect(screen.getByLabelText(t.anno)).toBeInTheDocument();
    await vi.runOnlyPendingTimersAsync();
    expect(global.fetch).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(t.anno), { target: { value: "2" } });
    await vi.runOnlyPendingTimersAsync();

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const url = new URL((vi.mocked(global.fetch).mock.calls[0]![0] as string), "http://localhost");
    expect(url.searchParams.get("classeId")).toBe("c2");
    expect(url.searchParams.get("anno")).toBe("2");
  });

  it("il conteggio 'quanti corrispondono' aspetta un debounce: cambi ravvicinati di filtro producono UNA sola chiamata di rete", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("argomento=")) return rispostaJson({ quanti: 3 });
      return rispostaJson([
        { argomento: "Equazioni", quanti: 5 },
        { argomento: "Disequazioni", quanti: 2 },
      ]);
    }) as typeof fetch;

    montaggio({ classi: [classeConAnno] });
    await vi.runOnlyPendingTimersAsync(); // elenco argomenti (nessun debounce)
    await screen.findByLabelText(t.argomento);

    const chiamateDopoElenco = vi.mocked(global.fetch).mock.calls.length;

    // Due cambi di difficoltà ravvicinati, entrambi entro la finestra di
    // debounce: deve arrivare una sola richiesta di conteggio, per l'ULTIMO
    // valore scelto.
    fireEvent.change(screen.getByLabelText(t.difficolta), { target: { value: "1" } });
    await vi.advanceTimersByTimeAsync(100);
    fireEvent.change(screen.getByLabelText(t.difficolta), { target: { value: "2" } });
    await vi.advanceTimersByTimeAsync(100);

    expect(vi.mocked(global.fetch).mock.calls.length).toBe(chiamateDopoElenco);

    await vi.advanceTimersByTimeAsync(400);

    const chiamateConteggio = vi
      .mocked(global.fetch)
      .mock.calls.filter(([input]) => String(input).includes("argomento="));
    expect(chiamateConteggio).toHaveLength(1);
    expect(String(chiamateConteggio[0]![0])).toContain("difficoltaMax=2");
  });

  it("mostra quanti esercizi corrispondono, con l'accordo singolare/plurale giusto", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("argomento=")) return rispostaJson({ quanti: 1 });
      return rispostaJson([{ argomento: "Equazioni", quanti: 5 }]);
    }) as typeof fetch;

    montaggio({ classi: [classeConAnno] });
    await vi.runOnlyPendingTimersAsync();
    await screen.findByLabelText(t.argomento);
    await vi.advanceTimersByTimeAsync(400);

    expect(await screen.findByText("1 esercizio disponibile")).toBeInTheDocument();
  });

  it("invia classe, argomento, quanti, apertura e scadenza — senza anno quando la classe ce l'ha già", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/esercizi/compiti/diretto")) return rispostaJson({ compitoId: "comp1" }, 201);
      if (url.includes("argomento=")) return rispostaJson({ quanti: 8 });
      return rispostaJson([{ argomento: "Equazioni", quanti: 8 }]);
      void init;
    }) as typeof fetch;

    montaggio({ classi: [classeConAnno] });
    await vi.runOnlyPendingTimersAsync();
    await screen.findByLabelText(t.argomento);

    fireEvent.change(screen.getByLabelText(t.quanti), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText(t.apertura), { target: { value: "2026-09-10" } });
    fireEvent.change(screen.getByLabelText(t.scadenza), { target: { value: "2026-09-20" } });

    fireEvent.click(screen.getByRole("button", { name: t.assegna }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/esercizi/compiti/diretto",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const chiamata = vi
      .mocked(global.fetch)
      .mock.calls.find(([input]) => String(input).includes("/api/esercizi/compiti/diretto"))!;
    const body = JSON.parse((chiamata[1] as RequestInit).body as string);
    expect(body).toMatchObject({ classeId: "c1", argomento: "Equazioni", quanti: 4 });
    expect(body.anno).toBeUndefined();
    expect(body.opensAt).toBe(new Date("2026-09-10").toISOString());
    expect(body.dueAt).toBe(new Date("2026-09-20").toISOString());

    expect(await screen.findByText(t.assegnato)).toBeInTheDocument();
  });

  it("include l'anno scelto a mano quando la classe non ne ha uno", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/esercizi/compiti/diretto")) return rispostaJson({ compitoId: "comp1" }, 201);
      if (url.includes("argomento=")) return rispostaJson({ quanti: 8 });
      return rispostaJson([{ argomento: "Equazioni", quanti: 8 }]);
    }) as typeof fetch;

    montaggio({ classi: [classeSenzaAnno] });
    fireEvent.change(screen.getByLabelText(t.anno), { target: { value: "3" } });
    await vi.runOnlyPendingTimersAsync();
    await screen.findByLabelText(t.argomento);

    fireEvent.change(screen.getByLabelText(t.quanti), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: t.assegna }));

    await waitFor(() =>
      expect(
        vi.mocked(global.fetch).mock.calls.some(([input]) => String(input).includes("/api/esercizi/compiti/diretto")),
      ).toBe(true),
    );
    const chiamata = vi
      .mocked(global.fetch)
      .mock.calls.find(([input]) => String(input).includes("/api/esercizi/compiti/diretto"))!;
    const body = JSON.parse((chiamata[1] as RequestInit).body as string);
    expect(body).toMatchObject({ anno: 3 });
  });

  // Il caso che conta di più (brief del task): quando l'assegnazione è
  // rifiutata per capienza, il messaggio riporta ENTRAMBI i numeri, non un
  // avviso generico — è il lavoro che assegnaDiretto (dominio) e la rotta
  // hanno già fatto per produrre il dettaglio, e che il conteggio "quanti
  // corrispondono" da solo NON basta a sostituire (design doc: "Il
  // conteggio riduce la sorpresa, non la elimina").
  it("un rifiuto per capienza mostra l'argomento e i due numeri, quanti chiesti e quanti ce n'erano", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/esercizi/compiti/diretto")) {
        return rispostaJson(
          { error: "esercizi_insufficienti", dettaglio: { contenitore: "Equazioni", richiesti: 10, disponibili: 4 } },
          409,
        );
      }
      if (url.includes("argomento=")) return rispostaJson({ quanti: 4 });
      return rispostaJson([{ argomento: "Equazioni", quanti: 4 }]);
    }) as typeof fetch;

    montaggio({ classi: [classeConAnno] });
    await vi.runOnlyPendingTimersAsync();
    await screen.findByLabelText(t.argomento);

    fireEvent.change(screen.getByLabelText(t.quanti), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: t.assegna }));

    // Il messaggio, non la voce di menu: l'argomento compare in entrambi.
    const messaggio = await screen.findByRole("alert");
    expect(messaggio.textContent).toContain("Equazioni");
    expect(messaggio.textContent).toContain("10");
    expect(messaggio.textContent).toContain("4");
  });

  it("mostra il link all'anteprima quando esiste un esercizio candidato per l'argomento e l'anno scelti", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("argomento=")) return rispostaJson({ quanti: 8 });
      return rispostaJson([{ argomento: "Equazioni", quanti: 8 }]);
    }) as typeof fetch;

    montaggio({ classi: [classeConAnno], candidati: [{ id: "ex1", argomento: "Equazioni", anno: 1 }] });
    await vi.runOnlyPendingTimersAsync();
    await screen.findByLabelText(t.argomento);

    const link = await screen.findByRole("link", { name: t.anteprima });
    expect(link).toHaveAttribute("href", "/dashboard/esercizi/anteprima/ex1");
  });

  it("non mostra il link all'anteprima quando non c'è nessun esercizio candidato", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("argomento=")) return rispostaJson({ quanti: 8 });
      return rispostaJson([{ argomento: "Equazioni", quanti: 8 }]);
    }) as typeof fetch;

    montaggio({ classi: [classeConAnno], candidati: [] });
    await vi.runOnlyPendingTimersAsync();
    await screen.findByLabelText(t.argomento);
    await vi.advanceTimersByTimeAsync(400);

    expect(screen.queryByRole("link", { name: t.anteprima })).toBeNull();
  });

  it("l'anteprima è una navigazione (un link), non una scrittura: nessuna fetch oltre a elenco e conteggio", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("argomento=")) return rispostaJson({ quanti: 8 });
      return rispostaJson([{ argomento: "Equazioni", quanti: 8 }]);
    }) as typeof fetch;

    montaggio({ classi: [classeConAnno], candidati: [{ id: "ex1", argomento: "Equazioni", anno: 1 }] });
    await vi.runOnlyPendingTimersAsync();
    await screen.findByLabelText(t.argomento);
    await vi.advanceTimersByTimeAsync(400);

    const link = within(screen.getByRole("link", { name: t.anteprima }));
    expect(link).toBeTruthy();
    const chiamate = vi.mocked(global.fetch).mock.calls.map(([input]) => String(input));
    expect(chiamate.every((u) => u.includes("/api/esercizi/argomenti"))).toBe(true);
  });
});
