import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";

// Come in anteprima-docente-client.test.tsx: il player è uno stub che
// registra le prop, per provare solo la responsabilità di QUESTO componente
// (la sequenza, la modalità locale) senza far girare il motore Numbas.
vi.mock("@/components/esercizi/player/player-esercizio-lazy", () => ({
  PlayerEsercizioLazy: (props: { esercizioId: string; soloLocale?: boolean; content: unknown; seed: string }) => (
    <div data-testid="player" data-esercizio-id={props.esercizioId} data-solo-locale={String(props.soloLocale === true)} data-seed={props.seed}>
      {JSON.stringify(props.content)}
    </div>
  ),
}));

import { AnteprimaCompito } from "../anteprima-compito";

const ESERCIZI = [
  { esercizioId: "e1", titolo: "Lo sconto", content: { n: 1 } },
  { esercizioId: "e2", titolo: "Il pareggio", content: { n: 2 } },
  { esercizioId: "e3", titolo: "La media", content: { n: 3 } },
];

function rendi(props: Partial<Parameters<typeof AnteprimaCompito>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <AnteprimaCompito esercizi={ESERCIZI} locale="it" {...props} />
    </NextIntlClientProvider>,
  );
}

describe("AnteprimaCompito", () => {
  it("mostra il primo esercizio, \"Esercizio 1 di 3\", nel player in modalità locale", () => {
    rendi();
    expect(screen.getByText("Esercizio 1 di 3")).toBeInTheDocument();
    expect(screen.getByText("Lo sconto")).toBeInTheDocument();
    const player = screen.getByTestId("player");
    expect(player).toHaveAttribute("data-esercizio-id", "e1");
    expect(player).toHaveAttribute("data-solo-locale", "true");
    expect(player.textContent).toContain('"n":1');
  });

  it("Avanti e Indietro scorrono gli esercizi; ai bordi sono disabilitati", () => {
    rendi();
    const indietro = screen.getByRole("button", { name: "Indietro" });
    const avanti = screen.getByRole("button", { name: "Avanti" });
    expect(indietro).toBeDisabled();
    fireEvent.click(avanti);
    expect(screen.getByText("Esercizio 2 di 3")).toBeInTheDocument();
    expect(screen.getByTestId("player")).toHaveAttribute("data-esercizio-id", "e2");
    fireEvent.click(avanti);
    expect(screen.getByText("Esercizio 3 di 3")).toBeInTheDocument();
    expect(avanti).toBeDisabled();
    fireEvent.click(indietro);
    expect(screen.getByText("Esercizio 2 di 3")).toBeInTheDocument();
  });

  it("mostra l'avviso quando è un esempio", () => {
    rendi({ avviso: "Esempio: ogni studente avrà la sua estrazione" });
    expect(screen.getByText("Esempio: ogni studente avrà la sua estrazione")).toBeInTheDocument();
  });

  it("senza esercizi lo dice, senza player", () => {
    rendi({ esercizi: [] });
    expect(screen.queryByTestId("player")).not.toBeInTheDocument();
    expect(screen.getByText("Nessun esercizio da mostrare.")).toBeInTheDocument();
  });
});
