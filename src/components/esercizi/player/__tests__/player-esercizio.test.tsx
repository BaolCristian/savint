import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "fs";
import path from "path";
import type { NumbasQuestionJSON } from "@savint/engine";
import messaggiIt from "@/messages/it.json";

// `useRouter` (chiamato da `confermaRicomincio`, dopo che "Ricomincia" ha
// avuto successo): fuori da un vero App Router lancia — nessun test qui sotto
// monta la pagina intera. `mockRefresh` è condiviso e ripulito in
// `beforeEach`, così i test sul "ricomincia" possono verificarne le chiamate.
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

import { PlayerEsercizio } from "../player-esercizio";

const { question } = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "content/esercizi/01-equazione-primo-grado.json"), "utf8"),
) as { question: unknown };

const { question: disequazione } = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "content/esercizi/04-disequazioni-secondo-grado.json"), "utf8"),
) as { question: NumbasQuestionJSON };

const { question: sistemiLineari } = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "content/esercizi/03-sistemi-lineari.json"), "utf8"),
) as { question: NumbasQuestionJSON };

const { question: terminologiaFunzioni } = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "content/esercizi/08-terminologia-funzioni.json"), "utf8"),
) as { question: NumbasQuestionJSON };

const { question: scomposizionePolinomi } = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "content/esercizi/02-scomposizione-polinomi.json"), "utf8"),
) as { question: NumbasQuestionJSON };

const { question: goniometriaValori } = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "content/esercizi/05-goniometria-valori.json"), "utf8"),
) as { question: NumbasQuestionJSON };

// Fixture minimale, non un file sotto content/esercizi/ (compito di un altro
// task): un gapfill con una parte "toccata" (patternmatch, risposta corretta
// "ok") e una parte a scelta singola MAI toccata. Serve solo a dimostrare il
// confine fra "nessuna risposta" e "risposta letterale null" (vedi il test
// "un gap di scelta multipla mai toccato...").
const gapfillConSceltaFixture = {
  name: "Prova gapfill",
  statement: "<p>Prova</p>",
  variables: {},
  parts: [
    {
      type: "gapfill",
      prompt: "<p>Spazio testo: [[0]] — spazio a scelta: [[1]]</p>",
      gaps: [
        { type: "patternmatch", marks: 1, matchMode: "exact", answer: "ok", allowEmpty: false },
        { type: "1_n_2", marks: 1, choices: ["a", "b"], matrix: ["1", "-1"] },
      ],
    },
  ],
} as unknown as NumbasQuestionJSON;

// Fixture minimale per il ramo `m_n_x` di `costruisciParte`: nessun esercizio
// spedito ha variabili nelle righe o nelle colonne di una griglia, quindi
// senza questa fixture quel ramo non è provato da nessun test (fix round 1,
// punto 4). `choices` sono le righe, `answers` le colonne.
const grigliaConVariabiliFixture = {
  name: "Prova griglia",
  statement: "<p>Prova</p>",
  variables: { a: { name: "a", definition: "3" }, b: { name: "b", definition: "5" } },
  parts: [
    {
      type: "m_n_x",
      marks: 0,
      prompt: "<p>Abbina</p>",
      choices: ["riga \\(\\var{a}\\)", "riga fissa"],
      answers: ["colonna \\(\\var{b}\\)", "colonna fissa"],
      matrix: [
        ["1", "-1"],
        ["-1", "1"],
      ],
    },
  ],
} as unknown as NumbasQuestionJSON;

function montaggio(props: Partial<React.ComponentProps<typeof PlayerEsercizio>> = {}) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <PlayerEsercizio
        tentativoId="t1"
        esercizioId="01-equazione-primo-grado"
        seed="seme-di-prova"
        content={question}
        statoIniziale={null}
        lastActivityAt={new Date("2026-09-01T10:00:00Z")}
        locale="it"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mockRefresh.mockClear();
  global.fetch = vi.fn(async () => new Response(
    JSON.stringify({ score: 2, maxScore: 2, feedback: [{ type: "correct", message: "Giusto." }] }),
    { status: 200 },
  )) as never;
});

