import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { IscrizioneClasseForm } from "../iscrizione-classe-form";

function rendi() {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <IscrizioneClasseForm />
    </NextIntlClientProvider>,
  );
}

describe("IscrizioneClasseForm", () => {
  it("un errore di rete mostra un alert e consente di riprovare", async () => {
    let tentativi = 0;
    global.fetch = vi.fn(async () => {
      tentativi += 1;
      if (tentativi === 1) throw new TypeError("rete assente");
      return new Response(JSON.stringify({ classe: { id: "c1", nome: "1A" } }), { status: 201 });
    }) as typeof fetch;

    rendi();
    const campo = screen.getByLabelText(messaggiIt.esercizi.classi.iscrizione.campo);
    const pulsante = screen.getByRole("button", { name: messaggiIt.esercizi.classi.iscrizione.submit });
    fireEvent.change(campo, { target: { value: "AB3XQ7" } });
    fireEvent.click(pulsante);

    expect(await screen.findByRole("alert")).toHaveTextContent(messaggiIt.esercizi.classi.iscrizione.erroreGenerico);
    expect(pulsante).not.toBeDisabled();

    fireEvent.click(pulsante);
    expect(await screen.findByText("Iscritto a 1A.")).toBeInTheDocument();
    expect(tentativi).toBe(2);
  });
});
