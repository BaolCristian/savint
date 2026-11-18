import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import type { ParteEditor } from "@/lib/esercizi/editor/modello";
import { ParteVeroFalso } from "../parte-vero-falso";

type ParteVeroFalsoEditor = Extract<ParteEditor, { tipo: "veroFalso" }>;

const T = messaggiIt.esercizi.redazione.parti.veroFalso;

const PARTE: ParteVeroFalsoEditor = {
  tipo: "veroFalso",
  consegna: "Indica se è vera o falsa",
  punti: 4,
  affermazioni: ["Un quadrato è un rombo", "Un rombo è un quadrato"],
  vere: [true, false],
};

// Genitore con stato vero: due clic di seguito devono partire dal valore
// aggiornato, non da quello iniziale.
function Cornice({ parteIniziale, onChange }: {
  parteIniziale: ParteVeroFalsoEditor;
  onChange: (p: ParteVeroFalsoEditor) => void;
}) {
  const [parte, setParte] = useState(parteIniziale);
  return (
    <ParteVeroFalso
      parte={parte}
      onChange={(p) => {
        setParte(p);
        onChange(p);
      }}
      onRimuovi={() => {}}
    />
  );
}

function montaggio(parte: ParteVeroFalsoEditor = PARTE) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <Cornice parteIniziale={parte} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  const ultima = () => onChange.mock.calls.at(-1)![0] as ParteVeroFalsoEditor;
  return { onChange, ultima };
}

function gruppo(numero: number) {
  return screen.getByRole("radiogroup", { name: T.valoreDi.replace("{numero}", String(numero)) });
}

describe("ParteVeroFalso", () => {
  it("mostra le affermazioni e il valore scelto per ciascuna", () => {
    montaggio();
    expect(screen.getByDisplayValue("Un quadrato è un rombo")).toBeInTheDocument();
    const [v1, f1] = Array.from(gruppo(1).querySelectorAll('[role="radio"]'));
    expect(v1).toHaveAttribute("aria-checked", "true");
    expect(f1).toHaveAttribute("aria-checked", "false");
    const [v2, f2] = Array.from(gruppo(2).querySelectorAll('[role="radio"]'));
    expect(v2).toHaveAttribute("aria-checked", "false");
    expect(f2).toHaveAttribute("aria-checked", "true");
  });

  it("cambia il valore di un'affermazione senza toccare le altre", async () => {
    const { ultima } = montaggio();
    const [, falso1] = Array.from(gruppo(1).querySelectorAll('[role="radio"]')) as HTMLElement[];
    await userEvent.click(falso1!);
    expect(ultima().vere).toEqual([false, false]);
  });

  it("aggiunge un'affermazione (vera di partenza) e la rimuove, mantenendo allineati i valori", async () => {
    const { ultima } = montaggio();
    await userEvent.click(screen.getByRole("button", { name: T.aggiungi }));
    expect(ultima().affermazioni).toEqual([...PARTE.affermazioni, ""]);
    expect(ultima().vere).toEqual([true, false, true]);
    await userEvent.click(screen.getAllByRole("button", { name: T.rimuovi })[0]!);
    expect(ultima().affermazioni).toEqual(["Un rombo è un quadrato", ""]);
    expect(ultima().vere).toEqual([false, true]);
  });

  it("non lascia rimuovere l'ultima affermazione", () => {
    montaggio({ ...PARTE, affermazioni: ["sola"], vere: [true] });
    expect(screen.getByRole("button", { name: T.rimuovi })).toBeDisabled();
  });

  it("una spiegazione scritta e poi cancellata riporta spiegazioni a undefined", async () => {
    const { ultima } = montaggio();
    const campi = screen.getAllByLabelText(T.spiegazione);
    await userEvent.type(campi[1]!, "x");
    expect(ultima().spiegazioni).toEqual(["", "x"]);
    await userEvent.clear(campi[1]!);
    expect(ultima().spiegazioni).toBeUndefined();
  });
});