describe("PlayerEsercizio", () => {
  it("mostra il testo della domanda con le variabili sostituite", async () => {
    const { container } = montaggio();
    await waitFor(() => expect(screen.getByText(/Risolvi/)).toBeInTheDocument());
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("invia la risposta e mostra il feedback che arriva dal server", async () => {
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() => expect(screen.getByText("Giusto.")).toBeInTheDocument());
  });

  it("il punteggio mostrato e' quello del server, non quello locale", async () => {
    global.fetch = vi.fn(async () => new Response(
      JSON.stringify({ score: 0, maxScore: 2, feedback: [{ type: "incorrect", message: "No." }] }),
      { status: 200 },
    )) as never;
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() => expect(screen.getByText(/0\s*\/\s*2/)).toBeInTheDocument());
  });

  it("riprende da uno stato salvato con le risposte al loro posto", async () => {
    const stato = {
      seed: "seme-di-prova", answered: true, submitted: 1, adviceDisplayed: false, revealed: false,
      score: 2, marks: 2,
      parts: [{ path: "p0", answered: true, score: 2, marks: 2, answer: "3" }],
    };
    montaggio({ statoIniziale: stato as never });
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("3"));
  });

  // Fix round 1, punto 2: `restoreQuestion` rinvia da sé le parti già
  // risposte (`applyQuestionState`, engine), quindi al ripristino la parte
  // ha già un `result` fresco. "3" non è la soluzione di questa domanda con
  // questo seme (lo stesso invio a un caricamento fresco dà punteggio
  // locale 0, vedi il test sopra sul disallineamento col server): il
  // feedback riportato deve essere quello "sbagliato" vero, non un riquadro
  // vuoto sotto un punteggio che intanto è corretto.
  it("riprende anche il feedback della parte, non solo la risposta e il punteggio", async () => {
    const stato = {
      seed: "seme-di-prova", answered: true, submitted: 1, adviceDisplayed: false, revealed: false,
      score: 0, marks: 2,
      parts: [{ path: "p0", answered: true, score: 0, marks: 2, answer: "3" }],
    };
    montaggio({ statoIniziale: stato as never });
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("3"));
    expect(screen.getByText("La tua risposta non è corretta.")).toBeInTheDocument();
  });

  it("mostra la fase di errore se il contenuto non si carica", async () => {
    montaggio({ content: { partsMode: "explore", parts: [] } });
    await waitFor(() => expect(screen.getByText(messaggiIt.esercizi.erroreCaricamento)).toBeInTheDocument());
  });

  it("un errore di rete non perde la risposta digitata", async () => {
    global.fetch = vi.fn(async () => { throw new Error("rete giù"); }) as never;
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() => expect(screen.getByText(messaggiIt.esercizi.erroreRete)).toBeInTheDocument());
    expect(screen.getByRole("textbox")).toHaveValue("3");
  });

  // Punto 1 del dispaccio: il motore restituisce il markup autorale
  // (`\var{r1}`), mai quello reso — vale per il prompt ma anche per le
  // scelte di una parte a scelta multipla e per righe/colonne di una
  // griglia. Se il player si limitasse a sostituire il prompt, questo
  // esercizio mostrerebbe agli studenti il markup grezzo `\var{...}` dentro
  // ogni scelta: KaTeX non conosce `\var` e la formula ricadrebbe sul
  // fallback testuale di `Formula`, lasciando la stringa "\var{" visibile.
  it("sostituisce le variabili anche nelle scelte di una parte a scelta multipla, non solo nel prompt", async () => {
    const { container } = montaggio({ content: disequazione, seed: "seme-di-prova" });
    await waitFor(() => expect(container.querySelectorAll(".katex").length).toBeGreaterThan(1));
    expect(container.textContent).not.toMatch(/\\var\{/);
  });

  // Punto 2 del dispaccio: la lingua dello studente va sull'header
  // `x-savint-locale`, altrimenti il feedback torna sempre in italiano.
  it("manda la lingua dello studente nell'header x-savint-locale (italiano di default)", async () => {
    const fetchMock: (...args: [string | URL | Request, RequestInit?]) => Promise<Response> = vi.fn(async () => new Response(
      JSON.stringify({ score: 2, maxScore: 2, feedback: [{ type: "correct", message: "Giusto." }] }),
      { status: 200 },
    ));
    global.fetch = fetchMock as never;
    montaggio({ locale: "it" });
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const opzioni = vi.mocked(fetchMock).mock.calls[0]?.[1];
    expect(opzioni?.headers).toMatchObject({ "x-savint-locale": "it" });
  });

  it("manda x-savint-locale=en quando lo studente lavora in inglese", async () => {
    const fetchMock: (...args: [string | URL | Request, RequestInit?]) => Promise<Response> = vi.fn(async () => new Response(
      JSON.stringify({ score: 2, maxScore: 2, feedback: [{ type: "correct", message: "Correct." }] }),
      { status: 200 },
    ));
    global.fetch = fetchMock as never;
    montaggio({ locale: "en" });
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const opzioni = vi.mocked(fetchMock).mock.calls[0]?.[1];
    expect(opzioni?.headers).toMatchObject({ "x-savint-locale": "en" });
  });

  // Segnalazione del coordinatore: `InputGapfill` rappresenta un gap mai
  // toccato come `null` (l'unica scelta type-legale, `Answer` non ammette
  // `undefined`). Inoltrato così com'è a `GapFillPart#storeAnswer`, un gap a
  // scelta multipla (`1_n_2`/`m_n_2`/`m_n_x`) lo tratta come una risposta
  // vera e la sua `setStudentAnswer` fa `.map()` su quel `null`: un
  // `TypeError` che risale fino a rompere l'invio dell'INTERA parte gapfill
  // (verificato al banco: `Cannot read properties of null (reading 'map')`).
  // Un gap davvero mai risposto deve arrivare al motore come omesso
  // (`undefined`), non come `null`: questo test fallirebbe (per un errore di
  // rete non gestito dovuto all'eccezione) se il player tornasse a inoltrare
  // `null` invariato.
  it("un gap di scelta multipla mai toccato in un gapfill non manda in errore l'invio (null vs omesso)", async () => {
    montaggio({ content: gapfillConSceltaFixture, seed: "seme-gapfill" });
    await waitFor(() => screen.getByRole("textbox"));
    // Solo lo spazio di testo viene compilato: lo spazio a scelta singola
    // resta esattamente come l'ha lasciato `InputGapfill`, cioè `null`.
    await userEvent.type(screen.getByRole("textbox"), "ok");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));

    // Con la conversione corretta, la correzione locale va a buon fine (lo
    // spazio di testo è corretto) e non emerge mai l'errore di rete generico
    // che il player mostrerebbe se la correzione locale avesse lanciato.
    await waitFor(() => expect(screen.getByText("Giusto.")).toBeInTheDocument());
    expect(screen.queryByText(messaggiIt.esercizi.erroreRete)).toBeNull();
  });

  // Fix round 1, punto 1 (Important): il punteggio ottimistico calcolato in
  // locale non deve mai restare in vista quando l'invio al server fallisce.
  // Si conferma prima un punteggio col server (2/2), poi si invia di nuovo
  // con una risposta chiaramente sbagliata (punteggio locale: 0/2) mentre la
  // rete cade: se il player non ripristinasse il valore confermato, lo
  // schermo mostrerebbe 0/2 accanto all'errore di rete — un numero che il
  // server non ha mai confermato.
  it("un errore di rete non lascia in vista il punteggio ottimistico locale", async () => {
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() => expect(screen.getByText(/2\s*\/\s*2/)).toBeInTheDocument());

    global.fetch = vi.fn(async () => { throw new Error("rete giù"); }) as never;
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "999999");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));

    await waitFor(() => expect(screen.getByText(messaggiIt.esercizi.erroreRete)).toBeInTheDocument());
    expect(screen.getByText(/2\s*\/\s*2/)).toBeInTheDocument();
    expect(screen.queryByText(/0\s*\/\s*2/)).toBeNull();
  });

  // Onda finale, punto 5: il riepilogo era un vicolo cieco — punteggio e
  // nient'altro. Su un telefono le uniche uscite erano il tasto indietro e la
  // disconnessione, e una ricarica apriva un tentativo nuovo con un altro
  // seme, rendendo irraggiungibile il punteggio appena preso.
  it("il riepilogo offre due uscite: l'elenco e un nuovo tentativo", async () => {
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await userEvent.click(
      await screen.findByRole("button", { name: messaggiIt.esercizi.completa }),
    );

    await waitFor(() =>
      expect(screen.getByText(messaggiIt.esercizi.tentativoCompletato)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("link", { name: messaggiIt.esercizi.tornaAgliEsercizi }),
    ).toHaveAttribute("href", "/studente");
    // L'esercizio si riapre dal suo indirizzo: un nuovo tentativo, non la
    // stessa pagina già chiusa.
    expect(
      screen.getByRole("link", { name: messaggiIt.esercizi.riprovaEsercizio }),
    ).toHaveAttribute("href", expect.stringContaining("/studente/esercizio/01-equazione-primo-grado"));
  });

  // Onda finale, punto 2: i messaggi del motore portano marcatori (una
  // quindicina in `packages/engine/src/i18n/it.ts`, `<strong>` e `<code>` in
  // testa) e resi come testo semplice lo studente leggeva davvero
  // "<strong>Spazio 0</strong>" — verificato sull'esercizio gapfill.
  it("rende i marcatori del feedback invece di mostrarli allo studente", async () => {
    global.fetch = vi.fn(async () => new Response(
      JSON.stringify({
        score: 1, maxScore: 2,
        feedback: [{ type: "incorrect", message: "<strong>Spazio 0</strong>: sbagliato \\(x^2\\)" }],
      }),
      { status: 200 },
    )) as never;
    const { container } = montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));

    await waitFor(() => expect(container.querySelector("strong")).not.toBeNull());
    expect(container.querySelector("strong")!.textContent).toBe("Spazio 0");
    // Nessun tag rimasto come testo, e la formula dentro il messaggio passa
    // comunque da KaTeX (il motivo per cui non si usa dangerouslySetInnerHTML).
    expect(container.textContent).not.toContain("<strong>");
    expect(container.querySelectorAll(".katex").length).toBeGreaterThan(0);
  });

  // Onda finale, punto 1. Lo stub di `fetch` di questo file finge un server
  // generoso: qualunque richiesta torna con una voce di feedback e 2/2.
  // Nessun test poteva quindi vedere il caso reale peggiore — una parte che
  // il MOTORE considera non risposta. Il server rinvia solo le parti con
  // `answered: true` (engine, `applyQuestionState`) e restituisce
  // `p.result?.feedback ?? []` (`marking.ts`): per un campo lasciato vuoto la
  // risposta HTTP è 200, `feedback: []` e il punteggio invariato. Lo stub qui
  // sotto si comporta così. Prima del fix questo bastava a produrre lo
  // schermo muto visto al banco: nessun messaggio e "Completa il tentativo"
  // in vista dopo un Invia a vuoto.
  it("un Invia a campo vuoto spiega perche' e non sblocca il completamento", async () => {
    const chiamate: unknown[] = [];
    global.fetch = vi.fn(async (...args: unknown[]) => {
      chiamate.push(args);
      // Come la rotta vera su una parte che il motore non considera risposta.
      return new Response(JSON.stringify({ score: 0, maxScore: 2, feedback: [] }), { status: 200 });
    }) as never;

    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    // Nessuna digitazione: si preme Invia sul campo vuoto.
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() => expect(chiamate.length).toBe(1));

    // 1. Lo studente riceve una spiegazione, non il silenzio: quando il
    //    server non manda feedback si mostra quello calcolato in locale.
    //    (Su 07-limiti-notevoli il motore dice "Non hai inserito un numero
    //    valido."; su questo esercizio, con il campo lasciato del tutto in
    //    bianco, dice "Non hai risposto a questa domanda." — è lo stesso
    //    percorso `submit_no_staged_answer`.)
    await waitFor(() =>
      expect(screen.getByText("Non hai risposto a questa domanda.")).toBeInTheDocument(),
    );
    // 2. La parte NON risulta risposta: il bottone di completamento resta
    //    fuori vista, quindi non si può chiudere il tentativo a 0 premendo
    //    Invia due volte a vuoto.
    expect(screen.queryByRole("button", { name: messaggiIt.esercizi.completa })).toBeNull();
  });

  // La faccia opposta dello stesso flag: una risposta che il motore accetta
  // deve sbloccare il completamento (nessuna regressione dal punto 1).
  it("una risposta accettata dal motore sblocca il completamento", async () => {
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: messaggiIt.esercizi.completa })).toBeInTheDocument(),
    );
  });

  // Fix round 1, punto 4: nessun esercizio spedito ha variabili nelle righe
  // o nelle colonne di una griglia (`m_n_x`), quindi quel ramo di
  // `costruisciParte` non era provato da nessun test.
  it("sostituisce le variabili anche nelle righe e nelle colonne di una griglia", async () => {
    const { container } = montaggio({ content: grigliaConVariabiliFixture, seed: "seme-griglia" });
    await waitFor(() => expect(container.querySelectorAll(".katex").length).toBeGreaterThan(1));
    expect(container.textContent).not.toMatch(/\\var\{/);
    expect(screen.getAllByRole("checkbox").length).toBe(4);
  });
});

