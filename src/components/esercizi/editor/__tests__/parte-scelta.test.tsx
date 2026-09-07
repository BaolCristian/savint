import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import type { ParteEditor } from "@/lib/esercizi/editor/modello";
import { ParteScelta } from "../parte-scelta";

type ParteSceltaEditor = Extract<ParteEditor, { tipo: "scelta" }>;

const PARTE: ParteSceltaEditor = {
  tipo: "scelta",
  consegna: "Quale di questi è un numero primo?",
  punti: 1,
  risposte: ["4", "6", "7"],
  indiceGiusta: 2,
};

// Genitore con stato vero (non un `vi.fn()` senza seguito): senza
// retroazione su `parte`, digitare più caratteri di seguito in un campo
// controllato mostrerebbe sempre l'ultimo `onChange` calcolato dal valore
// INIZIALE, mai da quello appena scritto — lo stesso motivo del gemello in
// parte-numerica.test.tsx.
function Cornice({ parteIniziale, onChange, onRimuovi }: {
  parteIniziale: ParteSceltaEditor;
  onChange: (p: ParteSceltaEditor) => void;
  onRimuovi: () => void;
}) {
  const [parte, setParte] = useState(parteIniziale);
  return (
    <ParteScelta
      parte={parte}
      onChange={(p) => {
        setParte(p);
        onChange(p);
      }}
      onRimuovi={onRimuovi}
    />
  );
}

function montaggio(parte: ParteSceltaEditor = PARTE) {
  const onChange = vi.fn();
  const onRimuovi = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <Cornice parteIniziale={parte} onChange={onChange} onRimuovi={onRimuovi} />
    </NextIntlClientProvider>,
  );
  return { ...utils, onChange, onRimuovi };
}

describe("ParteScelta", () => {
  it("mostra consegna, punti e ogni risposta, con la corretta segnata", () => {
    montaggio();
    expect(screen.getByDisplayValue(PARTE.consegna)).toBeInTheDocument();
    for (const r of PARTE.risposte) expect(screen.getByDisplayValue(r)).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios[2]).toBeChecked();
    expect(radios[0]).not.toBeChecked();
  });

  it("segnare un'altra risposta come corretta chiama onChange con l'indice aggiornato", async () => {
    const { onChange } = montaggio();
    const radios = screen.getAllByRole("radio");
    await userEvent.click(radios[0]!);
    const ultima = onChange.mock.calls.at(-1)![0] as ParteSceltaEditor;
    expect(ultima.indiceGiusta).toBe(0);
    expect(ultima.risposte).toEqual(PARTE.risposte);
  });

  it("aggiunge una risposta vuota, fino a un massimo di sei", async () => {
    const { onChange } = montaggio();
    await userEvent.click(
      screen.getByRole("button", { name: messaggiIt.esercizi.redazione.parti.scelta.aggiungiRisposta }),
    );
    const ultima = onChange.mock.calls.at(-1)![0] as ParteSceltaEditor;
    expect(ultima.risposte).toEqual(["4", "6", "7", ""]);
    expect(ultima.indiceGiusta).toBe(2);
  });

  it("il pulsante «aggiungi risposta» è disabilitato a sei risposte", () => {
    montaggio({ ...PARTE, risposte: ["1", "2", "3", "4", "5", "6"] });
    expect(
      screen.getByRole("button", { name: messaggiIt.esercizi.redazione.parti.scelta.aggiungiRisposta }),
    ).toBeDisabled();
  });

  it("rimuove una risposta, riallineando l'indice della corretta", async () => {
    const { onChange } = montaggio();
    const bottoni = screen.getAllByRole("button", {
      name: messaggiIt.esercizi.redazione.parti.scelta.rimuoviRisposta,
    });
    // Rimuove la prima risposta ("4"): la corretta era all'indice 2 ("7"),
    // dopo la rimozione deve restare "7", ora all'indice 1.
    await userEvent.click(bottoni[0]!);
    const ultima = onChange.mock.calls.at(-1)![0] as ParteSceltaEditor;
    expect(ultima.risposte).toEqual(["6", "7"]);
    expect(ultima.indiceGiusta).toBe(1);
  });

  it("il pulsante «rimuovi risposta» è disabilitato a due risposte", () => {
    montaggio({ ...PARTE, risposte: ["a", "b"], indiceGiusta: 0 });
    for (const bottone of screen.getAllByRole("button", {
      name: messaggiIt.esercizi.redazione.parti.scelta.rimuoviRisposta,
    })) {
      expect(bottone).toBeDisabled();
    }
  });

  it("il bottone rimuovi (della parte) chiama onRimuovi", async () => {
    const { onRimuovi } = montaggio();
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.redazione.parti.rimuovi }));
    expect(onRimuovi).toHaveBeenCalledTimes(1);
  });

  it("scrivere una spiegazione la riporta in onChange, allineata alle altre risposte", async () => {
    const { onChange } = montaggio();
    const spiegazioni = screen.getAllByPlaceholderText(messaggiIt.esercizi.redazione.parti.scelta.spiegazione);
    await userEvent.type(spiegazioni[0]!, "no");
    const ultima = onChange.mock.calls.at(-1)![0] as ParteSceltaEditor;
    expect(ultima.spiegazioni).toEqual(["no", "", ""]);
  });

  // Correzione riportata dalla revisione precedente: rimuovere la risposta
  // segnata come corretta faceva tornare `indiceGiusta` a 0 senza che nulla
  // sullo schermo lo dicesse, e l'esercizio poteva essere salvato così —
  // contenuto sbagliato salvato senza avviso. Qui si richiede una scelta
  // nuova: nessun radio resta segnato finché il docente non ne sceglie uno,
  // e un avviso visibile spiega perché.
  it("rimuovere la risposta corretta mostra un avviso e non lascia nessuna risposta segnata, finché non se ne sceglie una nuova", async () => {
    const { onChange } = montaggio();
    const bottoniRimuovi = screen.getAllByRole("button", {
      name: messaggiIt.esercizi.redazione.parti.scelta.rimuoviRisposta,
    });
    // PARTE.indiceGiusta = 2 ("7"): lo rimuovo.
    await userEvent.click(bottoniRimuovi[2]!);

    expect(screen.getByRole("alert")).toHaveTextContent(
      messaggiIt.esercizi.redazione.parti.scelta.correttaRimossa,
    );
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).not.toBeChecked();
    }

    await userEvent.click(screen.getAllByRole("radio")[0]!);

    expect(screen.queryByRole("alert")).toBeNull();
    const ultima = onChange.mock.calls.at(-1)![0] as ParteSceltaEditor;
    expect(ultima.indiceGiusta).toBe(0);
  });
});
