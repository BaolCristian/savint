import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { loadQuestion } from "@savint/engine";
import messaggiIt from "@/messages/it.json";
import { ContenutoHtml } from "../contenuto-html";
import { ScopeGrafici } from "../grafico-funzione";

const D = messaggiIt.esercizi.diagramma;

function montaggio(html: string, conScope = true) {
  const q = loadQuestion(
    {
      name: "d",
      variables: {
        dati: { name: "dati", definition: "[3, 5, 2]" },
        giorni: { name: "giorni", definition: '["Lun", "Mar", "Mer"]' },
        zeri: { name: "zeri", definition: "[0, 0]" },
      },
      parts: [],
    },
    { seed: "1" },
  );
  const contenuto = <ContenutoHtml html={html} />;
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      {conScope ? <ScopeGrafici.Provider value={q.scope}>{contenuto}</ScopeGrafici.Provider> : contenuto}
    </NextIntlClientProvider>,
  );
}

describe("diagrammi statistici nel player", () => {
  it("un diagramma a barre ha una barra per valore e una descrizione con i dati", () => {
    const { container } = montaggio('<span data-savint-diagramma="barre" data-valori="dati" data-etichette="giorni"></span>');
    expect(screen.getByRole("img", { name: `${D.barre}: Lun 3, Mar 5, Mer 2` })).toBeInTheDocument();
    const barre = Array.from(container.querySelectorAll("rect[data-barra]"));
    expect(barre).toHaveLength(3);
    // La barra di 5 è la più alta.
    const altezze = barre.map((b) => Number(b.getAttribute("height")));
    expect(altezze[1]).toBeGreaterThan(altezze[0]!);
    expect(altezze[0]).toBeGreaterThan(altezze[2]!);
    expect(screen.getByText("Mar")).toBeInTheDocument();
  });

  it("una torta ha una fetta per valore e una legenda con le percentuali", () => {
    const { container } = montaggio('<span data-savint-diagramma="torta" data-valori="dati" data-etichette="giorni"></span>');
    expect(container.querySelectorAll("path[data-fetta]")).toHaveLength(3);
    // 5 su 10 = 50%.
    expect(screen.getByText(/Mar.*50 ?%/)).toBeInTheDocument();
  });

  it("un istogramma ha le barre attaccate", () => {
    const { container } = montaggio('<span data-savint-diagramma="istogramma" data-valori="dati"></span>');
    const barre = Array.from(container.querySelectorAll("rect[data-barra]"));
    const fine0 = Number(barre[0]!.getAttribute("x")) + Number(barre[0]!.getAttribute("width"));
    expect(Number(barre[1]!.getAttribute("x"))).toBeCloseTo(fine0, 5);
  });

  it("senza la domanda mostra un segnaposto", () => {
    montaggio('<span data-savint-diagramma="barre" data-valori="dati"></span>', false);
    expect(screen.getByText(/si vede nell'anteprima/)).toBeInTheDocument();
  });

  it("dati non disegnabili mostrano un avviso", () => {
    montaggio('<span data-savint-diagramma="torta" data-valori="zeri"></span>');
    expect(screen.getByText(D.errore)).toBeInTheDocument();
  });

  it("uno <span> di diagramma fuori forma non disegna niente", () => {
    const { container } = montaggio('<span data-savint-diagramma="linee" data-valori="dati" onclick="x()"></span>');
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("[onclick]")).toBeNull();
  });
});
