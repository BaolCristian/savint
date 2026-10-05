import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import { PulsanteGrafico } from "../pulsante-grafico";

const R = messaggiIt.esercizi.redazione.grafico;

function montaggio(onInserisci = vi.fn()) {
  render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <PulsanteGrafico onInserisci={onInserisci} />
    </NextIntlClientProvider>,
  );
  return onInserisci;
}

async function apri() {
  await userEvent.click(screen.getByRole("button", { name: R.inserisci }));
}

describe("PulsanteGrafico", () => {
  it("inserisce il segnaposto con l'intervallo delle y automatico", async () => {
    const onInserisci = montaggio();
    await apri();
    await userEvent.type(screen.getByLabelText(R.funzione), "a*x + b");
    await userEvent.click(screen.getByRole("button", { name: R.conferma }));
    expect(onInserisci).toHaveBeenCalledWith("[grafico: a*x + b | x: -5..5]");
  });

  it("con l'intervallo delle y fissato dal docente", async () => {
    const onInserisci = montaggio();
    await apri();
    await userEvent.type(screen.getByLabelText(R.funzione), "x^2");
    await userEvent.clear(screen.getByLabelText(R.xDa));
    await userEvent.type(screen.getByLabelText(R.xDa), "-3");
    await userEvent.clear(screen.getByLabelText(R.xA));
    await userEvent.type(screen.getByLabelText(R.xA), "3");
    await userEvent.click(screen.getByLabelText(R.yAutomatico));
    await userEvent.type(screen.getByLabelText(R.yDa), "-1");
    await userEvent.type(screen.getByLabelText(R.yA), "9");
    await userEvent.click(screen.getByRole("button", { name: R.conferma }));
    expect(onInserisci).toHaveBeenCalledWith("[grafico: x^2 | x: -3..3 | y: -1..9]");
  });

  // Le graffe sono la sintassi del testo, non della funzione: il motore le
  // sostituirebbe prima che il grafico le veda.
  it("una funzione con le graffe, o intervalli rovesciati, non si inserisce", async () => {
    const onInserisci = montaggio();
    await apri();
    await userEvent.type(screen.getByLabelText(R.funzione), "{{a}*x");
    await userEvent.click(screen.getByRole("button", { name: R.conferma }));
    expect(screen.getByRole("alert")).toHaveTextContent(R.nonValido);
    expect(onInserisci).not.toHaveBeenCalled();
  });

  it("accetta la virgola negli estremi", async () => {
    const onInserisci = montaggio();
    await apri();
    await userEvent.type(screen.getByLabelText(R.funzione), "x");
    await userEvent.clear(screen.getByLabelText(R.xDa));
    await userEvent.type(screen.getByLabelText(R.xDa), "-0,5");
    await userEvent.click(screen.getByRole("button", { name: R.conferma }));
    expect(onInserisci).toHaveBeenCalledWith("[grafico: x | x: -0.5..5]");
  });
});
