import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Formula, MacroFormula } from "../formula";

describe("Formula", () => {
  it("rende una formula valida come KaTeX", () => {
    const { container } = render(<Formula tex="x^2" />);
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("rende in display quando richiesto", () => {
    const { container } = render(<Formula tex="\int_0^1 x dx" display />);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("protegge le stringhe che KaTeX rifiuterebbe", () => {
    const { container } = render(<Formula tex={String.raw`\textrm{x_1}`} />);
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("ricade sul testo grezzo invece di lanciare", () => {
    render(<Formula tex={String.raw`\nonesiste{`} />);
    expect(screen.getByText(String.raw`\nonesiste{`)).toBeInTheDocument();
  });

  it("non conosce \\var: un comando del motore sfuggito alla sostituzione resta rumoroso", () => {
    // Il `\var{}` dello studente è già stato sostituito dal motore: se ne
    // arrivasse uno qui, sarebbe un difetto del motore. Deve vedersi — il
    // riquadro grigio — non nascondersi dietro una lettera in corsivo
    // plausibile. Per questo la macro sta nell'eco del docente e non qui.
    const { container } = render(<Formula tex={String.raw`\var{a}`} />);
    expect(screen.getByText(String.raw`\var{a}`)).toBeInTheDocument();
    expect(container.querySelector(".katex")).toBeNull();
  });

  it("una macro dichiarata da un sottoalbero vale solo dentro quel sottoalbero", () => {
    const { container } = render(
      <MacroFormula.Provider value={{ "\\var": String.raw`\mathit{#1}` }}>
        <Formula tex={String.raw`\var{a}`} />
      </MacroFormula.Provider>,
    );
    // KaTeX disegna `\mathit{a}` come `mord mathit`, una lettera nuda come
    // `mord mathnormal`: è il corsivo reso, non solo «qualcosa c'è».
    expect(container.querySelector(".mathit")?.textContent).toBe("a");
  });
});
