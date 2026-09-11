import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import type { ParteEditor } from "@/lib/esercizi/editor/modello";
import { ParteEspressione } from "../parte-espressione";

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
