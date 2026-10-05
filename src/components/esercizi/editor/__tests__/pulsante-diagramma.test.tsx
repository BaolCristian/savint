import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import { PulsanteDiagramma } from "../pulsante-diagramma";

const R = messaggiIt.esercizi.redazione.diagramma;

function montaggio(onInserisci = vi.fn()) {
  render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <PulsanteDiagramma onInserisci={onInserisci} />
    </NextIntlClientProvider>,
  );
  return onInserisci;
}

describe("PulsanteDiagramma", () => {
  it("inserisce un diagramma a barre con le etichette", async () => {
    const onInserisci = montaggio();
    await userEvent.click(screen.getByRole("button", { name: R.inserisci }));
    await userEvent.type(screen.getByLabelText(R.valori), "dati");
    await userEvent.type(screen.getByLabelText(R.etichette), "giorni");
    await userEvent.click(screen.getByRole("button", { name: R.conferma }));
    expect(onInserisci).toHaveBeenCalledWith("[diagramma: barre | valori: dati | etichette: giorni]");
  });

  it("si può scegliere la torta, senza etichette", async () => {
    const onInserisci = montaggio();
    await userEvent.click(screen.getByRole("button", { name: R.inserisci }));
    await userEvent.selectOptions(screen.getByLabelText(R.tipo), "torta");
    await userEvent.type(screen.getByLabelText(R.valori), "voti");
    await userEvent.click(screen.getByRole("button", { name: R.conferma }));
    expect(onInserisci).toHaveBeenCalledWith("[diagramma: torta | valori: voti]");
  });

  it("una lista scritta nel segnaposto viene rifiutata con una spiegazione", async () => {
    const onInserisci = montaggio();
    await userEvent.click(screen.getByRole("button", { name: R.inserisci }));
    await userEvent.type(screen.getByLabelText(R.valori), "[[1, 2, 3]");
    await userEvent.click(screen.getByRole("button", { name: R.conferma }));
    expect(screen.getByRole("alert")).toHaveTextContent(R.nonValido);
    expect(onInserisci).not.toHaveBeenCalled();
  });
});
