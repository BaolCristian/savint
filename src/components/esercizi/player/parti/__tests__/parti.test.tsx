import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { Answer } from "@savint/engine";
import it_ from "@/messages/it.json";
import { InputParte, type PartePubblica } from "../index";
import { InputSceltaSingola } from "../scelta-singola";
import { InputSceltaMultipla } from "../scelta-multipla";

const base = { path: "p0", promptHtml: "<p>Domanda</p>", marks: 1 };

function renderIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="it" messages={it_}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/** `InputParte` è un componente controllato: senza uno stato che si
 * aggiorna a ogni `onChange` e rimonta il valore, React ripristina il
 * valore del campo nativo dopo ogni tasto (il valore del prop `valore` non
 * cambia mai), e digitare più di un carattere lascerebbe solo l'ultimo.
 * Questo wrapper riproduce come lo userà davvero la pagina del player: uno
 * stato che tiene il valore corrente e lo ripassa al componente. */
function NumeroControllato({ onChange }: { onChange: (v: Answer) => void }) {
  const [valore, setValore] = useState<Answer>("");
  const parte = { ...base, type: "numberentry" } as PartePubblica;
  return (
    <InputParte
      parte={parte}
      valore={valore}
      onChange={(v) => {
        setValore(v);
        onChange(v);
      }}
      disabilitato={false}
    />
  );
}

