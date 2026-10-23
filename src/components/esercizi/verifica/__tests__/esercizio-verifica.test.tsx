import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { NumbasQuestionJSON, QuestionState } from "@savint/engine";
import type { EsercizioProva } from "@/lib/esercizi/prova-verifica";
import messaggiIt from "@/messages/it.json";
import { EsercizioVerifica } from "../esercizio-verifica";

// Due parti di testo libero: abbastanza per vedere che ogni parte ha il suo
// campo e nessuna il suo «Invia».
const dueParti = {
  name: "Prova verifica",
  statement: "<p>Testo della domanda</p>",
  variables: {},
  parts: [
    { type: "patternmatch", marks: 1, matchMode: "exact", answer: "uno", prompt: "<p>Prima</p>" },
    { type: "patternmatch", marks: 1, matchMode: "exact", answer: "due", prompt: "<p>Seconda</p>" },
  ],
} as unknown as NumbasQuestionJSON;

const esercizio: EsercizioProva = { tentativoId: "t1", numero: 1, seed: "seme", content: dueParti, state: null };

function monta(o: Partial<React.ComponentProps<typeof EsercizioVerifica>> = {}) {
  const onStato = vi.fn<(id: string, s: QuestionState, r: boolean) => void>();
  const onUscitaCampo = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <EsercizioVerifica
        esercizio={esercizio}
        locale="it"
        disabilitato={false}
        onStato={onStato}
        onUscitaCampo={onUscitaCampo}
        {...o}
      />
    </NextIntlClientProvider>,
  );
  return { ...utils, onStato, onUscitaCampo };
}

// Scrivere nel campo: un evento `change` per volta, senza user-event (che
// con i timer finti si ferma ad aspettare i propri ritardi).
const scrivi = (campo: HTMLElement, testo: string) => fireEvent.change(campo, { target: { value: testo } });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("EsercizioVerifica", () => {
  it("non mostra pulsanti di invio, feedback, soluzioni né punteggio", async () => {
    const { onStato } = monta();
    const [primo] = screen.getAllByRole("textbox");
    scrivi(primo, "sbagliato");
    await act(() => vi.advanceTimersByTimeAsync(700));
    expect(onStato).toHaveBeenCalled();

    for (const nome of ["Invia", "Riprova", "Ricomincia"]) {
      expect(screen.queryByRole("button", { name: nome })).toBeNull();
    }
    expect(screen.queryByText(/Risposta corretta/)).toBeNull();
    expect(screen.queryByText(/Risposta sbagliata/)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(new RegExp(messaggiIt.esercizi.punteggio))).toBeNull();
  });

  it("dopo 700 ms senza battute passa lo stato del motore con la risposta", async () => {
    const { onStato } = monta();
    const [primo] = screen.getAllByRole("textbox");
    scrivi(primo, "uno");
    expect(onStato).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(699));
    expect(onStato).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(onStato).toHaveBeenCalledTimes(1);
    const [id, state, risposto] = onStato.mock.calls[0];
    expect(id).toBe("t1");
    expect(risposto).toBe(true);
    expect(state.parts.find((p) => p.path === "p0")).toMatchObject({ answered: true, answer: "uno" });
    // Nessun punteggio esce verso il genitore? Lo stato del motore lo porta,
    // ma la prova non lo mostra mai: qui conta solo la risposta.
    expect(state.parts.find((p) => p.path === "p1")?.answered).toBeFalsy();
  });

  it("uscire dal campo prima dei 700 ms salva subito", async () => {
    const { onStato, onUscitaCampo } = monta();
    const [primo] = screen.getAllByRole("textbox");
    scrivi(primo, "uno");
    expect(onStato).not.toHaveBeenCalled();
    fireEvent.blur(primo);
    expect(onStato).toHaveBeenCalledTimes(1);
    expect(onUscitaCampo).toHaveBeenCalled();
    // Il timer già partito non manda un secondo stato identico.
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(onStato).toHaveBeenCalledTimes(1);
  });

  it("un campo svuotato conta come non risposto", async () => {
    const { onStato } = monta();
    const [primo] = screen.getAllByRole("textbox");
    scrivi(primo, "uno");
    fireEvent.blur(primo);
    scrivi(primo, "");
    fireEvent.blur(primo);
    expect(onStato).toHaveBeenLastCalledWith("t1", expect.anything(), false);
  });

  it("riprende le risposte salvate", () => {
    const state = {
      seed: "seme",
      parts: [{ path: "p0", answered: true, answer: "uno", score: 0 }],
    } as unknown as QuestionState;
    monta({ esercizio: { ...esercizio, state } });
    expect(screen.getAllByRole("textbox")[0]).toHaveValue("uno");
  });

  it("il testo della domanda non si copia, i campi sì", async () => {
    monta();
    const testo = screen.getByText("Testo della domanda");
    const copia = new Event("copy", { bubbles: true, cancelable: true });
    testo.dispatchEvent(copia);
    expect(copia.defaultPrevented).toBe(true);

    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    testo.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);

    const incolla = new Event("paste", { bubbles: true, cancelable: true });
    screen.getAllByRole("textbox")[0].dispatchEvent(incolla);
    expect(incolla.defaultPrevented).toBe(false);
  });

  it("disabilitato rende i campi non modificabili", () => {
    monta({ disabilitato: true });
    for (const campo of screen.getAllByRole("textbox")) expect(campo).toBeDisabled();
  });
});
