import { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { MathfieldElement } from "mathlive";
import { evaluate } from "@savint/engine";
import messaggiIt from "@/messages/it.json";
import { ecoDi, type EsitoEco } from "../eco-jme";
import { CampoJme } from "../campo-jme";
import { preparaJsdomPerMathlive } from "./aiuto-mathlive";

preparaJsdomPerMathlive();

const CAMPO = messaggiIt.esercizi.redazione.campoJme;
const FINESTRA = messaggiIt.esercizi.redazione.finestraFormula;

// Sette casi, come tabella: ognuno una trappola misurata in pre-volo (vedi
// il commento in cima a `eco-jme.tsx`), non un'asserzione generica su
// "funziona". La verifica di ogni riga sa quale forma aspettarsi da
// `EsitoEco` — niente cast, il narrowing di TypeScript fa il lavoro.
const CASI: Array<[string, string, (esito: EsitoEco) => void]> = [
  ["il campo vuoto", "", (esito) => expect(esito.stato).toBe("vuoto")],
  ["un'espressione valida", "2*x", (esito) => expect(esito.stato).toBe("reso")],
  ["un prefisso a metà, sgrammaticato", "2*", (esito) => expect(esito.stato).toBe("errore")],
  [
    // Trappola 1: il tasto radice appena premuto, prima che l'argomento sia
    // scritto. Il motore o lancia (arità sbagliata) o produce
    // "\sqrt{ undefined }" a seconda della versione — in nessuno dei due
    // casi è un errore di sintassi del docente, quindi non deve MAI
    // apparire come "errore".
    "sqrt() — l'argomento non ancora scritto",
    "sqrt()",
    (esito) => expect(esito.stato).toBe("vuoto"),
  ],
  [
    // Il caso che motiva l'intera funzione: il motore legge "sin x" come
    // moltiplicazione fra la variabile "sin" e "x", non come seno di x. Se
    // un giorno il motore cambiasse comportamento, questo test lo direbbe.
    "«sin x», moltiplicazione implicita e non seno",
    "sin x",
    (esito) => {
      expect(esito.stato).toBe("reso");
      if (esito.stato === "reso") expect(esito.latex).toContain("\\times");
    },
  ],
  ["una chiamata del motore", "random(1..5)", (esito) => expect(esito.stato).toBe("reso")],
  [
    // Trappola 2: il messaggio è quello tradotto del motore, non la chiave
    // inglese né il `String(e)` con dentro il nome della classe d'errore. Si
    // asserisce il messaggio INTERO, non l'assenza della parola "Expected":
    // quell'assenza è vera anche per "Not enough arguments for the
    // operation *" (inglese puro) e per "JmeError: Argomenti insufficienti
    // ...", cioè per entrambe le regressioni che questa riga deve fermare.
    "un errore di sintassi ha il messaggio italiano del motore, per intero",
    "2*",
    (esito) => {
      expect(esito.stato).toBe("errore");
      if (esito.stato === "errore") expect(esito.messaggio).toBe("Argomenti insufficienti per l'operazione *");
    },
  ],
];

describe("ecoDi", () => {
  it.each(CASI)("%s: ecoDi(%j)", (_descrizione, espressione, verifica) => {
    verifica(ecoDi(espressione));
  });
});

interface PropsProva {
  valoreIniziale?: string;
  tastierino?: boolean;
  invalido?: boolean;
  assistenteFormula?: { nomiNoti: string[] };
}

/** Un campo controllato vero: `CampoJme` non tiene il testo da sé, e senza
 * uno stato che retroagisce da `onChange` scrivere nel campo non
 * produrrebbe l'effetto di un campo controllato reale (stesso motivo dei
 * gemelli in `parte-numerica.test.tsx`). */
function CampoControllato({ valoreIniziale = "", tastierino, invalido, assistenteFormula }: PropsProva) {
  const [valore, setValore] = useState(valoreIniziale);
  return (
    <CampoJme
      id="campo-test"
      etichetta="Valore"
      valore={valore}
      onChange={setValore}
      tastierino={tastierino}
      invalido={invalido}
      assistenteFormula={assistenteFormula}
    />
  );
}

function montaggio(props?: PropsProva) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <CampoControllato
        valoreIniziale={props?.valoreIniziale}
        tastierino={props?.tastierino}
        invalido={props?.invalido}
        assistenteFormula={props?.assistenteFormula}
      />
    </NextIntlClientProvider>,
  );
}

