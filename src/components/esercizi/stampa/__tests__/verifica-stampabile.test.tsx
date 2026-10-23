import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
  useLocale: () => "it",
}));

import { VerificaStampabile } from "../verifica-stampabile";

// "Sconti successivi": una scelta singola e una risposta numerica.
const { question } = JSON.parse(
  readFileSync(path.join(process.cwd(), "content/esercizi/16-sconti-successivi.json"), "utf8"),
) as { question: unknown };
const esercizi = [{ titolo: "Sconti successivi", content: question }];
const fogli = [
  { etichetta: "A", nominativo: false, seme: "c1:A" },
  { etichetta: "B", nominativo: false, seme: "c1:B" },
];

function testoDelFoglio(contenitore: HTMLElement, indice: number) {
  const foglio = contenitore.querySelectorAll("section.foglio")[indice] as HTMLElement;
  return foglio.textContent ?? "";
}

describe("VerificaStampabile", () => {
  it("stampa un foglio per versione, con numeri diversi e lo spazio per le risposte", () => {
    const { container } = render(
      <VerificaStampabile titolo="Verifica" classe="1A" esercizi={esercizi} fogli={fogli} conSoluzioni={false} locale="it" />,
    );
    const a = testoDelFoglio(container, 0);
    const b = testoDelFoglio(container, 1);
    expect(a).toContain('versione:{"lettera":"A"}');
    expect(b).toContain('versione:{"lettera":"B"}');
    expect(a.replace('"A"', "")).not.toBe(b.replace('"B"', ""));
    expect(a).toContain("risposta");
    expect(a).toMatch(/A\).*B\)/);
    expect(screen.queryByText("soluzioniTitolo")).not.toBeInTheDocument();
  });

  it("ristampando dà gli stessi fogli", () => {
    const props = { titolo: "Verifica", classe: "1A", esercizi, fogli, conSoluzioni: true, locale: "it" as const };
    const primo = render(<VerificaStampabile {...props} />).container.innerHTML;
    const secondo = render(<VerificaStampabile {...props} />).container.innerHTML;
    expect(secondo).toBe(primo);
  });

  it("aggiunge le soluzioni di ogni versione, con lo svolgimento", () => {
    render(<VerificaStampabile titolo="Verifica" classe="1A" esercizi={esercizi} fogli={fogli} conSoluzioni locale="it" />);
    const soluzioni = screen.getByText("soluzioniTitolo").closest("section")!;
    expect(within(soluzioni).getAllByText(/svolgimento/)).toHaveLength(2);
  });

  it("segnala un esercizio che il motore non riesce a caricare, senza fermare gli altri", () => {
    render(
      <VerificaStampabile
        titolo="Verifica"
        classe="1A"
        esercizi={[{ titolo: "Rotto", content: { parts: "no" } }, ...esercizi]}
        fogli={[fogli[0]]}
        conSoluzioni={false}
        locale="it"
      />,
    );
    expect(screen.getByText("nonStampabile")).toBeInTheDocument();
    expect(screen.getByText(/Sconti successivi/)).toBeInTheDocument();
  });

  it("modo STUDENTE: ogni foglio stampa i SUOI esercizi, non quelli comuni", () => {
    const { container } = render(
      <VerificaStampabile
        titolo="Verifica"
        classe="1A"
        esercizi={[]}
        fogli={[
          { etichetta: "Anna", nominativo: true, seme: "c1:s1", esercizi },
          { etichetta: "Marco", nominativo: true, seme: "c1:s2", esercizi: [{ titolo: "Rotto", content: { parts: "no" } }] },
        ]}
        conSoluzioni={false}
        locale="it"
      />,
    );
    expect(testoDelFoglio(container, 0)).toContain("Sconti successivi");
    expect(testoDelFoglio(container, 0)).not.toContain("Rotto");
    expect(testoDelFoglio(container, 1)).toContain("Rotto");
    expect(testoDelFoglio(container, 1)).not.toContain("Sconti successivi");
  });
});
