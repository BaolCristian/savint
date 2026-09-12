import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import type { ParteEditor } from "@/lib/esercizi/editor/modello";
import { ParteNumerica } from "../parte-numerica";
import { campoFormulaAperto, preparaJsdomPerMathlive } from "./aiuto-mathlive";

preparaJsdomPerMathlive();

const CAMPO = messaggiIt.esercizi.redazione.campoJme;
const FINESTRA = messaggiIt.esercizi.redazione.finestraFormula;

type ParteNumericaEditor = Extract<ParteEditor, { tipo: "numerica" }>;

const PARTE: ParteNumericaEditor = {
  tipo: "numerica",
  consegna: "Quanto vale a+b?",
  punti: 2,
  valore: "{a}+{b}",
  tolleranza: { tipo: "esatta" },
};

// Un piccolo genitore con stato vero, non un `vi.fn()` senza seguito: il
// campo margine/cifre compare solo dopo che il cambio di tolleranza è
// arrivato a `parte` come farebbe `editor-esercizio.tsx` in pagina — un
// `onChange` che non retroagisce sullo stato non farebbe mai comparire quel
// campo, e i test che scrivono lì dentro non troverebbero nulla.
function Cornice({ parteIniziale, onChange, onRimuovi }: {
  parteIniziale: ParteNumericaEditor;
  onChange: (p: ParteNumericaEditor) => void;
  onRimuovi: () => void;
}) {
  const [parte, setParte] = useState(parteIniziale);
  return (
    <ParteNumerica
      parte={parte}
      onChange={(p) => {
        setParte(p);
        onChange(p);
      }}
      onRimuovi={onRimuovi}
      // I nomi dichiarati nel pannello variabili: qui nessuno, come in un
      // esercizio senza variabili.
      nomiVariabili={[]}
    />
  );
}

function montaggio(parte: ParteNumericaEditor = PARTE) {
  const onChange = vi.fn();
  const onRimuovi = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <Cornice parteIniziale={parte} onChange={onChange} onRimuovi={onRimuovi} />
    </NextIntlClientProvider>,
  );
  return { ...utils, onChange, onRimuovi };
}