// Il ripasso dopo un errore: un bottone "Come si risolve" rivela la
// soluzione svolta (`Question#adviceHtml`), poi un secondo bottone rivela la
// risposta attesa della singola parte (`PartBase#correctAnswer()`). Compare
// solo sotto una parte che il SERVER ha confermato sbagliata — mai prima di
// un invio, mai dopo una risposta corretta — e non tocca lo stato del motore
// (niente `getAdvice`/`revealAnswer`, che marcherebbero la parte come
// rivelata e rischierebbero di perdere le risposte alla riserializzazione).
describe("PlayerEsercizio — ripasso dopo un errore", () => {
  function rispostaIncorretta(messaggio = "No.") {
    return new Response(
      JSON.stringify({ score: 0, maxScore: 2, feedback: [{ type: "incorrect", message: messaggio }] }),
      { status: 200 },
    );
  }

  it("il bottone non compare prima di un invio, né dopo una risposta corretta", async () => {
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    // Prima di qualunque invio.
    expect(screen.queryByRole("button", { name: messaggiIt.esercizi.comeSiRisolve })).toBeNull();

    // Il fetch di default (beforeEach) risponde "correct".
    await userEvent.type(screen.getByRole("textbox"), "5");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() => expect(screen.getByText("Giusto.")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: messaggiIt.esercizi.comeSiRisolve })).toBeNull();
    expect(screen.queryByRole("button", { name: messaggiIt.esercizi.mostraRispostaAttesa })).toBeNull();
  });

  it("il bottone compare una volta che il server ha confermato la risposta sbagliata", async () => {
    global.fetch = vi.fn(async () => rispostaIncorretta()) as never;
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "1");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: messaggiIt.esercizi.comeSiRisolve })).toBeInTheDocument(),
    );
    // Il secondo passo non è ancora disponibile: si vede solo dopo il primo.
    expect(screen.queryByRole("button", { name: messaggiIt.esercizi.mostraRispostaAttesa })).toBeNull();
  });

  it("primo passo mostra la soluzione svolta, secondo passo la risposta attesa", async () => {
    global.fetch = vi.fn(async () => rispostaIncorretta()) as never;
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "1");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() =>
      screen.getByRole("button", { name: messaggiIt.esercizi.comeSiRisolve }),
    );

    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.comeSiRisolve }));
    // La soluzione svolta di 01-equazione-primo-grado con questo seme.
    await waitFor(() => expect(screen.getByText(/secondo membro/)).toBeInTheDocument());
    // Non ancora la risposta attesa: solo la soluzione svolta è visibile finora.
    expect(screen.queryByRole("status", { name: messaggiIt.esercizi.rispostaAttesa })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.mostraRispostaAttesa }));
    const rispostaAttesa = await screen.findByRole("status", { name: messaggiIt.esercizi.rispostaAttesa });
    // La risposta attesa di 01-equazione-primo-grado con questo seme è "5".
    expect(rispostaAttesa.textContent).toContain("5");
  });

  it("su un gapfill con due spazi sbagliati la soluzione compare una volta sola", async () => {
    global.fetch = vi.fn(async () => rispostaIncorretta()) as never;
    montaggio({ content: sistemiLineari, seed: "seme-sistemi" });
    await waitFor(() => expect(screen.getAllByRole("textbox").length).toBe(2));

    const campi = screen.getAllByRole("textbox");
    await userEvent.type(campi[0]!, "0");
    await userEvent.type(campi[1]!, "0");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: messaggiIt.esercizi.comeSiRisolve })).toBeInTheDocument(),
    );
    // Un solo bottone "Come si risolve" per l'intero gapfill, non uno per spazio.
    expect(screen.getAllByRole("button", { name: messaggiIt.esercizi.comeSiRisolve }).length).toBe(1);

    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.comeSiRisolve }));
    // La soluzione svolta di 03-sistemi-lineari con questo seme, mostrata
    // UNA volta sola: se comparisse una volta per spazio si leggerebbe due
    // volte lo stesso paragrafo.
    await waitFor(() =>
      expect(screen.getAllByText(/Con il metodo di sostituzione/).length).toBe(1),
    );

    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.mostraRispostaAttesa }));
    // La risposta attesa appare per ciascuno spazio, con questo seme -5 e 3.
    const rispostaAttesa = await screen.findByRole("status", { name: messaggiIt.esercizi.rispostaAttesa });
    expect(rispostaAttesa.textContent).toContain("Spazio 0");
    expect(rispostaAttesa.textContent).toContain("-5");
    expect(rispostaAttesa.textContent).toContain("Spazio 1");
    expect(rispostaAttesa.textContent).toContain("3");
  });

  it("su un esercizio senza soluzione scritta si salta il primo passo", async () => {
    global.fetch = vi.fn(async () => rispostaIncorretta()) as never;
    montaggio({ content: terminologiaFunzioni, seed: "seme-termini" });
    await waitFor(() => expect(screen.getAllByRole("textbox").length).toBe(2));

    const campi = screen.getAllByRole("textbox");
    await userEvent.type(campi[0]!, "x");
    await userEvent.type(campi[1]!, "y");
    const invia = screen.getAllByRole("button", { name: messaggiIt.esercizi.invia });
    await userEvent.click(invia[0]!);
    await userEvent.click(invia[1]!);

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: messaggiIt.esercizi.mostraRispostaAttesa }).length).toBe(2),
    );
    // 08-terminologia-funzioni ha `advice` vuoto: mai un "Come si risolve",
    // nemmeno per una parte confermata sbagliata.
    expect(screen.queryByRole("button", { name: messaggiIt.esercizi.comeSiRisolve })).toBeNull();

    await userEvent.click(screen.getAllByRole("button", { name: messaggiIt.esercizi.mostraRispostaAttesa })[0]!);
    await waitFor(() => expect(screen.getByText("suriettiva")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.mostraRispostaAttesa }));
    await waitFor(() => expect(screen.getByText("codominio")).toBeInTheDocument());
  });

  // Trovato al banco: su 04-disequazioni-secondo-grado (m_n_2, pesi ±1,
  // nessun distrattore) e su 05-goniometria-valori (m_n_x, stessa storia) lo
  // script di correzione dà per ogni cella spuntata un commento con
  // `add_credit` — MAI un `reason`, quindi MAI "incorrect" in
  // `publicFeedbackType`, sia per una spunta giusta sia per una sbagliata —
  // e il bottone non compariva mai nemmeno con un punteggio di 0. Il
  // fetch qui sotto imita esattamente quel caso reale: feedback "info", non
  // "incorrect", per una risposta che il motore (locale, lo stesso che gira
  // sul server) valuta comunque non corretta.
  it("il bottone compare anche quando il feedback del server non porta un tipo \"incorrect\" (scelta multipla additiva)", async () => {
    global.fetch = vi.fn(async () => new Response(
      JSON.stringify({
        score: 0, maxScore: 2,
        feedback: [{ type: "info", message: "Hai scelto una risposta errata." }],
      }),
      { status: 200 },
    )) as never;
    montaggio({ content: disequazione, seed: "seme-04" });
    await waitFor(() => screen.getAllByRole("checkbox"));
    // Con questo seme le scelte corrette sono l'indice 0 e l'indice 3
    // (vedi l'altro test su questo esercizio): scegliere solo l'indice 1 è
    // sicuramente sbagliato, per il motore locale come per il server.
    await userEvent.click(screen.getAllByRole("checkbox")[1]!);
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: messaggiIt.esercizi.comeSiRisolve })).toBeInTheDocument(),
    );
  });

  // `correctAnswer()` di una parte a scelta singola (`1_n_2`) è sempre la
  // matrice `maxMatrix` del motore (una colonna sola, una riga per scelta),
  // mai un indice nudo: mostrarla così com'è sarebbe peggio che non mostrare
  // niente. Il player deve tradurla nella scelta corrispondente.
  it("su una parte a scelta singola la risposta attesa è il testo della scelta corretta, non la matrice grezza", async () => {
    global.fetch = vi.fn(async () => rispostaIncorretta()) as never;
    const { container } = montaggio({ content: scomposizionePolinomi, seed: "seme-02" });
    await waitFor(() => screen.getAllByRole("radio"));
    await userEvent.click(screen.getAllByRole("radio")[1]!);
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() =>
      screen.getByRole("button", { name: messaggiIt.esercizi.comeSiRisolve }),
    );

    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.comeSiRisolve }));
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.mostraRispostaAttesa }));

    const rispostaAttesa = await screen.findByRole("status", { name: messaggiIt.esercizi.rispostaAttesa });
    // La scelta corretta con questo seme è "(x - a)(x + a)": una formula, non
    // un indice o un booleano nudo.
    expect(rispostaAttesa.querySelector(".katex")).not.toBeNull();
    expect(rispostaAttesa.textContent).not.toMatch(/\btrue\b|\bfalse\b/i);
  });

  // `correctAnswer()` di una griglia (`m_n_x`) è la matrice `[colonna][riga]`
  // di `ticks`: senza tradurla in coppie riga→colonna lo studente vedrebbe
  // solo `true`/`false` sparsi, senza sapere a quale abbinamento si
  // riferiscono.
  it("su una griglia la risposta attesa sono le coppie riga-colonna, non la matrice grezza", async () => {
    global.fetch = vi.fn(async () => rispostaIncorretta()) as never;
    montaggio({ content: goniometriaValori, seed: "seme-05" });
    await waitFor(() => screen.getAllByRole("checkbox"));
    await userEvent.click(screen.getAllByRole("checkbox")[0]!);
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() =>
      screen.getByRole("button", { name: messaggiIt.esercizi.comeSiRisolve }),
    );

    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.comeSiRisolve }));
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.mostraRispostaAttesa }));

    const rispostaAttesa = await screen.findByRole("status", { name: messaggiIt.esercizi.rispostaAttesa });
    // Con questo seme l'abbinamento è diagonale: 4 righe, 4 coppie.
    expect(rispostaAttesa.querySelectorAll("li").length).toBe(4);
    expect(rispostaAttesa.textContent).not.toMatch(/\btrue\b|\bfalse\b/i);
  });
});

