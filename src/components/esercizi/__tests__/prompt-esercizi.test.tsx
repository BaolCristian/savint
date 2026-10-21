import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import messaggiEn from "@/messages/en.json";
import { promptEsercizi } from "@/lib/esercizi/importa/prompt";

import { PromptEsercizi } from "../prompt-esercizi";

const testi = messaggiIt.ai.esercizi;
const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

function monta(locale: "it" | "en" = "it") {
  const messaggi = locale === "it" ? messaggiIt : messaggiEn;
  return render(
    <NextIntlClientProvider locale={locale} messages={messaggi}>
      <PromptEsercizi />
    </NextIntlClientProvider>,
  );
}

function prompt(): string {
  return screen.getByTestId("prompt-esercizi").textContent ?? "";
}

function compila(argomento: string, classe: string, quanti: string) {
  fireEvent.change(screen.getByLabelText(testi.argomento), { target: { value: argomento } });
  fireEvent.change(screen.getByLabelText(testi.classe), { target: { value: classe } });
  fireEvent.change(screen.getByLabelText(testi.quanti), { target: { value: quanti } });
}

describe("PromptEsercizi", () => {
  it("di partenza: classe 1ª e 5 esercizi", () => {
    monta();
    expect((screen.getByLabelText(testi.classe) as HTMLSelectElement).value).toBe("1");
    expect((screen.getByLabelText(testi.quanti) as HTMLInputElement).value).toBe("5");
  });

  it("il prompt mostrato segue i campi", () => {
    monta();
    compila("piano cartesiano", "3", "4");
    expect(prompt()).toBe(promptEsercizi({ argomento: "piano cartesiano", classe: 3, quanti: 4 }, "it"));
  });

  it("in inglese usa il prompt inglese", () => {
    monta("en");
    fireEvent.change(screen.getByLabelText(messaggiEn.ai.esercizi.argomento), {
      target: { value: "cartesian plane" },
    });
    expect(prompt()).toBe(promptEsercizi({ argomento: "cartesian plane", classe: 1, quanti: 5 }, "en"));
  });

  it("Copia mette negli appunti lo stesso testo mostrato", async () => {
    monta();
    compila("piano cartesiano", "3", "4");
    fireEvent.click(screen.getByRole("button", { name: testi.copia }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(
      promptEsercizi({ argomento: "piano cartesiano", classe: 3, quanti: 4 }, "it"),
    );
  });

  it("se la copia negli appunti non riesce lo dice", async () => {
    writeText.mockRejectedValueOnce(new Error("negato"));
    monta();
    fireEvent.click(screen.getByRole("button", { name: testi.copia }));
    expect(await screen.findByText(testi.copiaNonRiuscita)).toBeInTheDocument();
    // Il pulsante non finge di aver copiato.
    expect(screen.queryByText(testi.copiato)).toBeNull();
  });

  it("c'è il link alla pagina di import", () => {
    monta();
    const link = screen.getByRole("link", { name: testi.importa });
    expect(link.getAttribute("href")).toBe("/dashboard/esercizi/redazione/importa");
  });

  it("quanti fuori dall'intervallo 1–30 viene riportato dentro", () => {
    monta();
    const quanti = screen.getByLabelText(testi.quanti) as HTMLInputElement;
    compila("piano cartesiano", "2", "0");
    expect(prompt()).toBe(promptEsercizi({ argomento: "piano cartesiano", classe: 2, quanti: 1 }, "it"));
    fireEvent.blur(quanti);
    expect(quanti.value).toBe("1");

    fireEvent.change(quanti, { target: { value: "31" } });
    expect(prompt()).toBe(promptEsercizi({ argomento: "piano cartesiano", classe: 2, quanti: 30 }, "it"));
    fireEvent.blur(quanti);
    expect(quanti.value).toBe("30");
  });
});

describe("messaggi della pagina Crea esercizi con l'IA", () => {
  it("hanno le stesse chiavi in italiano e in inglese", () => {
    expect(Object.keys(messaggiEn.ai.esercizi).sort()).toEqual(Object.keys(messaggiIt.ai.esercizi).sort());
  });
});
