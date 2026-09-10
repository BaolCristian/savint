import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import messaggiIt from "@/messages/it.json";
import type { EsercizioEditor } from "@/lib/esercizi/editor/modello";
import { ImpaginazioneEditor } from "../impaginazione";
import { SchedaCatalogo } from "../scheda-catalogo";

const R = messaggiIt.esercizi.redazione;

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("ImpaginazioneEditor — la forma", () => {
  // Correzione al brief: non "prima delle domande" — in due colonne la
  // visione segue la scrittura nell'ordine del documento, ed è così che
  // sotto i 1280px quell'ordine diventa quello a schermo. Ciò che conta è
  // che l'anteprima non sia più sepolta sotto i pulsanti, e che stia in una
  // regione sua, non mescolata dentro la scrittura.
  it("l'anteprima (visione) precede la barra delle azioni nel DOM e vive in una regione distinta dalla scrittura", () => {
    render(
      <Wrapper>
        <ImpaginazioneEditor
          intestazione={<div>intestazione</div>}
          scrittura={
            <div data-testid="scrittura-regione">
              <p data-testid="campo-scrittura">un campo di scrittura</p>
            </div>
          }
          visione={
            <div data-testid="visione-regione">
              <p data-testid="anteprima-nodo">l&apos;anteprima</p>
            </div>
          }
          azioni={<div data-testid="azioni-nodo">azioni</div>}
        />
      </Wrapper>,
    );

    const anteprima = screen.getByTestId("anteprima-nodo");
    const azioni = screen.getByTestId("azioni-nodo");
    expect(anteprima.compareDocumentPosition(azioni) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const scritturaRegione = screen.getByTestId("scrittura-regione");
    const visioneRegione = screen.getByTestId("visione-regione");
    expect(scritturaRegione.contains(visioneRegione)).toBe(false);
    expect(visioneRegione.contains(scritturaRegione)).toBe(false);
  });
});

const metaEsempio: EsercizioEditor["meta"] = {
  titolo: "",
  descrizione: "",
  anno: 2,
  argomento: "Equazioni",
  tag: [],
  difficolta: 2,
};

function montaSchedaCatalogo(metaIniziale: EsercizioEditor["meta"]) {
  function Host() {
    const [meta, setMeta] = useState(metaIniziale);
    return (
      <SchedaCatalogo
        meta={meta}
        onChange={(campo, valore) => setMeta((m) => ({ ...m, [campo]: valore }))}
      />
    );
  }
  return render(
    <Wrapper>
      <Host />
    </Wrapper>,
  );
}

describe("SchedaCatalogo — il riassunto", () => {
  it("mostra anno, argomento e difficoltà correnti mentre la scheda è chiusa", () => {
    montaSchedaCatalogo(metaEsempio);

    const dettagli = screen.getByText(R.catalogo.titolo).closest("details");
    expect(dettagli).not.toBeNull();
    expect(dettagli!.open).toBe(false);

    const riassunto = dettagli!.querySelector("summary")!.textContent ?? "";
    expect(riassunto).toContain("2");
    expect(riassunto).toContain(metaEsempio.argomento);
    expect(riassunto).toContain(R.meta.difficolta2);
  });

  it("cambiare l'anno dentro la scheda aggiorna il riassunto", async () => {
    montaSchedaCatalogo(metaEsempio);

    // La scheda è chiusa: va aperta per raggiungere il campo anno.
    await userEvent.click(screen.getByText(R.catalogo.titolo));

    await userEvent.selectOptions(screen.getByLabelText(R.meta.anno), "4");

    const dettagli = screen.getByText(R.catalogo.titolo).closest("details")!;
    const riassunto = dettagli.querySelector("summary")!.textContent ?? "";
    expect(riassunto).toContain("4");
    expect(riassunto).not.toContain("2ª");
  });
});
