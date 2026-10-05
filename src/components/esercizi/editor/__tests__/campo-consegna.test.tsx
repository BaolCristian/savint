import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import { CampoConsegna } from "../campo-consegna";

const I = messaggiIt.esercizi.redazione.immagine;
const P = messaggiIt.esercizi.redazione.parti;
const FILE = "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90.png";

function Controllato() {
  const [v, setV] = useState("Quanto vale x?");
  return <CampoConsegna valore={v} onChange={setV} />;
}

describe("CampoConsegna", () => {
  it("la consegna riceve il segnaposto dell'immagine dove sta il cursore", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ file: FILE }), { status: 201 })) as never;
    render(
      <NextIntlClientProvider locale="it" messages={messaggiIt}>
        <Controllato />
      </NextIntlClientProvider>,
    );
    const campo = screen.getByLabelText(P.consegna) as HTMLTextAreaElement;
    campo.focus();
    campo.setSelectionRange(0, 0);

    await userEvent.click(screen.getByRole("button", { name: I.inserisci }));
    await userEvent.upload(screen.getByLabelText(I.file), new File([new Uint8Array([0x89])], "f.png", { type: "image/png" }));
    await userEvent.type(screen.getByLabelText(I.descrizione), "figura");
    await userEvent.click(screen.getByRole("button", { name: I.conferma }));

    await waitFor(() => expect(campo.value).toBe(`![figura](${FILE})Quanto vale x?`));
  });
});
