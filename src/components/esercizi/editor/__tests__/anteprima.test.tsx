import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { jme, loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import messaggiIt from "@/messages/it.json";
import type { EsercizioEditor } from "@/lib/esercizi/editor/modello";
import { versoNumbas } from "@/lib/esercizi/editor/verso-numbas";

// L'anteprima usa il vero player dello studente (non una riproduzione): qui
// lo si sostituisce con uno stub che registra le prop ricevute, per provare
// la sola responsabilità dell'anteprima — un solo player montato alla volta,
// dietro le linguette, con la modalità locale passata al player e il
// contenuto ricostruito dall'editor corrente — senza far girare davvero il
// motore Numbas tre volte per test (già coperto da player-esercizio.test.tsx).
//
// Giro di correzioni 1, C2/B1: lo stub registra il seme al MONTAGGIO
// (`useState(props.seed)`, un initializer che gira una volta sola), non a
// ogni render. Uno stub che si limitasse a rendere `props.seed` a ogni
// render sarebbe una funzione pura delle prop e non potrebbe MAI distinguere
// "sono stato rimontato" da "sono stato ri-renderizzato con prop diverse" —
// e la garanzia che conta di più qui (il player carica la domanda una volta
// sola al montaggio, quindi cambiare linguetta deve rimontarlo, non solo
// aggiornarlo) resterebbe indifesa: una `key` costante o rimossa avrebbe
// lasciato l'intera suite verde.
vi.mock("@/components/esercizi/player/player-esercizio-lazy", () => ({
  PlayerEsercizioLazy: (props: {
    seed: string;
    soloLocale?: boolean;
    content: unknown;
    tentativoId: string;
  }) => {
    const [semeAlMontaggio] = useState(props.seed);
    return (
      <div data-testid="player" data-seed={semeAlMontaggio} data-solo-locale={String(props.soloLocale === true)}>
        {JSON.stringify(props.content)}
      </div>
    );
  },
}));

import { Anteprima } from "../anteprima";

const EDITOR: EsercizioEditor = {
  meta: { titolo: "Prova anteprima", descrizione: "", anno: 1, argomento: "algebra", tag: [], difficolta: 1 },
  testo: "Quanto fa 2+2?",
  suggerimento: "",
  variabili: [],
  condizione: "",
  parti: [{ tipo: "espressione", consegna: "Quanto fa 2+2?", punti: 1, risposta: "4" }],
};

function montaggio(editor: EsercizioEditor = EDITOR, semeRifiuto?: number) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <Anteprima editor={editor} locale="it" semeRifiuto={semeRifiuto} />
    </NextIntlClientProvider>,
  );
}

// Task 3, giro di correzioni 1, C1: l'unico editor di questo file con una
// variabile vera — `EDITOR` ne è deliberatamente privo, quindi la tabella
// dei valori sorteggiati non compare mai sotto di esso (`nomi.length === 0`
// -> `null`). Serve una definizione che dipenda dal seme (`random`), non una
// costante: solo così colonne diverse possono, in linea di principio,
// mostrare valori diversi, il che è la premessa perché la prova sotto possa
// distinguere "colonna del seme giusto" da "colonna di un sorteggio
// qualunque".
const EDITOR_CON_VARIABILE: EsercizioEditor = {
  ...EDITOR,
  variabili: [{ nome: "a", definizione: "random(1..1000)", descrizione: "" }],
};

const R = messaggiIt.esercizi.redazione.anteprima;
const NOME_LINGUETTA = (numero: number) => R.sorteggio.replace("{numero}", String(numero));
const NOME_LINGUETTA_RIFIUTO = (numero: number) => R.sorteggioRifiuto.replace("{numero}", String(numero));

/** Clicca la linguetta n (1-based, mai quella del rifiuto: la sua etichetta
 * è diversa) e restituisce il seme del player montato subito dopo — il modo
 * in cui ogni test osserva "quale sorteggio si vede ora" in un componente
 * che monta un player alla volta. */
async function apriLinguetta(numero: number) {
  await userEvent.click(screen.getByRole("tab", { name: NOME_LINGUETTA(numero) }));
  return screen.getByTestId("player").getAttribute("data-seed");
}

