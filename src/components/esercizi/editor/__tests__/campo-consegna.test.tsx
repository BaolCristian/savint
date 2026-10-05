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

describe("CampoConsegna: come si vedrà", () => {
  const C = messaggiIt.esercizi.redazione.campoTesto;

  function Con({ iniziale }: { iniziale: string }) {
    const [v, setV] = useState(iniziale);
    return <CampoConsegna valore={v} onChange={setV} />;
  }

  function monta(iniziale: string) {
    return render(
      <NextIntlClientProvider locale="it" messages={messaggiIt}>
        <Con iniziale={iniziale} />
      </NextIntlClientProvider>,
    );
  }

  it("mostra la consegna come la vedrà lo studente, formule comprese", () => {
    const { container } = monta("Risolvi \\(3x^2-6=0\\)");
    expect(screen.getByText(C.comeSiVedra)).toBeInTheDocument();
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  // Il caso del docente: «3*x^2-6=0» scritto come testo.
  it("avvisa quando una formula è scritta fuori da \\( \\)", () => {
    monta("Calcola la soluzione di questa equazione: 3*x^2-6=0");
    expect(screen.getByRole("status")).toHaveTextContent("3*x^2-6=0");
  });

  it("una variabile in una formula si vede come lettera, non come errore", () => {
    const { container } = monta("Quanto vale \\(x = \\var{a}\\)?");
    // Senza la macro dell'eco KaTeX non conosce \\var e la formula ricade
    // nel riquadro grigio col sorgente (`<code>`).
    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.querySelector("code")).toBeNull();
  });

  it("nessun avviso quando la formula è dentro \\( \\)", () => {
    monta("Risolvi \\(3x^2-6=0\\)");
    expect(screen.queryByRole("status")).toBeNull();
  });
});

