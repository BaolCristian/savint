import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import type { NumbasQuestionJSON } from "@savint/engine";
import type { EsercizioEditor } from "@/lib/esercizi/editor/modello";
import { versoNumbas } from "@/lib/esercizi/editor/verso-numbas";
import { ValoriSorteggiati } from "../valori-sorteggiati";

/** Stessa base minima di verifica.test.ts (Task 3 non tocca quel file):
 * duplicata qui perché un fixture condiviso fra file di test creerebbe un
 * accoppiamento che nessuno dei due task ha chiesto. */
const BASE: EsercizioEditor = {
  meta: { titolo: "T", descrizione: "", anno: 1, argomento: "equazioni", tag: [], difficolta: 1 },
  testo: "Testo",
  suggerimento: "",
  variabili: [],
  condizione: "",
  parti: [{ tipo: "numerica", consegna: "\\(x=\\)", punti: 1, valore: "1", tolleranza: { tipo: "esatta" } }],
};

function contenuto(variabili: EsercizioEditor["variabili"]): NumbasQuestionJSON {
  return versoNumbas({ ...BASE, variabili }) as NumbasQuestionJSON;
}

function montaggio(content: NumbasQuestionJSON, semi: string[]) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <ValoriSorteggiati content={content} semi={semi} />
    </NextIntlClientProvider>,
  );
}

describe("ValoriSorteggiati", () => {
  it("due variabili e tre semi danno una tabella 2×3 con i valori attesi per semi fissi", () => {
    // Definizioni deterministiche (nessun `random`): i valori attesi non
    // dipendono dal seme, quindi la prova non è accoppiata al generatore
    // casuale del motore — solo al cablaggio nomi/valori/colonne.
    const content = contenuto([
      { nome: "a", definizione: "5", descrizione: "" },
      { nome: "b", definizione: "a + 1", descrizione: "" },
    ]);
    montaggio(content, ["0", "1", "2"]);

    // Intestazione: la colonna dei nomi più una per seme.
    const intestazione = screen.getAllByRole("row")[0]!;
    const intestazioni = within(intestazione).getAllByRole("columnheader");
    expect(intestazioni.map((c) => c.textContent)).toEqual(["Variabile", "Sorteggio 1", "Sorteggio 2", "Sorteggio 3"]);

    const righe = screen.getAllByRole("row").slice(1);
    expect(righe).toHaveLength(2);

    const rigaA = within(righe[0]!).getAllByRole("cell");
    expect(rigaA.map((c) => c.textContent)).toEqual(["a", "5", "5", "5"]);

    const rigaB = within(righe[1]!).getAllByRole("cell");
    expect(rigaB.map((c) => c.textContent)).toEqual(["b", "6", "6", "6"]);
  });

  it("un contenuto che lancia al caricamento su un solo seme mostra il trattino in quella colonna e i valori nelle altre", () => {
    // a = random(-3..3), b = random(1..(1/a)): quando a vale 0 l'estremo
    // 1/a è infinito e generare un numero casuale in quell'intervallo
    // lancia — misurato in verifica.test.ts ("una definizione che divide
    // per zero fallisce solo su alcuni semi"), dove il seme "14" è fra
    // quelli che lanciano e "0" e "1" fra quelli che non lanciano. Lo si
    // riusa qui com'è, senza rimisurarlo: è lo stesso motore, lo stesso
    // fatto.
    const content = contenuto([
      { nome: "a", definizione: "random(-3..3)", descrizione: "" },
      { nome: "b", definizione: "random(1..(1/a))", descrizione: "" },
    ]);
    montaggio(content, ["0", "14", "1"]);

    const righe = screen.getAllByRole("row").slice(1);
    expect(righe).toHaveLength(2);

    for (const riga of righe) {
      const celle = within(riga).getAllByRole("cell");
      // celle[0] è il nome della variabile, celle[1..3] i tre semi.
      expect(celle[2]!.textContent).toBe("—");
      expect(celle[1]!.textContent).not.toBe("—");
      expect(celle[3]!.textContent).not.toBe("—");
      expect(celle[1]!.textContent).not.toBe("");
      expect(celle[3]!.textContent).not.toBe("");
    }
  });

  it("un contenuto che lancia su tutti e tre i semi rende null", () => {
    // "2*" non compila: jme.compile lancia in fase di caricamento, per
    // costruzione, indipendentemente dal seme — non serve trovare tre semi
    // che falliscano tutti "per caso".
    const content = contenuto([{ nome: "a", definizione: "2*", descrizione: "" }]);
    const { container } = montaggio(content, ["0", "1", "2"]);

    expect(container).toBeEmptyDOMElement();
  });

  it("senza variabili dichiarate, non c'è niente da mostrare: rende null", () => {
    const content = contenuto([]);
    const { container } = montaggio(content, ["0", "1", "2"]);

    expect(container).toBeEmptyDOMElement();
  });
});
