import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import type { ParteEditor } from "@/lib/esercizi/editor/modello";
import { ParteSceltaMultipla } from "../parte-scelta-multipla";

type ParteSceltaMultiplaEditor = Extract<ParteEditor, { tipo: "sceltaMultipla" }>;

const T = messaggiIt.esercizi.redazione.parti;

const PARTE: ParteSceltaMultiplaEditor = {
  tipo: "sceltaMultipla",
  consegna: "Quali di questi numeri sono pari?",
  punti: 5,
  risposte: ["2", "3", "4"],
  corrette: [true, false, true],
};

// Genitore con stato vero, come in parte-scelta.test.tsx: senza
// retroazione su `parte` due clic di seguito partirebbero entrambi dal
// valore iniziale.
function Cornice({ parteIniziale, onChange, onRimuovi }: {
  parteIniziale: ParteSceltaMultiplaEditor;
  onChange: (p: ParteSceltaMultiplaEditor) => void;
  onRimuovi: () => void;
}) {
  const [parte, setParte] = useState(parteIniziale);
  return (
    <ParteSceltaMultipla
      parte={parte}
      onChange={(p) => {
        setParte(p);
        onChange(p);
      }}
      onRimuovi={onRimuovi}
    />
  );
}

function montaggio(parte: ParteSceltaMultiplaEditor = PARTE) {
  const onChange = vi.fn();
  const onRimuovi = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <Cornice parteIniziale={parte} onChange={onChange} onRimuovi={onRimuovi} />
    </NextIntlClientProvider>,
  );
  const ultima = () => onChange.mock.calls.at(-1)![0] as ParteSceltaMultiplaEditor;
  return { ...utils, onChange, onRimuovi, ultima };
}

describe("ParteSceltaMultipla", () => {
  it("mostra consegna, punti e ogni risposta, con una casella «corretta» per ciascuna", () => {
    montaggio();
    expect(screen.getByDisplayValue(PARTE.consegna)).toBeInTheDocument();
    for (const r of PARTE.risposte) expect(screen.getByDisplayValue(r)).toBeInTheDocument();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    const caselle = screen.getAllByRole("checkbox", { name: T.sceltaMultipla.corretta });
    expect(caselle.map((c) => (c as HTMLInputElement).checked)).toEqual([true, false, true]);
  });

  it("si possono spuntare più risposte corrette insieme", async () => {
    const { ultima } = montaggio({ ...PARTE, corrette: [false, false, false] });
    const caselle = screen.getAllByRole("checkbox", { name: T.sceltaMultipla.corretta });
    await userEvent.click(caselle[0]!);
    await userEvent.click(caselle[2]!);
    expect(ultima().corrette).toEqual([true, false, true]);
    expect(caselle[0]).toBeChecked();
    expect(caselle[2]).toBeChecked();
  });

  it("togliere la spunta a una corretta la toglie solo a lei", async () => {
    const { ultima } = montaggio();
    await userEvent.click(screen.getAllByRole("checkbox", { name: T.sceltaMultipla.corretta })[0]!);
    expect(ultima().corrette).toEqual([false, false, true]);
  });

  it("senza nessuna risposta corretta mostra un avviso, che sparisce alla prima spunta", async () => {
    montaggio({ ...PARTE, corrette: [false, false, false] });
    expect(screen.getByRole("alert")).toHaveTextContent(T.sceltaMultipla.nessunaCorretta);
    await userEvent.click(screen.getAllByRole("checkbox", { name: T.sceltaMultipla.corretta })[1]!);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("aggiunge una risposta vuota, non corretta, fino a un massimo di otto", async () => {
    const { ultima } = montaggio();
    await userEvent.click(screen.getByRole("button", { name: T.scelta.aggiungiRisposta }));
    expect(ultima().risposte).toEqual(["2", "3", "4", ""]);
    expect(ultima().corrette).toEqual([true, false, true, false]);
  });

  it("il pulsante «aggiungi risposta» è disabilitato a otto risposte", () => {
    const otto = ["1", "2", "3", "4", "5", "6", "7", "8"];
    montaggio({ ...PARTE, risposte: otto, corrette: otto.map((_, i) => i === 0) });
    expect(screen.getByRole("button", { name: T.scelta.aggiungiRisposta })).toBeDisabled();
  });

  it("rimuove una risposta insieme alla sua spunta e alla sua spiegazione", async () => {
    const { ultima } = montaggio({ ...PARTE, spiegazioni: ["", "3 è dispari", ""] });
    await userEvent.click(screen.getAllByRole("button", { name: T.scelta.rimuoviRisposta })[0]!);
    expect(ultima().risposte).toEqual(["3", "4"]);
    expect(ultima().corrette).toEqual([false, true]);
    expect(ultima().spiegazioni).toEqual(["3 è dispari", ""]);
  });

  it("rimuovere l'unica risposta corretta lascia la parte senza corrette, e lo dice", async () => {
    const { ultima } = montaggio({ ...PARTE, corrette: [false, true, false] });
    await userEvent.click(screen.getAllByRole("button", { name: T.scelta.rimuoviRisposta })[1]!);
    expect(ultima().corrette).toEqual([false, false]);
    expect(screen.getByRole("alert")).toHaveTextContent(T.sceltaMultipla.nessunaCorretta);
  });

  it("il pulsante «rimuovi risposta» è disabilitato a due risposte", () => {
    montaggio({ ...PARTE, risposte: ["a", "b"], corrette: [true, false] });
    for (const b of screen.getAllByRole("button", { name: T.scelta.rimuoviRisposta })) expect(b).toBeDisabled();
  });

  it("scrivere una spiegazione la riporta in onChange, allineata alle risposte", async () => {
    const { ultima } = montaggio();
    const campi = screen.getAllByPlaceholderText(T.sceltaMultipla.spiegazione);
    await userEvent.type(campi[1]!, "no");
    expect(ultima().spiegazioni).toEqual(["", "no", ""]);
  });

  it("cancellare l'unica spiegazione scritta la riporta ad assente", async () => {
    const { ultima } = montaggio({ ...PARTE, spiegazioni: ["", "x", ""] });
    await userEvent.clear(screen.getAllByPlaceholderText(T.sceltaMultipla.spiegazione)[1]!);
    expect(ultima().spiegazioni).toBeUndefined();
  });

  it("il bottone rimuovi (della parte) chiama onRimuovi", async () => {
    const { onRimuovi } = montaggio();
    await userEvent.click(screen.getByRole("button", { name: T.rimuovi }));
    expect(onRimuovi).toHaveBeenCalledTimes(1);
  });
});