describe("Anteprima", () => {
  let sequenza: number[];

  beforeEach(() => {
    sequenza = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
    let i = 0;
    vi.spyOn(Math, "random").mockImplementation(() => sequenza[i++ % sequenza.length]!);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mostra un solo player alla volta, dietro tre linguette con tre semi diversi", async () => {
    montaggio();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getAllByTestId("player")).toHaveLength(1);

    const semi = new Set<string | null>();
    for (const numero of [1, 2, 3]) {
      semi.add(await apriLinguetta(numero));
      expect(screen.getAllByTestId("player")).toHaveLength(1);
    }
    expect(semi.size).toBe(3);
  });

  // Giro di correzioni 1, C2/B1: l'asserzione decisiva è il confronto fra il
  // seme letto PRIMA del clic e quello letto DOPO — non un confronto col
  // valore letto subito dopo il clic stesso (che sarebbe tautologico). Con
  // lo stub che registra il seme al montaggio, questa prova è verde
  // sull'implementazione attuale e rossa se la `key` del player smette di
  // dipendere dal seme (verificato a mano, vedi rapporto).
  it("cliccando la seconda linguetta, il player si rimonta con un seme diverso dal primo", async () => {
    montaggio();
    const semeUno = screen.getByTestId("player").getAttribute("data-seed");

    await userEvent.click(screen.getByRole("tab", { name: NOME_LINGUETTA(2) }));

    expect(screen.getByRole("tab", { name: NOME_LINGUETTA(2) })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("player").getAttribute("data-seed")).not.toBe(semeUno);
  });

  it("passa la modalità locale al player, qualunque linguetta sia aperta: nessuna scrittura dall'anteprima", async () => {
    montaggio();
    for (const numero of [1, 2, 3]) {
      await apriLinguetta(numero);
      expect(screen.getByTestId("player")).toHaveAttribute("data-solo-locale", "true");
    }
  });

  it("costruisce il contenuto Numbas dall'editor corrente, dietro ciascuna delle tre linguette", async () => {
    montaggio();
    for (const numero of [1, 2, 3]) {
      await apriLinguetta(numero);
      expect(screen.getByTestId("player").textContent).toContain("Prova anteprima");
    }
  });

  // Giro di correzioni 1, C3/B3: non basta che il seme della linguetta
  // aperta cambi — «Nuovi numeri» deve produrre tre semi diversi fra loro,
  // altrimenti il docente cliccherebbe le tre linguette e vedrebbe tre
  // volte lo stesso sorteggio (esattamente ciò che il brief vuole evitare:
  // "uno solo non mostra che qualcosa è casuale").
  it("il pulsante «nuovi numeri» rigenera i tre semi, tutti diversi fra loro", async () => {
    montaggio();
    const semiIniziali = [await apriLinguetta(1), await apriLinguetta(2), await apriLinguetta(3)];

    await userEvent.click(screen.getByRole("button", { name: R.rigenera }));

    const semiNuovi = [await apriLinguetta(1), await apriLinguetta(2), await apriLinguetta(3)];
    expect(semiNuovi).not.toEqual(semiIniziali);
    expect(new Set(semiNuovi).size).toBe(3);
  });

  it("la freccia destra sposta selezione e fuoco alla linguetta successiva, e ne rimonta il player", async () => {
    montaggio();
    const semeSecondo = await apriLinguetta(2); // riporta la linguetta 2 in primo piano
    // torna sulla prima linguetta per partire da un punto noto
    await apriLinguetta(1);

    screen.getByRole("tab", { name: NOME_LINGUETTA(1) }).focus();
    await userEvent.keyboard("{ArrowRight}");

    const linguettaDue = screen.getByRole("tab", { name: NOME_LINGUETTA(2) });
    expect(linguettaDue).toHaveAttribute("aria-selected", "true");
    expect(linguettaDue).toHaveFocus();
    expect(screen.getByTestId("player")).toHaveAttribute("data-seed", semeSecondo);
  });

  it("la freccia sinistra dalla prima linguetta torna, girando, all'ultima", async () => {
    montaggio();
    const semeTerzo = await apriLinguetta(3);
    await apriLinguetta(1);

    screen.getByRole("tab", { name: NOME_LINGUETTA(1) }).focus();
    await userEvent.keyboard("{ArrowLeft}");

    const linguettaTre = screen.getByRole("tab", { name: NOME_LINGUETTA(3) });
    expect(linguettaTre).toHaveAttribute("aria-selected", "true");
    expect(linguettaTre).toHaveFocus();
    expect(screen.getByTestId("player")).toHaveAttribute("data-seed", semeTerzo);
  });

  // Giro di correzioni 1, C6/B8: Home/End fanno parte del pattern ARIA
  // "tabs" al completo, non solo le frecce.
  it("il tasto Home sposta selezione e fuoco alla prima linguetta", async () => {
    montaggio();
    const semeUno = await apriLinguetta(1);
    await apriLinguetta(3);

    screen.getByRole("tab", { name: NOME_LINGUETTA(3) }).focus();
    await userEvent.keyboard("{Home}");

    const linguettaUno = screen.getByRole("tab", { name: NOME_LINGUETTA(1) });
    expect(linguettaUno).toHaveAttribute("aria-selected", "true");
    expect(linguettaUno).toHaveFocus();
    expect(screen.getByTestId("player")).toHaveAttribute("data-seed", semeUno);
  });

  it("il tasto End sposta selezione e fuoco all'ultima linguetta", async () => {
    montaggio();
    const semeTre = await apriLinguetta(3);
    await apriLinguetta(1);

    screen.getByRole("tab", { name: NOME_LINGUETTA(1) }).focus();
    await userEvent.keyboard("{End}");

    const linguettaTre = screen.getByRole("tab", { name: NOME_LINGUETTA(3) });
    expect(linguettaTre).toHaveAttribute("aria-selected", "true");
    expect(linguettaTre).toHaveFocus();
    expect(screen.getByTestId("player")).toHaveAttribute("data-seed", semeTre);
  });
});

