import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import type { EsercizioEditor } from "@/lib/esercizi/editor/modello";

// L'anteprima usa il vero player dello studente (non una riproduzione): qui
// lo si sostituisce con uno stub che registra le prop ricevute, per provare
// la sola responsabilità dell'anteprima — un solo player montato alla volta,
// dietro le linguette, con la modalità locale passata al player e il
// contenuto ricostruito dall'editor corrente — senza far girare davvero il
// motore Numbas tre volte per test (già coperto da player-esercizio.test.tsx).
vi.mock("@/components/esercizi/player/player-esercizio-lazy", () => ({
  PlayerEsercizioLazy: (props: {
    seed: string;
    soloLocale?: boolean;
    content: unknown;
    tentativoId: string;
  }) => (
    <div data-testid="player" data-seed={props.seed} data-solo-locale={String(props.soloLocale === true)}>
      {JSON.stringify(props.content)}
    </div>
  ),
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

const NOME_LINGUETTA = (numero: number) => messaggiIt.esercizi.redazione.anteprima.sorteggio.replace("{numero}", String(numero));

/** Clicca la linguetta n (1-based) e restituisce il seme del player montato
 * subito dopo — il modo in cui ogni test osserva "quale sorteggio si vede
 * ora" in un componente che monta un player alla volta. */
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

  it("cliccando la seconda linguetta, il player montato porta il seme del secondo sorteggio", async () => {
    montaggio();
    const semeAtteso = await apriLinguetta(2);
    expect(screen.getByRole("tab", { name: NOME_LINGUETTA(2) })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("player")).toHaveAttribute("data-seed", semeAtteso);
  });

  it("passa la modalità locale al player, qualunque linguetta sia aperta: nessuna scrittura dall'anteprima", async () => {
    montaggio();
    for (const numero of [1, 2, 3]) {
      await apriLinguetta(numero);
      expect(screen.getByTestId("player")).toHaveAttribute("data-solo-locale", "true");
    }
  });

  it("costruisce il contenuto Numbas dall'editor corrente", () => {
    montaggio();
    expect(screen.getByTestId("player").textContent).toContain("Prova anteprima");
  });

  it("il pulsante «nuovi numeri» rigenera il seme della linguetta aperta", async () => {
    montaggio();
    const semeIniziale = screen.getByTestId("player").getAttribute("data-seed");

    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.redazione.anteprima.rigenera }));

    expect(screen.getByTestId("player").getAttribute("data-seed")).not.toBe(semeIniziale);
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

    const primaLinguetta = screen.getByRole("tab", { name: NOME_LINGUETTA(1) });
    expect(primaLinguetta).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("player")).toHaveAttribute("data-seed", "14");
  });

  it("la prima linguetta porta data-seme-rifiuto ed è l'unica marcata così", () => {
    montaggio(EDITOR, 14);
    const marcate = document.querySelectorAll("[data-seme-rifiuto]");
    expect(marcate).toHaveLength(1);
    expect(marcate[0]).toBe(screen.getByRole("tab", { name: NOME_LINGUETTA(1) }));
  });

  it("l'etichetta sotto il player, quando la linguetta del rifiuto è aperta, dice esplicitamente che è un rifiuto", () => {
    montaggio(EDITOR, 14);
    expect(
      screen.getByText(messaggiIt.esercizi.redazione.anteprima.semeRifiuto.replace("{seme}", "14")),
    ).toBeInTheDocument();
  });

  it("«nuovi numeri» non cambia il primo seme quando c'è un rifiuto, e lo cambia quando non c'è", async () => {
    montaggio(EDITOR, 14);
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.redazione.anteprima.rigenera }));

    // la prima linguetta (quella del rifiuto) resta selezionata e ancorata
    expect(screen.getByRole("tab", { name: NOME_LINGUETTA(1) })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("player")).toHaveAttribute("data-seed", "14");
  });

  it("senza un rifiuto, «nuovi numeri» cambia invece anche il seme della prima linguetta", async () => {
    montaggio(EDITOR, undefined);
    const semeIniziale = screen.getByTestId("player").getAttribute("data-seed");

    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.redazione.anteprima.rigenera }));

    expect(screen.getByTestId("player").getAttribute("data-seed")).not.toBe(semeIniziale);
  });
});