describe("ParteNumerica", () => {
  it("mostra consegna, punti e valore", () => {
    montaggio();
    expect(screen.getByDisplayValue("Quanto vale a+b?")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("{a}+{b}")).toBeInTheDocument();
  });

  it("non mostra mai minValue o maxValue: solo valore e tolleranza", () => {
    const { container } = montaggio();
    expect(container.textContent).not.toMatch(/minValue|maxValue/i);
    expect(screen.getByText(messaggiIt.esercizi.redazione.parti.numerica.valore)).toBeInTheDocument();
    expect(screen.getByText(messaggiIt.esercizi.redazione.parti.numerica.tolleranza)).toBeInTheDocument();
  });

  it("modificare il valore chiama onChange con la parte aggiornata", async () => {
    const { onChange } = montaggio();
    const campo = screen.getByLabelText(messaggiIt.esercizi.redazione.parti.numerica.valore);
    await userEvent.type(campo, "!");
    const ultima = onChange.mock.calls.at(-1)![0] as ParteNumericaEditor;
    expect(ultima.valore).toBe("{a}+{b}!");
    expect(ultima.consegna).toBe(PARTE.consegna);
  });

  it("passare a tolleranza «margine» mostra il campo margine e lo riporta in onChange", async () => {
    const { onChange } = montaggio();
    await userEvent.click(
      screen.getByRole("radio", { name: messaggiIt.esercizi.redazione.parti.numerica.tolleranzaMargine }),
    );
    const campoMargine = await screen.findByLabelText(messaggiIt.esercizi.redazione.parti.numerica.margine);
    await userEvent.type(campoMargine, "0.01");
    const ultima = onChange.mock.calls.at(-1)![0] as ParteNumericaEditor;
    expect(ultima.tolleranza).toEqual({ tipo: "margine", margine: "0.01" });
  });

  it("il margine non ha la tastiera di simboli, il valore atteso sì", async () => {
    // Il margine è una tolleranza — `0.01`, un decimale — non una risposta
    // attesa: `π`, `√`, `^` non si scrivono lì, e una riga di tasti sotto un
    // campo così è rumore. Il valore atteso invece è matematica
    // (`sqrt(2)*a` è una risposta plausibile) e la tastiera resta.
    montaggio();
    const tastiere = () => screen.queryAllByRole("group", { name: messaggiIt.esercizi.tastieraSimboli });
    expect(tastiere()).toHaveLength(1);
    await userEvent.click(
      screen.getByRole("radio", { name: messaggiIt.esercizi.redazione.parti.numerica.tolleranzaMargine }),
    );
    await screen.findByLabelText(messaggiIt.esercizi.redazione.parti.numerica.margine);
    expect(tastiere()).toHaveLength(1);
  });

  it("il margine non ha l'assistente per le formule, il valore atteso sì", async () => {
    // La stessa ragione della tastiera, e vale la pena sorvegliarla a
    // parte: la prop che accende l'assistente è diversa da quella della
    // tastiera, e senza questa riga niente impedirebbe che il pulsante
    // ricomparisse sotto un campo dove una formula disegnata non ha senso —
    // un margine è `0.01`, un editor visuale non ha niente da disegnarci.
    montaggio();
    const pulsanti = () =>
      screen.queryAllByRole("button", { name: messaggiIt.esercizi.redazione.campoJme.scriviFormula });
    expect(pulsanti()).toHaveLength(1);
    await userEvent.click(
      screen.getByRole("radio", { name: messaggiIt.esercizi.redazione.parti.numerica.tolleranzaMargine }),
    );
    await screen.findByLabelText(messaggiIt.esercizi.redazione.parti.numerica.margine);
    expect(pulsanti()).toHaveLength(1);
  });

  it("il margine mostra comunque l'eco: anche una tolleranza va vista come il motore l'ha capita", async () => {
    const { container } = montaggio();
    await userEvent.click(
      screen.getByRole("radio", { name: messaggiIt.esercizi.redazione.parti.numerica.tolleranzaMargine }),
    );
    const campoMargine = await screen.findByLabelText(messaggiIt.esercizi.redazione.parti.numerica.margine);
    await userEvent.type(campoMargine, "0.01");
    const echi = [...container.querySelectorAll(".katex-html")].map((n) => n.textContent);
    expect(echi).toContain("0.01");
  });

  it("passare a tolleranza «decimali» mostra il campo cifre e lo riporta in onChange", async () => {
    const { onChange } = montaggio();
    await userEvent.click(
      screen.getByRole("radio", { name: messaggiIt.esercizi.redazione.parti.numerica.tolleranzaDecimali }),
    );
    const campoCifre = await screen.findByLabelText(messaggiIt.esercizi.redazione.parti.numerica.cifreDecimali);
    await userEvent.clear(campoCifre);
    await userEvent.type(campoCifre, "3");
    const ultima = onChange.mock.calls.at(-1)![0] as ParteNumericaEditor;
    expect(ultima.tolleranza).toEqual({ tipo: "decimali", cifre: 3 });
  });

  it("il bottone rimuovi chiama onRimuovi", async () => {
    const { onRimuovi } = montaggio();
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.redazione.parti.rimuovi }));
    expect(onRimuovi).toHaveBeenCalledTimes(1);
  });
});

describe("ParteNumerica: il valore atteso non ammette l'incognita", () => {
  it("una formula con un simbolo libero è rifiutata, e il campo non cambia", async () => {
    // Il gemello contrario della prova in `parte-espressione.test.tsx`: la
    // stessa formula, l'altra superficie. Qui il valore deve venir fuori
    // dalle variabili dichiarate — un nome libero è un errore, non
    // un'incognita — e le due prove insieme sono ciò che impedisce di
    // accendere o spegnere `incognitaAmmessa` su entrambe per sbaglio.
    montaggio();
    const valore = screen.getByLabelText(
      messaggiIt.esercizi.redazione.parti.numerica.valore,
    ) as HTMLInputElement;
    const prima = valore.value;

    await userEvent.click(screen.getByRole("button", { name: CAMPO.scriviFormula }));
    const campo = await campoFormulaAperto();
    campo.value = "2y";
    await userEvent.click(screen.getByRole("button", { name: FINESTRA.inserisci }));

    expect(valore.value).toBe(prima);
    expect((await screen.findByRole("alert")).textContent).toContain("y");
  });
});