// Item I6 dell'onda di correzioni: il seme su cui la verifica a venti semi
// (o il salvataggio) ha rifiutato l'esercizio, quando presente, deve
// comparire in una delle tre linguette — non una quarta aggiunta, non una
// linguetta invariata — così il docente vede con i propri occhi il sorteggio
// che ha rotto l'esercizio.
describe("Anteprima — il seme del rifiuto", () => {
  let sequenza: number[];

  beforeEach(() => {
    // Una sequenza, non una costante: un `Math.random` costante farebbe
    // sorteggiare lo stesso identico seme per le due linguette casuali,
    // colliderebbero sulla `key` React (avviso "same key" in console) e
    // renderebbero la prova meno fedele a un vero rigenerare di tre numeri
    // diversi — stesso motivo del blocco `describe` gemello più sopra.
    sequenza = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
    let i = 0;
    vi.spyOn(Math, "random").mockImplementation(() => sequenza[i++ % sequenza.length]!);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("senza un seme di rifiuto, restano tre linguette, tutte casuali", () => {
    montaggio(EDITOR, undefined);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(document.querySelector("[data-seme-rifiuto]")).toBeNull();
  });

  it("con un seme di rifiuto, restano tre linguette — non quattro — e la prima è selezionata di partenza e porta esattamente quel seme", () => {
    montaggio(EDITOR, 14);
    expect(screen.getAllByRole("tab")).toHaveLength(3);

    const primaLinguetta = screen.getByRole("tab", { name: NOME_LINGUETTA_RIFIUTO(1) });
    expect(primaLinguetta).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("player")).toHaveAttribute("data-seed", "14");
  });

  // Giro di correzioni 1, C5/B5: il colore da solo non basta a segnalare la
  // linguetta del rifiuto — un nome accessibile diverso ("… — rifiutato") e
  // un'icona (non solo un cambio di tinta) sono i due segnali aggiuntivi.
  it("la prima linguetta ha un nome accessibile e un'icona che la distinguono, non solo il colore, ed è l'unica marcata data-seme-rifiuto", () => {
    montaggio(EDITOR, 14);
    const marcate = document.querySelectorAll("[data-seme-rifiuto]");
    expect(marcate).toHaveLength(1);

    const primaLinguetta = screen.getByRole("tab", { name: NOME_LINGUETTA_RIFIUTO(1) });
    expect(marcate[0]).toBe(primaLinguetta);
    expect(primaLinguetta.querySelector("svg")).not.toBeNull();
    // le altre due restano col nome comune, senza menzione del rifiuto
    expect(screen.getByRole("tab", { name: NOME_LINGUETTA(2) })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: NOME_LINGUETTA(3) })).toBeInTheDocument();
  });

  it("l'etichetta sotto il player, quando la linguetta del rifiuto è aperta, dice esplicitamente che è un rifiuto", () => {
    montaggio(EDITOR, 14);
    expect(screen.getByText(R.semeRifiuto.replace("{seme}", "14"))).toBeInTheDocument();
  });

  // Task 3, giro di correzioni 1, C1 — il rilievo critico: `<ValoriSorteggiati>`
  // deve ricevere `semiVisibili`, non lo stato grezzo `semi`, altrimenti la
  // colonna 1 della tabella mostra i valori di UN sorteggio casuale invece
  // che del seme che ha rotto l'esercizio — due verità contraddittorie sulla
  // stessa schermata. Questa prova non guarda l'esistenza della tabella (già
  // coperta in valori-sorteggiati.test.tsx): calcola il valore ATTESO per il
  // seme "14" chiamando lo stesso motore (`loadQuestion` +
  // `tokenToDisplayString`) indipendentemente dal componente, e lo confronta
  // con quello che la prima colonna mostra davvero. Verificato a mano
  // (mutazione temporanea `semi={semi}` in anteprima.tsx, poi ripristinata):
  // con `semi` al posto di `semiVisibili` questa prova diventa rossa — il
  // valore atteso per "14" non coincide (quasi certamente, su un intervallo
  // 1..1000) con quello del primo sorteggio casuale mostrato al suo posto.
  it("la tabella dei valori sorteggiati mostra, in prima colonna, i valori del seme RIFIUTATO — non quelli di un sorteggio casuale", () => {
    montaggio(EDITOR_CON_VARIABILE, 14);

    const content = versoNumbas(EDITOR_CON_VARIABILE) as NumbasQuestionJSON;
    const caricata = loadQuestion(content, { seed: "14", locale: "it" });
    const atteso = jme.tokenToDisplayString(caricata.scope.getVariable("a")!, caricata.scope);

    const righeDati = screen.getAllByRole("row").slice(1); // salta l'intestazione
    expect(righeDati).toHaveLength(1); // una sola variabile: "a"
    const celle = within(righeDati[0]!).getAllByRole("cell");
    // celle[0] è il nome "a", celle[1] è la prima colonna — quella del rifiuto.
    expect(celle[1]!.textContent).toBe(atteso);
  });

  it("«nuovi numeri» non cambia il primo seme quando c'è un rifiuto", async () => {
    montaggio(EDITOR, 14);
    await userEvent.click(screen.getByRole("button", { name: R.rigenera }));

    // la prima linguetta (quella del rifiuto) resta selezionata e ancorata
    expect(screen.getByRole("tab", { name: NOME_LINGUETTA_RIFIUTO(1) })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("player")).toHaveAttribute("data-seed", "14");
  });

  it("senza un rifiuto, «nuovi numeri» cambia invece anche il seme della prima linguetta", async () => {
    montaggio(EDITOR, undefined);
    const semeIniziale = screen.getByTestId("player").getAttribute("data-seed");

    await userEvent.click(screen.getByRole("button", { name: R.rigenera }));

    expect(screen.getByTestId("player").getAttribute("data-seed")).not.toBe(semeIniziale);
  });

  // Giro di correzioni 1, C1/B2 — il rilievo più grave: senza questa
  // correzione, un rifiuto che arriva mentre il docente guarda un'altra
  // linguetta accende la prima di rosso ma lascia il player fermo sul
  // sorteggio che stava già guardando — il seme che ha rotto l'esercizio
  // non gli viene mai mostrato.
  it("quando il rifiuto arriva come cambio di prop mentre un'altra linguetta è aperta, la selezione torna sulla prima e ne mostra subito il seme", async () => {
    const { rerender } = montaggio(EDITOR, undefined);
    await apriLinguetta(2); // il docente sta guardando la seconda linguetta…

    // …preme "Controlla", l'esercizio viene rifiutato: `semeRifiuto` arriva
    // come cambio di prop su un componente già montato, non come rimontaggio.
    rerender(
      <NextIntlClientProvider locale="it" messages={messaggiIt}>
        <Anteprima editor={EDITOR} locale="it" semeRifiuto={14} />
      </NextIntlClientProvider>,
    );

    const primaLinguetta = screen.getByRole("tab", { name: NOME_LINGUETTA_RIFIUTO(1) });
    expect(primaLinguetta).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("player")).toHaveAttribute("data-seed", "14");
  });

  it("dopo che il rifiuto ha riportato la selezione sulla prima linguetta, il docente può comunque spostarsi su un'altra", async () => {
    montaggio(EDITOR, 14);
    const semeDue = await apriLinguetta(2);
    expect(screen.getByRole("tab", { name: NOME_LINGUETTA(2) })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("player")).toHaveAttribute("data-seed", semeDue);
  });
});
