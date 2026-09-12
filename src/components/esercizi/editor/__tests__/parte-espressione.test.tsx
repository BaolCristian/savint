import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import type { ParteEditor } from "@/lib/esercizi/editor/modello";
import { ParteEspressione } from "../parte-espressione";
import { campoFormulaAperto, preparaJsdomPerMathlive } from "./aiuto-mathlive";

preparaJsdomPerMathlive();

const CAMPO = messaggiIt.esercizi.redazione.campoJme;
const FINESTRA = messaggiIt.esercizi.redazione.finestraFormula;

type ParteEspressioneEditor = Extract<ParteEditor, { tipo: "espressione" }>;

const PARTE: ParteEspressioneEditor = {
  tipo: "espressione",
  consegna: "Deriva a*x^n rispetto a x.",
  punti: 3,
  risposta: "{a}*{n}*x^({n-1})",
};

// Genitore con stato vero: digitare più di un carattere in un campo
// controllato ha bisogno che `onChange` retroagisca su `parte`, altrimenti
// ogni tasto ripartirebbe dal valore iniziale invece che da quello appena
// scritto (stesso motivo dei gemelli in parte-numerica/parte-scelta).
function Cornice({ parteIniziale, onChange, onRimuovi }: {
  parteIniziale: ParteEspressioneEditor;
  onChange: (p: ParteEspressioneEditor) => void;
  onRimuovi: () => void;
}) {
  const [parte, setParte] = useState(parteIniziale);
  return (
    <ParteEspressione
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

function montaggio(parte: ParteEspressioneEditor = PARTE) {
  const onChange = vi.fn();
  const onRimuovi = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <Cornice parteIniziale={parte} onChange={onChange} onRimuovi={onRimuovi} />
    </NextIntlClientProvider>,
  );
  return { ...utils, onChange, onRimuovi };
}

describe("ParteEspressione", () => {
  it("mostra consegna, punti e risposta corretta", () => {
    montaggio();
    expect(screen.getByDisplayValue(PARTE.consegna)).toBeInTheDocument();
    expect(screen.getByDisplayValue("3")).toBeInTheDocument();
    expect(screen.getByDisplayValue(PARTE.risposta)).toBeInTheDocument();
  });

  it("spiega che il confronto è simbolico, con l'esempio 2x / x*2 / x+x", () => {
    const { container } = montaggio();
    expect(container.textContent).toContain("2x");
    expect(container.textContent).toContain("x*2");
    expect(container.textContent).toContain("x+x");
  });

  it("modificare la risposta chiama onChange con la parte aggiornata", async () => {
    const { onChange } = montaggio();
    const campo = screen.getByLabelText(messaggiIt.esercizi.redazione.parti.espressione.risposta);
    await userEvent.type(campo, "+1");
    const ultima = onChange.mock.calls.at(-1)![0] as ParteEspressioneEditor;
    expect(ultima.risposta).toBe(`${PARTE.risposta}+1`);
    expect(ultima.consegna).toBe(PARTE.consegna);
  });

  it("il bottone rimuovi chiama onRimuovi", async () => {
    const { onRimuovi } = montaggio();
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.redazione.parti.rimuovi }));
    expect(onRimuovi).toHaveBeenCalledTimes(1);
  });
});

describe("ParteEspressione: la risposta attesa ammette l'incognita", () => {
  it("una formula con un simbolo libero entra nel campo", async () => {
    // Una risposta a espressione si scrive *nell'incognita*: la forma
    // normale è `a*n*x^(n-1)`, dove `x` non è una variabile del pannello.
    // Qui `2y` è la stessa cosa in piccolo — un solo nome libero — e passa
    // solo perché questa superficie lo ammette. È l'unica prova che
    // sorveglia `incognitaAmmessa` dove viene deciso, cioè qui: nel
    // cancello, senza l'opzione, `2y` sarebbe rifiutata.
    montaggio();
    await userEvent.click(screen.getByRole("button", { name: CAMPO.scriviFormula }));
    const campo = await campoFormulaAperto();
    campo.value = "2y";

    await userEvent.click(screen.getByRole("button", { name: FINESTRA.inserisci }));

    const risposta = screen.getByLabelText(
      messaggiIt.esercizi.redazione.parti.espressione.risposta,
    ) as HTMLInputElement;
    expect(risposta.value).toContain("2y");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

/** La descrizione del campo risolta a mano — `aria-describedby` seguito fino
 * al testo, come farebbe una tecnologia assistiva. `document.getElementById`
 * e non `querySelector("#…")`: gli `id` di `useId` contengono i due punti,
 * che in un selettore CSS non sono un carattere ordinario. */
function descrizioneDi(campo: HTMLElement): string {
  return (campo.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

describe("ParteEspressione: due parti dello stesso esercizio non si scambiano gli id", () => {
  it("ogni campo della risposta è descritto dalla PROPRIA eco, non da quella dell'altra parte", () => {
    // Il gemello della prova in `parte-numerica.test.tsx`: prima di `useId`
    // questo componente aveva anch'esso un `id` costante, e due parti a
    // formula nello stesso esercizio se lo dividevano — con l'eco del motore
    // della parte 1 appesa come descrizione del campo della parte 2.
    render(
      <NextIntlClientProvider locale="it" messages={messaggiIt}>
        <Cornice parteIniziale={{ ...PARTE, risposta: "2*" }} onChange={vi.fn()} onRimuovi={vi.fn()} />
        <Cornice parteIniziale={{ ...PARTE, risposta: "sin x" }} onChange={vi.fn()} onRimuovi={vi.fn()} />
      </NextIntlClientProvider>,
    );

    const campi = screen.getAllByLabelText(
      messaggiIt.esercizi.redazione.parti.espressione.risposta,
    ) as HTMLInputElement[];
    expect(campi).toHaveLength(2);
    expect(campi[0]!.id).not.toBe(campi[1]!.id);

    expect(descrizioneDi(campi[0]!)).toContain("Argomenti insufficienti per l'operazione *");
    expect(descrizioneDi(campi[0]!)).not.toContain("sin×x");
    expect(descrizioneDi(campi[1]!)).toContain("sin×x");
    expect(descrizioneDi(campi[1]!)).not.toContain("Argomenti insufficienti");
  });
});
