import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import { CalcolatricePannello } from "../calcolatrice-pannello";

function monta(aperto = true, onChiudi = vi.fn()) {
  render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <CalcolatricePannello aperto={aperto} onChiudi={onChiudi} />
    </NextIntlClientProvider>,
  );
  return onChiudi;
}

const tasto = (nome: string) => screen.getByRole("button", { name: nome });
const testi = messaggiIt.esercizi.provaStudente;

describe("CalcolatricePannello", () => {
  it("7 × 6 = mostra 42", async () => {
    monta();
    for (const t of ["7", "×", "6", "="]) await userEvent.click(tasto(t));
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("mostra il risultato con la virgola in italiano", async () => {
    monta();
    for (const t of ["7", "÷", "2", "="]) await userEvent.click(tasto(t));
    expect(screen.getByText("3,5")).toBeInTheDocument();
  });

  it("un'espressione non valida dà un errore, non un numero", async () => {
    monta();
    for (const t of ["1", "÷", "0", "="]) await userEvent.click(tasto(t));
    expect(screen.getByText(testi.erroreCalcolo)).toBeInTheDocument();
  });

  it("chiuso non mostra nulla; il pulsante di chiusura chiama onChiudi", async () => {
    const onChiudi = monta();
    await userEvent.click(tasto(testi.chiudiCalcolatrice));
    expect(onChiudi).toHaveBeenCalledTimes(1);
  });

  it("chiuso non rende il pannello", () => {
    monta(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
