import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { loadQuestion } from "@savint/engine";
import messaggiIt from "@/messages/it.json";
import { ContenutoHtml } from "../contenuto-html";
import { ScopeGrafici } from "../grafico-funzione";

const F = messaggiIt.esercizi.figura;

function montaggio(html: string, conScope = true) {
  const q = loadQuestion(
    {
      name: "f",
      variables: {
        a: { name: "a", definition: "3" },
        b: { name: "b", definition: "4" },
        r: { name: "r", definition: "2.5" },
        z: { name: "z", definition: "0" },
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

describe("figure geometriche nel player", () => {
  it("un triangolo rettangolo con le misure dello studente e l'ipotenusa incognita", () => {
    const { container } = montaggio(
      '<span data-savint-figura="triangolo rettangolo" data-misure="a, b" data-unita="cm" data-incognite="3"></span>',
    );
    expect(screen.getByRole("img", { name: `${F.triangoloRettangolo}: cateto 3 cm, cateto 4 cm, ipotenusa ?` })).toBeInTheDocument();
    expect(screen.getByText("3 cm")).toBeInTheDocument();
    expect(screen.getByText("4 cm")).toBeInTheDocument();
    expect(screen.getByText("?")).toBeInTheDocument();
    expect(container.querySelector("polygon[data-figura]")).not.toBeNull();
  });

  it("disegna in scala: il cateto di 4 è più lungo di quello di 3", () => {
    const { container } = montaggio('<span data-savint-figura="triangolo rettangolo" data-misure="a, b"></span>');
    const punti = container.querySelector("polygon[data-figura]")!.getAttribute("points")!
      .split(" ").map((p) => p.split(",").map(Number) as [number, number]);
    const [A, B, C] = punti as [[number, number], [number, number], [number, number]];
    const lungo = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    expect(lungo(A, C) / lungo(A, B)).toBeCloseTo(4 / 3, 2);
  });

  it("un cerchio mostra il raggio con la virgola", () => {
    const { container } = montaggio('<span data-savint-figura="cerchio" data-misure="r" data-unita="m"></span>');
    expect(container.querySelector("circle[data-figura]")).not.toBeNull();
    expect(screen.getByText("r = 2,5 m")).toBeInTheDocument();
  });

  it("senza la domanda mostra un segnaposto", () => {
    montaggio('<span data-savint-figura="quadrato" data-misure="a"></span>', false);
    expect(screen.getByText(/si vede nell'anteprima/)).toBeInTheDocument();
  });

  it("misure impossibili mostrano un avviso", () => {
    montaggio('<span data-savint-figura="quadrato" data-misure="z"></span>');
    expect(screen.getByText(F.errore)).toBeInTheDocument();
  });
});