// Il difetto riportato dal committente: uno studente apriva un esercizio e
// vedeva subito due campi già compilati, un punteggio di 0/2 e un riquadro
// rosso sotto ciascun campo — PRIMA di aver risposto a qualunque cosa. Vero
// (il tentativo era ancora in corso da prima), ma niente in pagina lo diceva:
// un ripristino silenzioso è indistinguibile da un bug. Il banner qui sotto è
// la correzione — e solo quando c'è davvero qualcosa da spiegare.
describe("PlayerEsercizio — banner di ripresa", () => {
  const TESTO_BANNER = /Stai riprendendo un tentativo già iniziato/;

  const statoConRisposta = {
    seed: "seme-di-prova", answered: true, submitted: 1, adviceDisplayed: false, revealed: false,
    score: 0, marks: 2,
    parts: [{ path: "p0", answered: true, score: 0, marks: 2, answer: "3" }],
  };

  it("non compare su un tentativo appena aperto, senza stato salvato", async () => {
    montaggio({ statoIniziale: null });
    await waitFor(() => screen.getByRole("textbox"));
    expect(screen.queryByText(TESTO_BANNER)).toBeNull();
  });

  // Il punto esatto della segnalazione: una riga esiste (il tentativo è
  // stato creato al primo accesso, `avviaORiprendi`) ma nessuna parte è
  // ancora stata risposta. Non è una ripresa, è un esercizio mai iniziato.
  it("non compare quando lo stato esiste ma nessuna parte e' stata risposta", async () => {
    const statoVuoto = {
      seed: "seme-di-prova", answered: false, submitted: 0, adviceDisplayed: false, revealed: false,
      score: 0, marks: 2,
      parts: [{ path: "p0", answered: false, score: 0, marks: 2 }],
    };
    montaggio({ statoIniziale: statoVuoto as never });
    await waitFor(() => screen.getByRole("textbox"));
    expect(screen.queryByText(TESTO_BANNER)).toBeNull();
  });

  it("compare, con quando risale il lavoro, quando almeno una parte e' stata risposta", async () => {
    montaggio({
      statoIniziale: statoConRisposta as never,
      lastActivityAt: new Date("2026-09-01T10:00:00Z"),
    });
    const banner = await screen.findByText(TESTO_BANNER);
    expect(banner).toBeInTheDocument();
    // Non solo la frase fissa: risponde anche a "quando", altrimenti il
    // banner solleverebbe la stessa domanda del difetto originale invece di
    // rispondere. `{quando}` non sostituito lascerebbe l'anno fuori dal testo.
    expect(banner.closest("[role='status']")?.textContent).toContain("2026");
  });

  it("resta visibile finche' lo studente non interagisce (non e' un toast a tempo)", async () => {
    montaggio({ statoIniziale: statoConRisposta as never });
    await screen.findByText(TESTO_BANNER);
    // Nessuna interazione: il banner c'è ancora un istante dopo, non è
    // sparito da solo.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText(TESTO_BANNER)).toBeInTheDocument();
  });

  it("sparisce non appena lo studente modifica una risposta", async () => {
    montaggio({ statoIniziale: statoConRisposta as never });
    await screen.findByText(TESTO_BANNER);
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "5");
    expect(screen.queryByText(TESTO_BANNER)).toBeNull();
  });
});

