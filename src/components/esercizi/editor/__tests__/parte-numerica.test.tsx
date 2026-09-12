import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import type { ParteEditor } from "@/lib/esercizi/editor/modello";
import { ParteNumerica } from "../parte-numerica";
import { campoFormulaAperto, preparaJsdomPerMathlive } from "./aiuto-mathlive";

preparaJsdomPerMathlive();

const CAMPO = messaggiIt.esercizi.redazione.campoJme;
const FINESTRA = messaggiIt.esercizi.redazione.finestraFormula;

type ParteNumericaEditor = Extract<ParteEditor, { tipo: "numerica" }>;

const PARTE: ParteNumericaEditor = {
  tipo: "numerica",
  consegna: "Quanto vale a+b?",
  punti: 2,
  valore: "{a}+{b}",
  tolleranza: { tipo: "esatta" },
};

// Un piccolo genitore con stato vero, non un `vi.fn()` senza seguito: il
// campo margine/cifre compare solo dopo che il cambio di tolleranza è
// arrivato a `parte` come farebbe `editor-esercizio.tsx` in pagina — un
// `onChange` che non retroagisce sullo stato non farebbe mai comparire quel
// campo, e i test che scrivono lì dentro non troverebbero nulla.
function Cornice({ parteIniziale, onChange, onRimuovi }: {
  parteIniziale: ParteNumericaEditor;
  onChange: (p: ParteNumericaEditor) => void;
  onRimuovi: () => void;
}) {
  const [parte, setParte] = useState(parteIniziale);
  return (
    <ParteNumerica
      parte={parte}
      onChange={(p) => {
        setParte(p);
        onChange(p);
      }}
      onRimuovi={onRimuovi}
      // I nomi dichiarati nel pannello variabili: qui nessuno, come in un
      // esercizio senza variabili.
      nomiVariabili={[]}
    />
  );
}

function montaggio(parte: ParteNumericaEditor = PARTE) {
  const onChange = vi.fn();
  const onRimuovi = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <Cornice parteIniziale={parte} onChange={onChange} onRimuovi={onRimuovi} />
    </NextIntlClientProvider>,
  );
  return { ...utils, onChange, onRimuovi };
}

