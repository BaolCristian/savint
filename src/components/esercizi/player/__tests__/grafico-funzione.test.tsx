import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { loadQuestion } from "@savint/engine";
import messaggiIt from "@/messages/it.json";
import { ContenutoHtml } from "../contenuto-html";
import { ScopeGrafici } from "../grafico-funzione";

const G = messaggiIt.esercizi.grafico;

function domanda() {
  return loadQuestion(
    { name: "g", variables: { a: { name: "a", definition: "2" }, b: { name: "b", definition: "-3" } }, parts: [] },
    { seed: "1" },
  );
}

function montaggio(html: string, conScope = true) {
  const q = domanda();
  const contenuto = <ContenutoHtml html={html} />;
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      {conScope ? <ScopeGrafici.Provider value={q.scope}>{contenuto}</ScopeGrafici.Provider> : contenuto}
    </NextIntlClientProvider>,
  );
}

describe("grafico di funzione nel player", () => {
  it("disegna la curva con i numeri dello studente, con una descrizione", () => {
    const { container } = montaggio('<p>Guarda <span data-savint-grafico="a*x+b" data-x="-5..5" data-y="-10..10"></span></p>');
    const grafico = screen.getByRole("img", { name: G.descrizione.replace("{da}", "-5").replace("{a}", "5") });
    expect(grafico.tagName.toLowerCase()).toBe("svg");
    const curva = container.querySelector("path[data-curva]")!;
    expect(curva).not.toBeNull();
    // y = 2x - 3: in x = 0 la curva passa per y = -3. Il primo punto del
    // tracciato è x = -5, y = -13, fuori dal riquadro [-10, 10]: il disegno
    // lo taglia (clip), ma il punto c'è.
    expect(curva.getAttribute("data-punti")).toBe("241");
  });

  it("l'intervallo delle y automatico contiene la retta", () => {
    const { container } = montaggio('<span data-savint-grafico="a*x+b" data-x="-5..5"></span>');
    const svg = container.querySelector("svg")!;
    const basso = Number(svg.getAttribute("data-y-da"));
    const alto = Number(svg.getAttribute("data-y-a"));
    expect(basso).toBeLessThanOrEqual(-13);
    expect(alto).toBeGreaterThanOrEqual(7);
  });

  // L'eco dell'editor non ha la domanda caricata: niente numeri da usare.
  it("senza la domanda mostra un segnaposto che dice dove si vedrà", () => {
    montaggio('<span data-savint-grafico="a*x+b" data-x="-5..5"></span>', false);
    expect(screen.getByText(/si vede nell'anteprima/)).toBeInTheDocument();
  });

  it("un'espressione che non si calcola mostra un avviso, non rompe la pagina", () => {
    montaggio('<span data-savint-grafico="x +* 2" data-x="-5..5"></span>');
    expect(screen.getByText(G.errore)).toBeInTheDocument();
  });

  it("uno <span> di grafico fuori forma resta uno span vuoto", () => {
    const { container } = montaggio('<p>a<span data-savint-grafico="{a}*x" data-x="-5..5" onclick="x()">b</span></p>');
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("[onclick]")).toBeNull();
    expect(container.querySelector("[data-savint-grafico]")).toBeNull();
  });
});