// Secondo giro, item 2: senza questa riga il player non diceva NULLA che
// permettesse allo studente di distinguere un tentativo che conta per un
// compito assegnato da uno aperto come pratica libera — silenzio identico
// nei due casi, anche quando lo studente aveva chiesto esplicitamente il
// primo (link `?compitoId=...`) e la validazione lo aveva silenziosamente
// declassato al secondo.
describe("PlayerEsercizio — pratica libera dopo un compito respinto", () => {
  it("non compare quando richiestaCompitoRifiutata e' assente (esercizio libero vero)", async () => {
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    expect(screen.queryByText(messaggiIt.esercizi.praticaLiberaAvviso)).toBeNull();
  });

  it("non compare quando richiestaCompitoRifiutata e' false (compito valido)", async () => {
    montaggio({ richiestaCompitoRifiutata: false });
    await waitFor(() => screen.getByRole("textbox"));
    expect(screen.queryByText(messaggiIt.esercizi.praticaLiberaAvviso)).toBeNull();
  });

  it("compare quando il compito richiesto e' stato respinto", async () => {
    montaggio({ richiestaCompitoRifiutata: true });
    const riga = await screen.findByText(messaggiIt.esercizi.praticaLiberaAvviso);
    expect(riga).toBeInTheDocument();
  });
});

