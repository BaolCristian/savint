import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { vi } from "vitest";
import messaggiIt from "@/messages/it.json";

// Il gap che questo task chiude: un docente non poteva vedere sei degli otto
// esercizi seminati, perché l'unico posto dove il vero player renderizzava
// un esercizio fuori dalla pagina dello studente era l'anteprima
// dell'editor — che apre solo ciò che `daNumbas` sa ricostruire (due
// esercizi su otto). Questo componente monta lo STESSO player, ma con
// contenuto grezzo qualunque, mai passato dall'editor.
//
// Come in editor/__tests__/anteprima.test.tsx: il player viene sostituito
// con uno stub che registra le prop ricevute, per provare la sola
// responsabilità di QUESTO componente — un solo sorteggio alla volta (non
// tre, a differenza dell'anteprima dell'editor: qui il docente deve poter
// risolvere l'esercizio, non solo vedere che è casuale), la modalità locale
// passata al player, il contenuto ricevuto dal server — senza far girare
// davvero il motore Numbas (già coperto da player-esercizio.test.tsx).
//
// Il test più importante di questo file è il secondo: pina `soloLocale`
// sul player. Senza, un docente che prova un esercizio finirebbe fra le
// consegne dei suoi studenti — il player è una prop sbagliata di distanza
// da quella scrittura.
vi.mock("@/components/esercizi/player/player-esercizio-lazy", () => ({
  PlayerEsercizioLazy: (props: {
    seed: string;
    soloLocale?: boolean;
    content: unknown;
    esercizioId: string;
    tentativoId: string;
  }) => (
    <div
      data-testid="player"
      data-seed={props.seed}
      data-solo-locale={String(props.soloLocale === true)}
      data-esercizio-id={props.esercizioId}
      data-tentativo-id={props.tentativoId}
    >
      {JSON.stringify(props.content)}
    </div>
  ),
}));

import { AnteprimaDocenteClient } from "../anteprima-docente-client";

function montaggio(content: unknown = { name: "prova" }) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <AnteprimaDocenteClient esercizioId="e1" content={content} locale="it" />
    </NextIntlClientProvider>,
  );
}

describe("AnteprimaDocenteClient", () => {
  it("mostra un solo player, non tre: qui il docente deve risolvere l'esercizio, non solo vedere che è casuale", () => {
    montaggio();
    expect(screen.getAllByTestId("player")).toHaveLength(1);
  });

  it("passa la modalità locale al player: nessun tentativo creato dall'anteprima del docente", () => {
    montaggio();
    expect(screen.getByTestId("player")).toHaveAttribute("data-solo-locale", "true");
  });

  it("passa il contenuto reale ricevuto dal server, non un valore ricostruito localmente", () => {
    montaggio({ name: "prova speciale" });
    expect(screen.getByTestId("player").textContent).toContain("prova speciale");
  });

  it("passa l'id dell'esercizio ricevuto", () => {
    montaggio();
    expect(screen.getByTestId("player")).toHaveAttribute("data-esercizio-id", "e1");
  });

  it("il pulsante di rigenerazione cambia il sorteggio, restando a un solo player", async () => {
    montaggio();
    const semeIniziale = screen.getByTestId("player").getAttribute("data-seed");

    await userEvent.click(
      screen.getByRole("button", { name: messaggiIt.esercizi.anteprimaDocente.rigenera }),
    );

    const player = screen.getAllByTestId("player");
    expect(player).toHaveLength(1);
    expect(player[0]!.getAttribute("data-seed")).not.toBe(semeIniziale);
  });
});
