import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import { PulsanteImmagine } from "../pulsante-immagine";

const R = messaggiIt.esercizi.redazione.immagine;
const FILE = "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90.png";

function montaggio(onInserisci = vi.fn(), disabilitato = false) {
  render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <PulsanteImmagine onInserisci={onInserisci} disabilitato={disabilitato} />
    </NextIntlClientProvider>,
  );
  return onInserisci;
}

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "triangolo.png", { type: "image/png" });

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ file: FILE }), { status: 201 })) as never;
});

describe("PulsanteImmagine", () => {
  it("carica il file e inserisce il segnaposto con la descrizione", async () => {
    const onInserisci = montaggio();
    await userEvent.click(screen.getByRole("button", { name: R.inserisci }));
    await userEvent.upload(screen.getByLabelText(R.file), png());
    await userEvent.type(screen.getByLabelText(R.descrizione), "triangolo rettangolo");
    await userEvent.click(screen.getByRole("button", { name: R.conferma }));

    await waitFor(() => expect(onInserisci).toHaveBeenCalledWith(`![triangolo rettangolo](${FILE})`));
    const [url, opzioni] = vi.mocked(global.fetch).mock.calls[0]!;
    expect(String(url)).toContain("/api/esercizi/immagini");
    expect((opzioni as RequestInit).method).toBe("POST");
    expect(screen.queryByLabelText(R.descrizione)).toBeNull();
  });

  // La descrizione è ciò che legge un programma di lettura dello schermo:
  // senza, uno studente con difficoltà visive non saprebbe cosa mostra.
  it("senza descrizione non si può confermare", async () => {
    montaggio();
    await userEvent.click(screen.getByRole("button", { name: R.inserisci }));
    await userEvent.upload(screen.getByLabelText(R.file), png());
    expect(screen.getByRole("button", { name: R.conferma })).toBeDisabled();
  });

  it("un rifiuto del server diventa un messaggio, e la finestra resta aperta", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "troppo_grande" }), { status: 400 })) as never;
    const onInserisci = montaggio();
    await userEvent.click(screen.getByRole("button", { name: R.inserisci }));
    await userEvent.upload(screen.getByLabelText(R.file), png());
    await userEvent.type(screen.getByLabelText(R.descrizione), "figura");
    await userEvent.click(screen.getByRole("button", { name: R.conferma }));

    expect(await screen.findByRole("alert")).toHaveTextContent(R.erroreGrande);
    expect(onInserisci).not.toHaveBeenCalled();
    expect(screen.getByLabelText(R.descrizione)).toBeInTheDocument();
  });

  it("si può spegnere", () => {
    montaggio(vi.fn(), true);
    expect(screen.getByRole("button", { name: R.inserisci })).toBeDisabled();
  });
});