// "Let them start over": una via per abbandonare il tentativo in corso e
// aprirne uno nuovo, dietro conferma esplicita — mai un bottone che distrugge
// risposte al primo clic, accanto a "Invia".
describe("PlayerEsercizio — ricomincia", () => {
  it("il bottone apre una richiesta di conferma, senza mandare nessuna chiamata", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    global.fetch = fetchMock as never;
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.ricomincia }));

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(messaggiIt.esercizi.ricominciaDescrizione)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("annullare chiude la richiesta senza distruggere nulla", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    global.fetch = fetchMock as never;
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.ricomincia }));
    const dialogo = await screen.findByRole("alertdialog");

    await userEvent.click(within(dialogo).getByRole("button", { name: messaggiIt.esercizi.annulla }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  // Il cuore del test-driven: solo la conferma ESPLICITA nel dialogo deve
  // arrivare a distruggere qualcosa. La rotta è `.../abbandona`, mai
  // `.../completa` — un tentativo abbandonato non deve mai poter sembrare
  // consegnato (vedi il dominio).
  it("«ricomincia» non compare in modalità locale (Task 7, anteprima): niente tentativo da abbandonare", async () => {
    montaggio({ soloLocale: true });
    await waitFor(() => screen.getByRole("textbox"));
    expect(screen.queryByRole("button", { name: messaggiIt.esercizi.ricomincia })).toBeNull();
  });

  it("confermare abbandona il tentativo e aggiorna la pagina", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toContain("/api/esercizi/tentativi/t1/abbandona");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    global.fetch = fetchMock as never;
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.ricomincia }));
    const dialogo = await screen.findByRole("alertdialog");

    await userEvent.click(within(dialogo).getByRole("button", { name: messaggiIt.esercizi.ricominciaAzione }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("un errore di rete mostra un messaggio, non chiude il dialogo e non aggiorna la pagina", async () => {
    global.fetch = vi.fn(async () => { throw new Error("rete giù"); }) as never;
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.ricomincia }));
    const dialogo = await screen.findByRole("alertdialog");

    await userEvent.click(within(dialogo).getByRole("button", { name: messaggiIt.esercizi.ricominciaAzione }));

    await waitFor(() => expect(screen.getByText(messaggiIt.esercizi.erroreRicomincio)).toBeInTheDocument());
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});