describe("ParteNumerica", () => {
  it("mostra consegna, punti e valore", () => {
    montaggio();
    expect(screen.getByDisplayValue("Quanto vale a+b?")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("{a}+{b}")).toBeInTheDocument();
  });

  it("non mostra mai minValue o maxValue: solo valore e tolleranza", () => {
    const { container } = montaggio();
    expect(container.textContent).not.toMatch(/minValue|maxValue/i);
    expect(screen.getByText(messaggiIt.esercizi.redazione.parti.numerica.valore)).toBeInTheDocument();
    expect(screen.getByText(messaggiIt.esercizi.redazione.parti.numerica.tolleranza)).toBeInTheDocument();
  });

  it("modificare il valore chiama onChange con la parte aggiornata", async () => {
    const { onChange } = montaggio();
    const campo = screen.getByLabelText(messaggiIt.esercizi.redazione.parti.numerica.valore);
    await userEvent.type(campo, "!");
    const ultima = onChange.mock.calls.at(-1)![0] as ParteNumericaEditor;
    expect(ultima.valore).toBe("{a}+{b}!");
    expect(ultima.consegna).toBe(PARTE.consegna);
  });

  it("passare a tolleranza «margine» mostra il campo margine e lo riporta in onChange", async () => {
    const { onChange } = montaggio();
    await userEvent.click(
      screen.getByRole("radio", { name: messaggiIt.esercizi.redazione.parti.numerica.tolleranzaMargine }),
    );
    const campoMargine = await screen.findByLabelText(messaggiIt.esercizi.redazione.parti.numerica.margine);
    await userEvent.type(campoMargine, "0.01");
    const ultima = onChange.mock.calls.at(-1)![0] as ParteNumericaEditor;
    expect(ultima.tolleranza).toEqual({ tipo: "margine", margine: "0.01" });
  });

  it("il margine non ha la tastiera di simboli, il valore atteso sì", async () => {
    // Il margine è una tolleranza — `0.01`, un decimale — non una risposta
    // attesa: `π`, `√`, `^` non si scrivono lì, e una riga di tasti sotto un
    // campo così è rumore. Il valore atteso invece è matematica
    // (`sqrt(2)*a` è una risposta plausibile) e la tastiera resta.
    montaggio();
    const tastiere = () => screen.queryAllByRole("group", { name: messaggiIt.esercizi.tastieraSimboli });
    expect(tastiere()).toHaveLength(1);
    await userEvent.click(
      screen.getByRole("radio", { name: messaggiIt.esercizi.redazione.parti.numerica.tolleranzaMargine }),
    );
    await screen.findByLabelText(messaggiIt.esercizi.redazione.parti.numerica.margine);
    expect(tastiere()).toHaveLength(1);
  });

  it("il margine non ha l'assistente per le formule, il valore atteso sì", async () => {
    // La stessa ragione della tastiera, e vale la pena sorvegliarla a
    // parte: la prop che accende l'assistente è diversa da quella della
    // tastiera, e senza questa riga niente impedirebbe che il pulsante
    // ricomparisse sotto un campo dove una formula disegnata non ha senso —
    // un margine è `0.01`, un editor visuale non ha niente da disegnarci.
    montaggio();
    const pulsanti = () =>
      screen.queryAllByRole("button", { name: messaggiIt.esercizi.redazione.campoJme.scriviFormula });
    expect(pulsanti()).toHaveLength(1);
    await userEvent.click(
      screen.getByRole("radio", { name: messaggiIt.esercizi.redazione.parti.numerica.tolleranzaMargine }),
    );
    await screen.findByLabelText(messaggiIt.esercizi.redazione.parti.numerica.margine);
    expect(pulsanti()).toHaveLength(1);
  });

  it("il margine mostra comunque l'eco: anche una tolleranza va vista come il motore l'ha capita", async () => {
    const { container } = montaggio();
    await userEvent.click(
      screen.getByRole("radio", { name: messaggiIt.esercizi.redazione.parti.numerica.tolleranzaMargine }),
    );
    const campoMargine = await screen.findByLabelText(messaggiIt.esercizi.redazione.parti.numerica.margine);
    await userEvent.type(campoMargine, "0.01");
    const echi = [...container.querySelectorAll(".katex-html")].map((n) => n.textContent);
    expect(echi).toContain("0.01");
  });

  it("passare a tolleranza «decimali» mostra il campo cifre e lo riporta in onChange", async () => {
    const { onChange } = montaggio();
    await userEvent.click(
      screen.getByRole("radio", { name: messaggiIt.esercizi.redazione.parti.numerica.tolleranzaDecimali }),
    );
    const campoCifre = await screen.findByLabelText(messaggiIt.esercizi.redazione.parti.numerica.cifreDecimali);
    await userEvent.clear(campoCifre);
    await userEvent.type(campoCifre, "3");
    const ultima = onChange.mock.calls.at(-1)![0] as ParteNumericaEditor;
    expect(ultima.tolleranza).toEqual({ tipo: "decimali", cifre: 3 });
  });

  it("il bottone rimuovi chiama onRimuovi", async () => {
    const { onRimuovi } = montaggio();
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.redazione.parti.rimuovi }));
    expect(onRimuovi).toHaveBeenCalledTimes(1);
  });
});

