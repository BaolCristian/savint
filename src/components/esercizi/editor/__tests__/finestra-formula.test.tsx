import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { MathfieldElement } from "mathlive";
import messaggiIt from "@/messages/it.json";
import { preparaJsdomPerMathlive } from "./aiuto-mathlive";
import { FinestraFormula, type FinestraFormulaProps } from "../finestra-formula";

const F = messaggiIt.esercizi.redazione.finestraFormula;

/** La sonda del caricamento pigro. La fabbrica di `vi.mock` gira quando —
 * e solo quando — qualcuno importa davvero `mathlive`: è l'unico modo
 * onesto di distinguere «il modulo non è stato caricato» da «il modulo è
 * stato caricato e non si vede». Un import statico in cima a un file che
 * la pagina importa la farebbe scattare mentre questo file di prova si
 * carica, cioè prima di ogni test. */
const sonda = vi.hoisted(() => ({ mathliveCaricato: false }));

vi.mock("mathlive", async (importaLOriginale) => {
  sonda.mathliveCaricato = true;
  return await importaLOriginale<typeof import("mathlive")>();
});

/** Il prefisso di percorso di questa installazione (`BASE_PATH` nel `.env`:
 * vuoto sull'hub, `/demo` sull'istanza di prova). Qui vale `/demo` proprio
 * perché con il prefisso vuoto comporre il percorso o scriverlo a mano
 * darebbe la stessa stringa, e la prova sui font non sorveglierebbe
 * niente. */
vi.mock("@/lib/base-path", () => ({
  BASE_PATH: "/demo",
  withBasePath: (percorso: string) => `/demo${percorso}`,
}));

preparaJsdomPerMathlive();

/** Lo stato della sonda al caricamento di questo file, prima che un test
 * possa aprire la finestra: dice se `mathlive` viaggia già con i moduli
 * che la pagina della redazione importa. */
const CARICATO_ALL_IMPORT = sonda.mathliveCaricato;

function montaggio(props: Partial<FinestraFormulaProps> = {}) {
  const onConferma = vi.fn();
  const onChiudi = vi.fn();
  const resa = render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <FinestraFormula aperta onChiudi={onChiudi} onConferma={onConferma} {...props} />
    </NextIntlClientProvider>,
  );
  return { onConferma, onChiudi, ...resa };
}

/** Il campo di MathLive, una volta arrivato il pezzo caricato a parte. */
async function campoFormula(): Promise<MathfieldElement> {
  const finestra = await screen.findByRole("dialog");
  return await waitFor(() => {
    // Dentro la finestra aperta adesso, non in tutto il documento: la
    // finestra vive in un portale fuori dal contenitore della resa, e una
    // ricerca larga potrebbe trovare il campo di un'altra resa.
    const campo = finestra.querySelector<MathfieldElement>("math-field");
    if (!campo) throw new Error("il campo delle formule non è nella finestra");
    return campo;
  });
}

function premiInserisci() {
  return userEvent.click(screen.getByRole("button", { name: F.inserisci }));
}

describe("FinestraFormula: le 843 KB arrivano solo quando servono", () => {
  it("la finestra chiusa non carica mathlive", () => {
    // Un import statico di `mathlive` in cima a `finestra-formula.tsx` — o
    // in cima al campo che la monta — lo farebbe entrare nel pacchetto
    // della pagina: 843 KB scaricati da chi apre la redazione e non tocca
    // mai una formula.
    expect(CARICATO_ALL_IMPORT).toBe(false);

    montaggio({ aperta: false });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(sonda.mathliveCaricato).toBe(false);
  });

  it("aprendola, mathlive arriva davvero", async () => {
    // Il controllo della prova qui sopra: senza questa, «non è caricato»
    // resterebbe vero anche se la finestra non caricasse mai niente.
    montaggio();

    const campo = await campoFormula();

    expect(sonda.mathliveCaricato).toBe(true);
    // E il campo si presenta: chi naviga a voce deve sentire che cos'è
    // quella casella, non il nome che MathLive si dà da solo.
    expect(campo).toHaveAccessibleName(F.campo);
  });
});

describe("FinestraFormula: il giro di una formula", () => {
  it("una formula con \\var{a} entra ed esce identica, e ne esce anche l'ASCIIMath", async () => {
    // `\var{a}` è una sostituzione del motore, non un comando LaTeX: se il
    // giro attraverso MathLive lo espandesse, il docente si ritroverebbe
    // nel testo `\mathit{a}` — una lettera in corsivo al posto del valore
    // che il motore sorteggia. L'uguaglianza è esatta, byte per byte.
    const { onConferma } = montaggio({ iniziale: "x^2-\\var{a}^2" });
    await campoFormula();

    await premiInserisci();

    // L'ASCIIMath non serve a questo campo: lo consuma il campo delle
    // risposte, che da lì converte verso JME. Chiederlo dopo vorrebbe dire
    // cambiare la firma a lavoro fatto.
    expect(onConferma).toHaveBeenCalledWith({ latex: "x^2-\\var{a}^2", asciiMath: "x^2-a^2" });
  });

  it("\\var{a} si disegna in corsivo, come nell'eco del campo di testo", async () => {
    // `latex-expanded` è ciò che MathLive disegna dopo aver espanso le
    // macro. Senza la macro registrata sono due cose insieme (misurate):
    // qui resterebbe `x^2-\var{a}^2`, e il campo mostrerebbe un riquadro
    // d'errore al posto della `a`. La traduzione è la stessa che l'eco
    // insegna a KaTeX (`MACRO_ECO` in `campo-testo-matematico.tsx`): le due
    // superfici devono disegnare `\var{a}` allo stesso modo.
    montaggio({ iniziale: "x^2-\\var{a}^2" });

    const campo = await campoFormula();

    expect(campo.getValue("latex-expanded")).toBe("x^2-\\mathit{a}^2");
  });

  it("quel che si scrive nella finestra è quel che viene confermato", async () => {
    const { onConferma } = montaggio();
    const campo = await campoFormula();

    campo.value = "\\frac{1}{2}";
    await premiInserisci();

    expect(onConferma).toHaveBeenCalledWith({ latex: "\\frac{1}{2}", asciiMath: "(1)/(2)" });
  });

  it("annullare chiude senza confermare niente", async () => {
    const { onConferma, onChiudi } = montaggio({ iniziale: "x^2" });
    await campoFormula();

    await userEvent.click(screen.getByRole("button", { name: F.annulla }));

    expect(onChiudi).toHaveBeenCalled();
    expect(onConferma).not.toHaveBeenCalled();
  });
});

describe("FinestraFormula: i font", () => {
  it("la cartella dei font porta il prefisso di percorso dell'installazione", async () => {
    // Il modo di fallire che nessuna prova vede fino in fondo: sotto un
    // prefisso, una cartella scritta a mano (`/fonts/mathlive`) risponde
    // 404 e le formule appaiono senza font. Qui si sorveglia la
    // composizione — che è la parte che un implementatore può sbagliare —
    // ma NON che i file esistano né che il browser li prenda: quello lo
    // dice solo la prova a mano descritta in
    // `finestra-formula-contenuto.tsx`.
    montaggio();
    await campoFormula();

    const { MathfieldElement } = await import("mathlive");
    expect(MathfieldElement.fontsDirectory).toBe("/demo/fonts/mathlive");
  });
});
