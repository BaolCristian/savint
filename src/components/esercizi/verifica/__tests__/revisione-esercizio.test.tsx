import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import messaggiIt from "@/messages/it.json";
import { RevisioneEsercizio } from "../revisione-esercizio";

// Due parti di testo: la prima giusta, la seconda sbagliata; con lo
// svolgimento, che nella revisione si vede senza clic.
const contenuto = {
  name: "Revisione",
  statement: "<p>Testo della domanda</p>",
  advice: "<p>Svolgimento passo per passo</p>",
  variables: {},
  parts: [
    { type: "patternmatch", marks: 1, matchMode: "exact", answer: "uno", prompt: "<p>Prima</p>" },
    { type: "patternmatch", marks: 1, matchMode: "exact", answer: "due", prompt: "<p>Seconda</p>" },
  ],
} as unknown as NumbasQuestionJSON;

function statoSalvato() {
  const q = loadQuestion(contenuto, { seed: "seme", locale: "it" });
  q.getPart("p0")!.submit("uno");
  q.getPart("p1")!.submit("tre");
  q.updateScore();
  return q.toState();
}

function monta(state = statoSalvato()) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <RevisioneEsercizio seed="seme" content={contenuto} state={state} locale="it" />
    </NextIntlClientProvider>,
  );
}

describe("RevisioneEsercizio", () => {
  it("mostra le risposte dello studente nei campi disabilitati", async () => {
    monta();
    const campi = await screen.findAllByRole("textbox");
    expect(campi).toHaveLength(2);
    expect(campi.map((c) => (c as HTMLInputElement).value)).toEqual(["uno", "tre"]);
    for (const c of campi) expect(c).toBeDisabled();
  });

  it("mostra correzione, risposta attesa e svolgimento senza clic, e nessun pulsante", async () => {
    monta();
    await screen.findAllByRole("textbox");
    expect(screen.getAllByText(/Risposta attesa/)).toHaveLength(2);
    expect(screen.getByText("due")).toBeInTheDocument();
    expect(screen.getByText("Svolgimento passo per passo")).toBeInTheDocument();
    expect(screen.getByText(/Risposta corretta/)).toBeInTheDocument();
    expect(screen.getByText(/Risposta sbagliata/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("un esercizio mai risposto: campi vuoti, nessuna correzione, risposta attesa sì", async () => {
    monta(null as never);
    const campi = await screen.findAllByRole("textbox");
    expect(campi.map((c) => (c as HTMLInputElement).value)).toEqual(["", ""]);
    expect(screen.queryByText(/Risposta corretta/)).toBeNull();
    await waitFor(() => expect(screen.getAllByText(/Risposta attesa/)).toHaveLength(2));
  });
});