// Task 7 (editor di redazione): l'anteprima del docente monta questo stesso
// componente, in modalità locale — nessun tentativo creato, nessuna
// scrittura, mai (vedi il brief: "un teacher che prova il proprio esercizio
// non deve comparire fra le consegne"). `soloLocale` è la sola differenza:
// disattiva le TRE chiamate di rete (`inviaRisposta`, `completaTentativo`,
// `abbandonaTentativo` — quest'ultima già coperta sopra, dove il bottone
// "ricomincia" stesso non compare in modalità locale) senza cambiare come il
// motore corregge, che resta lo stesso identico calcolo locale che il
// percorso normale usa già come anteprima ottimistica prima della conferma
// del server (vedi `inviaParte`).
describe("PlayerEsercizio — modalità locale (soloLocale, anteprima del docente)", () => {
  it("senza soloLocale (il percorso dello studente) inviare una risposta chiama il server: fissa che il percorso normale continua a scrivere", async () => {
    const fetchMock: (...args: [string | URL | Request, RequestInit?]) => Promise<Response> = vi.fn(async () => new Response(
      JSON.stringify({ score: 2, maxScore: 2, feedback: [{ type: "correct", message: "Giusto." }] }),
      { status: 200 },
    ));
    global.fetch = fetchMock as never;
    montaggio();
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(vi.mocked(fetchMock).mock.calls[0]![0])).toContain("/api/esercizi/tentativi/t1/risposta");
  });

  it("in modalità locale, inviare una risposta corregge e mostra il feedback senza chiamare il server", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as never;
    montaggio({ soloLocale: true });
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "5");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));

    // "5" è la risposta corretta di 01-equazione-primo-grado con questo seme
    // (vedi il test sul ripasso più sopra): il motore locale la marca giusta
    // da solo, senza bisogno del server.
    await waitFor(() => expect(screen.getByText(/2\s*\/\s*2/)).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("in modalità locale, completare il tentativo mostra il riepilogo senza chiamare il server", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as never;
    montaggio({ soloLocale: true });
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "5");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));
    await userEvent.click(await screen.findByRole("button", { name: messaggiIt.esercizi.completa }));

    await waitFor(() =>
      expect(screen.getByText(messaggiIt.esercizi.tentativoCompletato)).toBeInTheDocument(),
    );
    expect(screen.getByText(/2\s*\/\s*2/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("in modalità locale una risposta sbagliata mostra comunque il ripasso, calcolato in locale", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as never;
    montaggio({ soloLocale: true });
    await waitFor(() => screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "1");
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.invia }));

    // 01-equazione-primo-grado ha un suggerimento scritto: il primo passo del
    // ripasso è quindi "Come si risolve" (vedi il blocco di test dedicato più
    // sopra), calcolato dallo stesso `parteConfermataSbagliata` che in
    // modalità locale legge `rispostoConSuccesso`/`result.correct` impostati
    // da `inviaParte` senza alcuna conferma dal server.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: messaggiIt.esercizi.comeSiRisolve })).toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
