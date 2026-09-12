import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import messaggiIt from "@/messages/it.json";
import type { EsercizioEditor } from "@/lib/esercizi/editor/modello";
import { ImpaginazioneEditor } from "../impaginazione";
import { SchedaCatalogo } from "../scheda-catalogo";

// Lo stesso stub di editor-esercizio.test.tsx: qui serve solo per localizzare
// il vero riquadro d'anteprima nel DOM, non per provare il player.
vi.mock("@/components/esercizi/player/player-esercizio-lazy", () => ({
  PlayerEsercizioLazy: (props: { seed: string }) => <div data-testid="player-stub" data-seed={props.seed} />,
}));

import { EditorEsercizio } from "../editor-esercizio";

const R = messaggiIt.esercizi.redazione;

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      {children}
    </NextIntlClientProvider>
  );
}

describe("EditorEsercizio — l'anteprima non è più sepolta sotto i pulsanti", () => {
  // Giro di correzioni 1: la prima versione di questa prova montava
  // ImpaginazioneEditor con quattro <div> inventati dal test — verificava
  // solo che il contenitore rispettasse l'ordine dei propri slot, che è
  // scritto in chiaro nel suo JSX e non può rompersi in silenzio. Il difetto
  // per cui il task esiste (l'anteprima sepolta sotto i pulsanti) vive
  // invece in editor-esercizio.tsx, in QUALE slot finisce <Anteprima>: solo
  // montando il vero EditorEsercizio questa prova può accorgersi se qualcuno
  // la sposta di nuovo dentro `azioni`.
  it("il riquadro d'anteprima precede il pulsante «Salva» nel DOM", () => {
    render(
      <Wrapper>
        <EditorEsercizio />
      </Wrapper>,
    );

    const anteprima = screen.getAllByTestId("player-stub")[0]!;
    const salva = screen.getByRole("button", { name: R.salva });
    expect(anteprima.compareDocumentPosition(salva) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("ImpaginazioneEditor — il contenitore puro", () => {
  // Questa resta utile in aggiunta alla prova sopra, non al suo posto:
  // fallisce davvero se si invertono gli slot dentro ImpaginazioneEditor
  // stesso (verificato invertendo `azioni` e la griglia nel componente), ma
  // da sola non sorveglia dove editor-esercizio.tsx infila i propri nodi —
  // per quello serve la prova sul vero editor, sopra.
  it("visione precede azioni nel DOM e vive in una regione distinta dalla scrittura", () => {
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

// Giro di correzioni 1: anno e difficoltà distinti (2 e 3, non entrambi 2) —
// con valori uguali un riassunto che leggesse il campo sbagliato (per
// esempio `difficolta` al posto di `anno`) avrebbe comunque soddisfatto
// `toContain("2")`, e la prova sarebbe passata su un riassunto rotto.
const metaEsempio: EsercizioEditor["meta"] = {
  titolo: "",
  descrizione: "",
  anno: 2,
  argomento: "Equazioni",
  tag: [],
  difficolta: 3,
};

function montaSchedaCatalogo(metaIniziale: EsercizioEditor["meta"]) {
  function Host() {
    const [meta, setMeta] = useState(metaIniziale);
    return <SchedaCatalogo meta={meta} onChange={(campo, valore) => setMeta((m) => ({ ...m, [campo]: valore }))} />;
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
    // La stringa intera, non tre `toContain` separati: nessuna permutazione
    // dei tre campi (anno/argomento/difficoltà scambiati fra loro) può
    // soddisfarla per caso.
    expect(riassunto).toContain("2ª · Equazioni · Difficile");
  });

  it("cambiare l'anno dentro la scheda aggiorna il riassunto", async () => {
    montaSchedaCatalogo(metaEsempio);

    const dettagli = screen.getByText(R.catalogo.titolo).closest("details")!;
    await userEvent.click(screen.getByText(R.catalogo.titolo));
    // Giro di correzioni 1: senza questa riga, disabilitare l'apertura della
    // scheda (per esempio un `preventDefault` sul clic) lascia la prova
    // ugualmente verde — in jsdom il contenuto di un <details> chiuso resta
    // comunque raggiungibile dal DOM. È la sola riga che verifica che il
    // clic abbia davvero aperto la scheda, non solo che il campo sia
    // raggiungibile a prescindere.
    expect(dettagli.open).toBe(true);

    await userEvent.selectOptions(screen.getByLabelText(R.meta.anno), "4");

    const riassunto = dettagli.querySelector("summary")!.textContent ?? "";
    expect(riassunto).toContain("4ª · Equazioni · Difficile");
    expect(riassunto).not.toContain("2ª");
  });

  // C6 del giro di correzioni 1: nessuna prova arrivava fino in fondo ai
  // cinque campi ripiegati dietro il <details> — le due prove sopra si
  // fermano al campo anno. Qui si apre la scheda e si scrive in ciascuno dei
  // quattro campi restanti (descrizione, difficoltà, argomento, tag),
  // dimostrando che sono davvero raggiungibili e collegati a `onChange`, non
  // solo presenti nel DOM.
  it("apre la scheda e raggiunge tutti i campi che vi sono dietro", async () => {
    montaSchedaCatalogo(metaEsempio);

    const dettagli = screen.getByText(R.catalogo.titolo).closest("details")!;
    await userEvent.click(screen.getByText(R.catalogo.titolo));
    expect(dettagli.open).toBe(true);

    await userEvent.type(screen.getByLabelText(R.meta.descrizione), "x");
    expect(screen.getByLabelText(R.meta.descrizione)).toHaveValue("x");

    await userEvent.selectOptions(screen.getByLabelText(R.meta.difficolta), "1");
    expect(screen.getByLabelText(R.meta.difficolta)).toHaveValue("1");

    await userEvent.clear(screen.getByLabelText(R.meta.argomento));
    await userEvent.type(screen.getByLabelText(R.meta.argomento), "Geometria");
    expect(screen.getByLabelText(R.meta.argomento)).toHaveValue("Geometria");

    await userEvent.type(screen.getByLabelText(R.meta.tag), "algebra");
    expect(screen.getByLabelText(R.meta.tag)).toHaveValue("algebra");
  });
});
