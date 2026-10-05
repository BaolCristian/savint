import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import { PulsanteFigura } from "../pulsante-figura";

const R = messaggiIt.esercizi.redazione.figura;

function montaggio(onInserisci = vi.fn()) {
  render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <PulsanteFigura onInserisci={onInserisci} />
    </NextIntlClientProvider>,
  );
  return onInserisci;
}

describe("PulsanteFigura", () => {
  it("inserisce un triangolo rettangolo con l'ipotenusa incognita", async () => {
    const onInserisci = montaggio();
    await userEvent.click(screen.getByRole("button", { name: R.inserisci }));
    await userEvent.selectOptions(screen.getByLabelText(R.tipo), "triangolo rettangolo");
    await userEvent.type(screen.getByLabelText(R.misure), "a, b");
    await userEvent.type(screen.getByLabelText(R.unita), "cm");
    await userEvent.click(screen.getByRole("checkbox", { name: "3" }));
    await userEvent.click(screen.getByRole("button", { name: R.conferma }));
    expect(onInserisci).toHaveBeenCalledWith("[figura: triangolo rettangolo | misure: a, b | unità: cm | incognite: 3]");
  });

  it("un numero sbagliato di misure viene rifiutato", async () => {
    const onInserisci = montaggio();
    await userEvent.click(screen.getByRole("button", { name: R.inserisci }));
    await userEvent.type(screen.getByLabelText(R.misure), "b");
    await userEvent.click(screen.getByRole("button", { name: R.conferma }));
    expect(screen.getByRole("alert")).toHaveTextContent(R.nonValido);
    expect(onInserisci).not.toHaveBeenCalled();
  });
});
