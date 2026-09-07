import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import type { EsercizioEditor } from "@/lib/esercizi/editor/modello";

// L'anteprima usa il vero player dello studente (non una riproduzione): qui
// lo si sostituisce con uno stub che registra le prop ricevute, per provare
// la sola responsabilità dell'anteprima — tre semi diversi, la modalità
// locale passata al player, il contenuto ricostruito dall'editor corrente —
// senza far girare davvero il motore Numbas tre volte per test (già coperto
// da player-esercizio.test.tsx).
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

function montaggio(editor: EsercizioEditor = EDITOR) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <Anteprima editor={editor} locale="it" />
    </NextIntlClientProvider>,
  );
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

  it("mostra tre anteprime affiancate, con tre semi diversi", () => {
    montaggio();
    const player = screen.getAllByTestId("player");
    expect(player).toHaveLength(3);
    const semi = player.map((p) => p.getAttribute("data-seed"));
    expect(new Set(semi).size).toBe(3);
  });

  it("passa la modalità locale a ogni player: nessuna scrittura dall'anteprima", () => {
    montaggio();
    for (const p of screen.getAllByTestId("player")) {
      expect(p.getAttribute("data-solo-locale")).toBe("true");
    }
  });

  it("costruisce il contenuto Numbas dall'editor corrente", () => {
    montaggio();
    for (const p of screen.getAllByTestId("player")) {
      expect(p.textContent).toContain("Prova anteprima");
    }
  });

  it("il pulsante «nuovi numeri» rigenera i tre semi", async () => {
    montaggio();
    const semiIniziali = screen.getAllByTestId("player").map((p) => p.getAttribute("data-seed"));

    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.redazione.anteprima.rigenera }));

    const semiNuovi = screen.getAllByTestId("player").map((p) => p.getAttribute("data-seed"));
    expect(semiNuovi).not.toEqual(semiIniziali);
    expect(new Set(semiNuovi).size).toBe(3);
  });
});
