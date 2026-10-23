import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { NumbasQuestionJSON } from "@savint/engine";
import type { RisultatiStudente as Dati } from "@/lib/esercizi/risultati-verifica";
import messaggiIt from "@/messages/it.json";
import { RisultatiStudente } from "../[id]/risultati-studente";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const contenuto = (risposta: string) => ({
  name: "Esercizio",
  statement: "<p>Testo</p>",
  advice: "<p>Come si fa</p>",
  variables: {},
  parts: [{ type: "patternmatch", marks: 1, matchMode: "exact", answer: risposta, prompt: "<p>Scrivi</p>" }],
}) as unknown as NumbasQuestionJSON;

const dati: Dati = {
  finale: 16.5,
  totalePieno: 20,
  percentuale: 82.5,
  esercizi: [
    { numero: 1, esercizioId: "e1", titolo: "Uno", punti: 4, puntiMax: 4, seed: "s1", content: contenuto("a"), state: null },
    { numero: 2, esercizioId: "e2", titolo: "Due", punti: 1.25, puntiMax: 4, seed: "s2", content: contenuto("b"), state: null },
  ],
};

const r = messaggiIt.esercizi.verifica.risultati.studente;

function monta(risultati: Dati | null) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <RisultatiStudente risultati={risultati} locale="it" />
    </NextIntlClientProvider>,
  );
}

describe("RisultatiStudente", () => {
  it("prima della pubblicazione: «Risultati non ancora pubblicati», nessun punto", () => {
    monta(null);
    expect(screen.getByRole("heading", { name: r.nonPubblicati })).toBeInTheDocument();
    expect(screen.queryByText(/\/ \d+ punti/)).toBeNull();
    expect(screen.getByRole("link", { name: r.tornaHome })).toHaveAttribute("href", "/studente");
  });

  it("totale, punti per esercizio con la virgola, revisione e «Esercitati di nuovo» verso la pratica", async () => {
    monta(dati);
    expect(screen.getByText("16,5 / 20 punti (82,5%)")).toBeInTheDocument();
    const secondo = screen.getByRole("heading", { name: "Esercizio 2 — 1,25/4" }).closest("section")!;
    expect(within(secondo).getByRole("link", { name: r.esercitati })).toHaveAttribute("href", "/studente/esercizio/e2");
    expect(await within(secondo).findByText("Come si fa")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: r.esercitati })).toHaveLength(2);
  });

  it("non parla di uscite né di misure PDP", async () => {
    const { container } = monta(dati);
    await screen.findAllByText("Come si fa");
    expect(container.textContent).not.toMatch(/uscit/i);
    expect(container.textContent).not.toMatch(/PDP/);
  });
});