describe("CampoJme: l'eco d'errore non allarma mentre si scrive", () => {
  it("resta discreta (text-muted-foreground, non text-destructive) mentre il campo ha il fuoco", async () => {
    montaggio();
    const campo = screen.getByLabelText("Valore");
    // Ogni prefisso di un'espressione valida è quasi sempre a sua volta
    // invalido: "2*" è un errore genuino del motore, ma il campo ha ancora
    // il fuoco (non c'è stato un blur).
    await userEvent.type(campo, "2*");
    const messaggio = screen.getByText("Argomenti insufficienti per l'operazione *");
    expect(messaggio.className).toContain("text-muted-foreground");
    expect(messaggio.className).not.toContain("text-destructive");
  });

  it("diventa un avviso (text-destructive) solo dopo che il campo ha perso il fuoco", async () => {
    montaggio();
    const campo = screen.getByLabelText("Valore");
    await userEvent.type(campo, "2*");
    await userEvent.tab();
    const messaggio = screen.getByText("Argomenti insufficienti per l'operazione *");
    expect(messaggio.className).toContain("text-destructive");
    expect(messaggio.className).not.toContain("text-muted-foreground");
  });
});

/** Il testo davvero disegnato dall'eco: `.katex-html` è il ramo visivo di
 * KaTeX, quello che finisce sotto gli occhi del docente (il ramo gemello
 * `.katex-mathml` esiste solo per le tecnologie assistive). Asserire questo
 * testo, e non l'esistenza del nodo `.katex`, è l'unico modo di accorgersi
 * se un giorno all'eco arrivasse la stringa sbagliata: un nodo `.katex` c'è
 * comunque, anche quando mostra la cosa storta. */
function testoDellEco(container: HTMLElement): string | undefined {
  return container.querySelector(".katex-html")?.textContent ?? undefined;
}