describe("InputParte", () => {
  it("numberentry: scrive il valore digitato", async () => {
    const onChange = vi.fn();
    renderIntl(<NumeroControllato onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "42");
    expect(onChange).toHaveBeenLastCalledWith("42");
  });

  it("1_n_2: una scelta sola, manda l'indice", async () => {
    const onChange = vi.fn();
    const parte = { ...base, type: "1_n_2", scelte: ["<p>tre</p>", "<p>quattro</p>"] } as PartePubblica;
    renderIntl(<InputParte parte={parte} valore={null} onChange={onChange} disabilitato={false} />);
    await userEvent.click(screen.getAllByRole("radio")[1]!);
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it("m_n_2: piu' scelte, manda un vettore di booleani", async () => {
    const onChange = vi.fn();
    const parte = { ...base, type: "m_n_2", scelte: ["<p>a</p>", "<p>b</p>"] } as PartePubblica;
    renderIntl(<InputParte parte={parte} valore={[false, false]} onChange={onChange} disabilitato={false} />);
    await userEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(onChange).toHaveBeenLastCalledWith([true, false]);
  });

  it("m_n_x: manda sempre la matrice ticks [risposta][scelta]", async () => {
    const onChange = vi.fn();
    const parte = { ...base, type: "m_n_x", righe: ["<p>r1</p>", "<p>r2</p>"], colonne: ["<p>c1</p>", "<p>c2</p>"] } as PartePubblica;
    renderIntl(<InputParte parte={parte} valore={[[false, false], [false, false]]} onChange={onChange} disabilitato={false} />);
    await userEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(onChange).toHaveBeenLastCalledWith([[true, false], [false, false]]);
  });

  it("m_n_x: l'orientamento e' [risposta][scelta] anche su una griglia non quadrata (fallirebbe se gli indici fossero scambiati)", async () => {
    // 2 righe (scelte) x 3 colonne (risposte): una griglia quadrata non può
    // dimostrare l'orientamento, perché scambiare gli indici sulla cella
    // (0,0) produce comunque lo stesso risultato. Qui la forma della matrice
    // ([risposta][scelta] = [3][2]) e la posizione toccata sono diverse a
    // seconda dell'orientamento, quindi un'inversione fa fallire l'asserzione
    // finale invece di passarla per caso.
    const onChange = vi.fn();
    const parte = {
      ...base,
      type: "m_n_x",
      righe: ["<p>r1</p>", "<p>r2</p>"],
      colonne: ["<p>c1</p>", "<p>c2</p>", "<p>c3</p>"],
    } as PartePubblica;
    const vuota = [
      [false, false],
      [false, false],
      [false, false],
    ];
    renderIntl(<InputParte parte={parte} valore={vuota} onChange={onChange} disabilitato={false} />);
    // Riga 0 (prima <tr>), terza colonna: il terzo checkbox del DOM.
    await userEvent.click(screen.getAllByRole("checkbox")[2]!);
    expect(onChange).toHaveBeenLastCalledWith([
      [false, false],
      [false, false],
      [true, false],
    ]);
  });

  it("gapfill: un input per gap, manda un vettore", async () => {
    const onChange = vi.fn();
    const parte = { ...base, type: "gapfill", gaps: [
      { path: "p0g0", type: "numberentry", promptHtml: "", marks: 1 },
      { path: "p0g1", type: "numberentry", promptHtml: "", marks: 1 },
    ] } as PartePubblica;
    renderIntl(<InputParte parte={parte} valore={["", ""]} onChange={onChange} disabilitato={false} />);
    await userEvent.type(screen.getAllByRole("textbox")[1]!, "7");
    expect(onChange).toHaveBeenLastCalledWith(["", "7"]);
  });

  // Onda finale, punto 3: il prompt di 03-sistemi-lineari è
  // `<p>\(x = \) [[0]], \(y = \) [[1]]</p>` e lo studente lo leggeva
  // esattamente così, con due caselle nude sotto: quale fosse la x si poteva
  // solo dedurre dalla posizione. I segnaposti li deve sostituire il player
  // (il motore li lascia stare di proposito).
  it("gapfill: ogni campo prende il posto del suo segnaposto nel testo", () => {
    const parte = { ...base, type: "gapfill", promptHtml: "<p>Prima [[0]] in mezzo [[1]] dopo</p>", gaps: [
      { path: "p0g0", type: "numberentry", promptHtml: "", marks: 1 },
      { path: "p0g1", type: "numberentry", promptHtml: "", marks: 1 },
    ] } as PartePubblica;
    const { container } = renderIntl(
      <InputParte parte={parte} valore={["", ""]} onChange={vi.fn()} disabilitato={false} />,
    );

    // Nessun segnaposto resta a schermo.
    expect(container.textContent).not.toContain("[[0]]");
    expect(container.textContent).not.toContain("[[1]]");

    // E i campi sono davvero intercalati al testo, nell'ordine giusto:
    // impilarli sotto il prompt farebbe fallire queste disuguaglianze.
    const html = container.innerHTML;
    const posizioni = [
      html.indexOf("Prima"),
      html.indexOf('data-parte="p0g0"'),
      html.indexOf("in mezzo"),
      html.indexOf('data-parte="p0g1"'),
      html.indexOf("dopo"),
    ];
    expect(posizioni.every((p) => p >= 0)).toBe(true);
    expect([...posizioni].sort((a, b) => a - b)).toEqual(posizioni);
  });

  it("gapfill: se il prompt non nomina tutti gli spazi, i campi restano visibili", () => {
    const parte = { ...base, type: "gapfill", promptHtml: "<p>Solo il primo: [[0]]</p>", gaps: [
      { path: "p0g0", type: "numberentry", promptHtml: "", marks: 1 },
      { path: "p0g1", type: "numberentry", promptHtml: "", marks: 1 },
    ] } as PartePubblica;
    renderIntl(<InputParte parte={parte} valore={["", ""]} onChange={vi.fn()} disabilitato={false} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
  });

  it("information: nessun campo da compilare", () => {
    const parte = { ...base, type: "information" } as PartePubblica;
    renderIntl(<InputParte parte={parte} valore={null} onChange={vi.fn()} disabilitato={false} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("disabilitato: i campi non si possono toccare", () => {
    const parte = { ...base, type: "numberentry" } as PartePubblica;
    renderIntl(<InputParte parte={parte} valore="1" onChange={vi.fn()} disabilitato />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});

// Il motore mescola le risposte per ogni studente (`shuffleAnswers` di
// `1_n_2`/`m_n_2`) ma le risposte restano indicizzate nell'ordine
// originale: il player mostra le scelte nell'ordine mescolato e invia
// sempre l'indice ORIGINALE. Prima le mostrava nell'ordine del docente, e la
// risposta giusta stava per tutti nello stesso posto.
describe("le scelte nell'ordine mescolato", () => {
  const parte = { path: "p0", type: "1_n_2" as const, promptHtml: "", marks: 1, scelte: ["<p>A</p>", "<p>B</p>", "<p>C</p>"], ordine: [2, 0, 1] };

  it("scelta singola: mostra C, A, B e cliccando il primo invia 2", async () => {
    const onChange = vi.fn();
    const { container } = render(<InputSceltaSingola parte={parte} valore={null as never} onChange={onChange} disabilitato={false} />);
    expect(Array.from(container.querySelectorAll("label")).map((l) => l.textContent)).toEqual(["C", "A", "B"]);
    await userEvent.click(container.querySelectorAll("input")[0]!);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("scelta multipla: le spunte restano nell'ordine originale", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <InputSceltaMultipla parte={{ ...parte, type: "m_n_2" }} valore={[false, false, false]} onChange={onChange} disabilitato={false} />,
    );
    expect(Array.from(container.querySelectorAll("label")).map((l) => l.textContent)).toEqual(["C", "A", "B"]);
    await userEvent.click(container.querySelectorAll("input")[0]!);
    expect(onChange).toHaveBeenCalledWith([false, false, true]);
  });
});