describe("ParteNumerica: il valore atteso non ammette l'incognita", () => {
  it("una formula con un simbolo libero è rifiutata, e il campo non cambia", async () => {
    // Il gemello contrario della prova in `parte-espressione.test.tsx`: la
    // stessa formula, l'altra superficie. Qui il valore deve venir fuori
    // dalle variabili dichiarate — un nome libero è un errore, non
    // un'incognita — e le due prove insieme sono ciò che impedisce di
    // accendere o spegnere `incognitaAmmessa` su entrambe per sbaglio.
    montaggio();
    const valore = screen.getByLabelText(
      messaggiIt.esercizi.redazione.parti.numerica.valore,
    ) as HTMLInputElement;
    const prima = valore.value;

    await userEvent.click(screen.getByRole("button", { name: CAMPO.scriviFormula }));
    const campo = await campoFormulaAperto();
    campo.value = "2y";
    await userEvent.click(screen.getByRole("button", { name: FINESTRA.inserisci }));

    expect(valore.value).toBe(prima);
    expect((await screen.findByRole("alert")).textContent).toContain("y");
  });
});

/** La descrizione del campo risolta a mano — `aria-describedby` seguito fino
 * al testo, come farebbe una tecnologia assistiva.
 *
 * `document.getElementById` e non `querySelector("#…")`: gli `id` di
 * `useId` contengono i due punti, che in un selettore CSS non sono un
 * carattere ordinario. */
function descrizioneDi(campo: HTMLElement): string {
  return (campo.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

/** Due parti numeriche nello stesso esercizio: caso supportato (ciascuna
 * porta il suo «Parte N»), e prima di `useId` ciascuna portava anche gli
 * stessi `id` costanti dell'altra. */
function montaggioDoppio(prima: string, seconda: string) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <Cornice parteIniziale={{ ...PARTE, valore: prima }} onChange={vi.fn()} onRimuovi={vi.fn()} />
      <Cornice parteIniziale={{ ...PARTE, valore: seconda }} onChange={vi.fn()} onRimuovi={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe("ParteNumerica: due parti dello stesso esercizio non si scambiano gli id", () => {
  it("ogni campo del valore è descritto dalla PROPRIA eco, non da quella dell'altra parte", () => {
    // Con `id` costanti i due campi condividevano `id`, e da quell'`id`
    // discende `${id}-eco`: l'`aria-describedby` del secondo campo puntava
    // all'eco del PRIMO — cioè al lettore di schermo, sotto il valore atteso
    // della seconda domanda, arrivava l'interpretazione del motore della
    // prima. Un `id` duplicato era un fastidio; con l'eco appesa sopra è
    // un'informazione sbagliata.
    montaggioDoppio("2*", "sin x");

    const campi = screen.getAllByLabelText(
      messaggiIt.esercizi.redazione.parti.numerica.valore,
    ) as HTMLInputElement[];
    expect(campi).toHaveLength(2);
    expect(campi[0]!.id).not.toBe(campi[1]!.id);

    // Ciascuno sente il proprio: l'errore del motore sotto «2*», la
    // moltiplicazione implicita sotto «sin x».
    expect(descrizioneDi(campi[0]!)).toContain("Argomenti insufficienti per l'operazione *");
    expect(descrizioneDi(campi[0]!)).not.toContain("sin×x");
    expect(descrizioneDi(campi[1]!)).toContain("sin×x");
    expect(descrizioneDi(campi[1]!)).not.toContain("Argomenti insufficienti");
  });

  it("la tolleranza scelta in una parte non spegne quella dell'altra", async () => {
    // I tre radio prendono il `name` dallo stesso `id`: con `id` costanti i
    // due terzetti diventano per il browser UN gruppo solo, e scegliere
    // «margine» nella parte 2 toglierebbe la scelta alla parte 1 — senza che
    // il modello della parte 1 sia cambiato.
    montaggioDoppio("1", "2");

    const esatta = screen.getAllByRole("radio", {
      name: messaggiIt.esercizi.redazione.parti.numerica.tolleranzaEsatta,
    });
    const margine = screen.getAllByRole("radio", {
      name: messaggiIt.esercizi.redazione.parti.numerica.tolleranzaMargine,
    });
    expect(esatta[0]).toBeChecked();

    await userEvent.click(margine[1]!);

    expect(margine[1]).toBeChecked();
    expect(esatta[0]).toBeChecked();
  });
});