describe("CampoJme: l'eco e il tastierino", () => {
  it("mostra la formula resa quando l'espressione è valida", async () => {
    const { container } = montaggio();
    const campo = screen.getByLabelText("Valore");
    await userEvent.type(campo, "2*x");
    // "2x": il motore rende il prodotto per giustapposizione, non con un
    // segno. È il valore visto, non «c'è un nodo KaTeX».
    expect(testoDellEco(container)).toBe("2x");
  });

  it("«sin x» si vede come moltiplicazione, non come seno: l'eco disegna «sin×x»", async () => {
    // Il caso che motiva l'intera funzione, sorvegliato dove il docente lo
    // guarda davvero: nel componente, non nella stringa LaTeX. Se all'eco
    // arrivasse il testo scritto invece di ciò che il motore ne ha capito,
    // qui si leggerebbe "sinx" — la bugia che questo task esiste per
    // smontare — e questo test cadrebbe.
    const { container } = montaggio();
    const campo = screen.getByLabelText("Valore");
    await userEvent.type(campo, "sin x");
    expect(testoDellEco(container)).toBe("sin×x");
  });

  it("il tastierino non compare per difetto: solo dove il chiamante lo chiede", () => {
    montaggio();
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("il tastierino compare quando richiesto, con le cinque voci dello studente", () => {
    montaggio({ tastierino: true });
    expect(screen.getByRole("group")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });
});

describe("CampoJme: il campo sbagliato si vede, e si sente", () => {
  it("il campo è segnato come sbagliato quando il chiamante lo dice, anche se l'eco tace", () => {
    // Il caso del pannello delle variabili: definizione vuota accanto a un
    // nome compilato. Per `ecoDi` è un campo vuoto — nessuna eco — ma il
    // campo deve comunque portare il bordo rosso che `input.tsx` accende su
    // `aria-invalid`.
    montaggio({ invalido: true });
    expect(screen.getByLabelText("Valore")).toBeInvalid();
  });

  it("un campo senza errori non è segnato come sbagliato", async () => {
    montaggio();
    const campo = screen.getByLabelText("Valore");
    await userEvent.type(campo, "2*x");
    await userEvent.tab();
    expect(campo).toBeValid();
  });

  it("l'eco d'errore segna il campo come sbagliato solo dopo il blur, come il suo colore", async () => {
    montaggio();
    const campo = screen.getByLabelText("Valore");
    await userEvent.type(campo, "2*");
    // Un prefisso a metà mentre si scrive non è ancora un errore da
    // segnalare: il bordo rosso e l'avviso rosso si accendono insieme, e
    // insieme aspettano che il docente abbia finito.
    expect(campo).toBeValid();
    await userEvent.tab();
    expect(campo).toBeInvalid();
  });

  it("l'eco d'errore descrive il campo: chi non la vede se la sente leggere", async () => {
    montaggio();
    const campo = screen.getByLabelText("Valore");
    await userEvent.type(campo, "2*");
    expect(campo).toHaveAccessibleDescription(/Argomenti insufficienti per l'operazione \*/);
  });

  it("anche l'eco resa descrive il campo, formula compresa", async () => {
    // La descrizione si risolve a mano, non con `toHaveAccessibleDescription`:
    // il calcolo di `dom-accessibility-api` attraversa il MathML di KaTeX e
    // jsdom non sa calcolare lo stile di un nodo `<math>` (lancia dentro
    // `getComputedStyle`). Risolvere gli `aria-describedby` e leggere il
    // testo è ciò che farebbe comunque una tecnologia assistiva.
    const { container } = montaggio();
    const campo = screen.getByLabelText("Valore");
    await userEvent.type(campo, "sin x");
    const descrizione = (campo.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .filter(Boolean)
      .map((idDescrizione) => container.querySelector(`#${idDescrizione}`)?.textContent ?? "")
      .join(" ");
    expect(descrizione).toContain(messaggiIt.esercizi.redazione.campoJme.interpretatoCome);
    expect(descrizione).toContain("sin×x");
  });
});

/** Il campo di MathLive dentro la finestra aperta ora. Come in
 * `finestra-formula.test.tsx`: il pezzo con dentro le 843 KB arriva a parte,
 * e prima che arrivi nel DOM non c'è nessun `math-field`. */
async function campoFormula(): Promise<MathfieldElement> {
  const finestra = await screen.findByRole("dialog");
  return await waitFor(() => {
    const campo = finestra.querySelector<MathfieldElement>("math-field");
    if (!campo) throw new Error("il campo delle formule non è nella finestra");
    return campo;
  });
}

/** Apre la finestra, ci disegna dentro `latex` e conferma. */
async function disegnaEConferma(latex: string) {
  await userEvent.click(screen.getByRole("button", { name: CAMPO.scriviFormula }));
  const campo = await campoFormula();
  campo.value = latex;
  await userEvent.click(screen.getByRole("button", { name: FINESTRA.inserisci }));
  return campo;
}

/** «Vale 2» chiesto al motore e non alla stringa: il campo deve contenere un
 * JME giusto, non una forma particolare (vedi `ascii-jme.test.ts`). */
function vale(espressione: string, atteso: string): boolean {
  return evaluate(`(${espressione}) = (${atteso})`) === true;
}

describe("CampoJme: l'assistente per scrivere la formula", () => {
  it("il pulsante non c'è dove non si scrive matematica", () => {
    // La definizione di una variabile (`random(-9..9 except 0)`) e il
    // margine di tolleranza non sono formule: un editor visuale le
    // distruggerebbe. Il pulsante segue la stessa regola del tastierino —
    // compare dove il chiamante lo chiede, e basta.
    montaggio();
    expect(screen.queryByRole("button", { name: CAMPO.scriviFormula })).toBeNull();
  });

  it("la formula disegnata entra nel campo convertita in JME", async () => {
    // `\sqrt[3]{8}` esce da MathLive come `root(3)(8)`, che JME non sa
    // valutare. Quel che deve finire nel campo è un JME che vale 2: si
    // asserisce il valore, non la forma.
    montaggio({ assistenteFormula: { nomiNoti: [] } });

    await disegnaEConferma("\\sqrt[3]{8}");

    const campo = screen.getByLabelText("Valore") as HTMLInputElement;
    expect(campo.value).not.toBe("");
    expect(vale(campo.value, "2")).toBe(true);
    // Confermata, la finestra si chiude: il docente torna al campo.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("la formula quadratica non entra nel campo: la finestra resta aperta e dice perché", async () => {
    // IL caso. `jme.compile` la accetta e ne tiene una radice sola: se
    // entrasse, il docente pubblicherebbe un esercizio con una soluzione
    // su due che passa la verifica a venti semi e sbaglia davanti alla
    // classe.
    montaggio({ assistenteFormula: { nomiNoti: ["a", "b", "c"] } });

    const campoFormule = await disegnaEConferma("\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}");

    expect((screen.getByLabelText("Valore") as HTMLInputElement).value).toBe("");
    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toContain("+-");
    // E il disegno non si perde: la finestra resta aperta con dentro la
    // formula, da correggere o da annullare.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(campoFormule.getValue("ascii-math")).toBe("(-b+-sqrt(b^2-4a c))/(2a)");
  });

  it("«sin x» è rifiutato nominando «sin», e la via d'uscita è scritta nell'avviso", async () => {
    // Il messaggio deve essere azionabile: la causa è quasi sempre la
    // stessa, e il docente deve leggere che si scrive `sin(x)`.
    montaggio({ assistenteFormula: { nomiNoti: ["x"] } });

    await disegnaEConferma("\\sin x");

    expect((screen.getByLabelText("Valore") as HTMLInputElement).value).toBe("");
    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toContain("sin(x)");
  });

  it("la formula entra dove sta il cursore, non in fondo al campo", async () => {
    // Il meccanismo del cursore è uno solo (`useTastieraSimboli`), lo
    // stesso del tastierino: questa riga è ciò che se ne accorgerebbe se
    // qualcuno ne scrivesse una seconda copia che appende e basta.
    montaggio({ valoreIniziale: "2*+1", assistenteFormula: { nomiNoti: [] } });
    const campo = screen.getByLabelText("Valore") as HTMLInputElement;
    campo.setSelectionRange(2, 2);

    await disegnaEConferma("\\sqrt[3]{8}");

    expect(campo.value.endsWith("+1")).toBe(true);
    expect(vale(campo.value, "5")).toBe(true);
  });
});
