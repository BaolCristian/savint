import { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import { CampoTestoMatematico } from "../campo-testo-matematico";

const R = messaggiIt.esercizi.redazione.campoTesto;

/** Un campo controllato vero: `CampoTestoMatematico` non tiene il testo da
 * sé, e senza uno stato che retroagisce da `onChange` nessun pulsante
 * potrebbe cambiare il campo — è proprio il giro genitore→figlio che il
 * riposizionamento del cursore deve attraversare (stesso motivo del gemello
 * in `campo-jme.test.tsx`). */
function CampoControllato({
  valoreIniziale = "",
  variabili = [],
}: {
  valoreIniziale?: string;
  variabili?: string[];
}) {
  const [valore, setValore] = useState(valoreIniziale);
  return (
    <CampoTestoMatematico
      id="campo-test"
      etichetta="Testo"
      valore={valore}
      onChange={setValore}
      variabili={variabili}
    />
  );
}

function montaggio(props?: { valoreIniziale?: string; variabili?: string[] }) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <CampoControllato {...props} />
    </NextIntlClientProvider>,
  );
}

function campoDi(): HTMLTextAreaElement {
  return screen.getByLabelText("Testo") as HTMLTextAreaElement;
}

/** Piazza il cursore (o la selezione) come farebbe il docente prima di
 * premere un pulsante della barra. */
function selezionaNelCampo(campo: HTMLTextAreaElement, inizio: number, fine: number = inizio) {
  campo.focus();
  campo.setSelectionRange(inizio, fine);
}

function premi(etichetta: string) {
  return userEvent.click(screen.getByRole("button", { name: etichetta }));
}

describe("CampoTestoMatematico: la zona matematica avvolge ciò che è selezionato", () => {
  it("selezionare «x^2» e premere \\( \\) dà «\\(x^2\\)», col cursore dopo la chiusura", async () => {
    montaggio({ valoreIniziale: "x^2" });
    const campo = campoDi();
    selezionaNelCampo(campo, 0, 3);

    await premi(R.zonaMatematica);

    // Avvolge, non sostituisce: il testo selezionato deve sopravvivere.
    expect(campo.value).toBe("\\(x^2\\)");
    expect(campo.selectionStart).toBe("\\(x^2\\)".length);
  });

  it("senza selezione inserisce la coppia vuota col cursore in mezzo", async () => {
    montaggio();
    const campo = campoDi();
    selezionaNelCampo(campo, 0);

    await premi(R.zonaMatematica);

    expect(campo.value).toBe("\\(\\)");
    // In mezzo, cioè subito dopo `\(`: è lì che si scrive la formula.
    expect(campo.selectionStart).toBe(2);
  });

  it("inserisce dove sta il cursore, non in fondo al campo", async () => {
    montaggio({ valoreIniziale: "ab" });
    const campo = campoDi();
    selezionaNelCampo(campo, 1);

    await premi(R.zonaMatematica);

    expect(campo.value).toBe("a\\(\\)b");
    expect(campo.selectionStart).toBe(3);
  });

  it("il pulsante \\simplify{} avvolge a sua volta la selezione", async () => {
    montaggio({ valoreIniziale: "2x+{a}" });
    const campo = campoDi();
    selezionaNelCampo(campo, 0, 6);

    await premi(R.semplifica);

    expect(campo.value).toBe("\\simplify{2x+{a}}");
  });
});

describe("CampoTestoMatematico: i quattro inserimenti LaTeX", () => {
  // Il cursore va nel PRIMO argomento, non in fondo all'inserimento: è la
  // differenza fra poter continuare a scrivere e dover tornare indietro col
  // mouse. Gli scostamenti sono contati dall'inizio del testo inserito.
  const INSERIMENTI: Array<[string, string, number]> = [
    [R.frazione, "\\frac{}{}", 6],
    [R.radice, "\\sqrt{}", 6],
    [R.potenza, "^{}", 2],
    [R.indice, "_{}", 2],
  ];

  it.each(INSERIMENTI)("%s inserisce %j col cursore nel primo argomento", async (etichetta, atteso, caret) => {
    montaggio();
    const campo = campoDi();
    selezionaNelCampo(campo, 0);

    await premi(etichetta);

    expect(campo.value).toBe(atteso);
    expect(campo.selectionStart).toBe(caret);
  });
});

describe("CampoTestoMatematico: il menu delle variabili", () => {
  it("elenca i nomi dichiarati nel pannello, e inserisce \\var{nome}", async () => {
    montaggio({ variabili: ["a", "b"] });
    const campo = campoDi();
    const menu = screen.getByLabelText(R.inserisciVariabile);

    // I nomi, non gli oggetti variabile: se al menu arrivasse l'oggetto
    // intero si leggerebbe "[object Object]".
    expect(within(menu).getAllByRole("option").map((o) => o.textContent)).toEqual([
      R.inserisciVariabile,
      "a",
      "b",
    ]);

    await userEvent.selectOptions(menu, "a");

    expect(campo.value).toBe("\\var{a}");
    expect(campo.selectionStart).toBe("\\var{a}".length);
  });

  it("resta scelto il segnaposto dopo l'inserimento: la stessa variabile si può inserire due volte", async () => {
    montaggio({ variabili: ["a"] });
    const campo = campoDi();
    const menu = screen.getByLabelText(R.inserisciVariabile);

    await userEvent.selectOptions(menu, "a");
    selezionaNelCampo(campo, campo.value.length);
    await userEvent.selectOptions(menu, "a");

    expect(campo.value).toBe("\\var{a}\\var{a}");
  });

  it("senza variabili dichiarate il menu è spento: non c'è niente da scegliere", () => {
    montaggio({ variabili: [] });
    expect(screen.getByLabelText(R.inserisciVariabile)).toBeDisabled();
  });
});

/** Il testo davvero disegnato dall'eco: `.katex-html` è il ramo visivo di
 * KaTeX, quello che finisce sotto gli occhi del docente (il ramo gemello
 * `.katex-mathml` esiste solo per le tecnologie assistive). Asserire questo
 * testo, e non l'esistenza del nodo `.katex`, è l'unico modo di accorgersi
 * se all'eco arrivasse la stringa sbagliata: `Formula` non lancia mai —
 * quando KaTeX rifiuta il sorgente mostra un riquadro `<code>` col LaTeX
 * grezzo, e un test che cercasse solo un nodo resterebbe verde davanti a
 * quel riquadro. */
function testoResoDa(eco: Element): string | undefined {
  return eco.querySelector(".katex-html")?.textContent ?? undefined;
}

function ecoDi(container: HTMLElement): HTMLElement {
  const eco = container.querySelector<HTMLElement>("#campo-test-eco");
  if (!eco) throw new Error("l'eco non è nel documento");
  return eco;
}

describe("CampoTestoMatematico: l'eco di come il testo verrà reso", () => {
  it("rende la zona matematica come formula e lascia il resto come testo", async () => {
    const { container } = montaggio({ valoreIniziale: "Risolvi \\(x^2-\\var{a}^2\\) subito." });
    const eco = ecoDi(container);

    // `\var{a}` si vede come `a` in corsivo — il nome, non il valore: il
    // valore dipende dal seme, e quella è l'anteprima, che sta accanto.
    // Il segno è il meno matematico U+2212, quello che KaTeX disegna.
    expect(testoResoDa(eco)).toBe("x2−a2");
    // «in corsivo», l'altra metà del requisito: KaTeX disegna `\mathit{a}`
    // come `mord mathit` e una `a` nuda come `mord mathnormal`. Senza questa
    // riga, tradurre `\var{a}` in una `a` nuda lascerebbe il testo reso
    // identico — e il Task 6, la cui macro sarà `var: "\\mathit{#1}"`,
    // divergerebbe da qui senza che nulla lo dica.
    expect(eco.querySelector(".mathit")?.textContent).toBe("a");
    expect(eco.textContent).toContain("Risolvi ");
    expect(eco.textContent).toContain(" subito.");
    // I delimitatori sono struttura, non testo: se l'eco non dividesse le
    // zone, `\(` comparirebbe sotto gli occhi del docente.
    expect(eco.textContent).not.toContain("\\(");
  });

  it("non mente sui caratteri che in HTML significano qualcosa", () => {
    // Una disequazione è testo matematico legittimo (vedi `escapaTesto` in
    // verso-numbas.ts): `x < 0` deve restare `x < 0`, non sparire come un
    // tag sconosciuto.
    const { container } = montaggio({ valoreIniziale: "Vale x < 0 & y > 1?" });
    expect(ecoDi(container).textContent).toContain("Vale x < 0 & y > 1?");
  });

  it("mostra il sorgente di \\simplify{} invece di una formula storta, e dice perché", () => {
    // Che cosa esca da un `\simplify` dipende dai valori sorteggiati: è
    // l'anteprima a saperlo, non l'eco, che mostra *come si scrive*. Il
    // sorgente deve quindi arrivare intatto, graffe interne comprese.
    const { container } = montaggio({ valoreIniziale: "Risolvi \\(\\simplify{2x+{a}} = 0\\)." });
    const eco = ecoDi(container);
    expect(eco.textContent).toContain("\\simplify{2x+{a}} = 0");
    // Il riquadro grigio del sorgente, sotto la promessa «Come si vedrà:», si
    // legge come «hai sbagliato la sintassi». Non è vero, e l'eco deve dirlo
    // con le parole, non lasciarlo indovinare.
    expect(eco.textContent).toContain(R.notaSimplify);
  });

  it("non dice nulla di simplify quando nel testo non ce n'è", () => {
    // La nota qualifica l'etichetta solo dove serve: altrove sarebbe rumore
    // sotto ogni campo, e smetterebbe di essere letta proprio dove conta.
    const { container } = montaggio({ valoreIniziale: "Risolvi \\(x^2 = 0\\)." });
    expect(ecoDi(container).textContent).not.toContain(R.notaSimplify);
  });

  it("non c'è eco quando non c'è ancora niente da rendere", () => {
    const { container } = montaggio();
    expect(container.querySelector("#campo-test-eco")).toBeNull();
  });

  it("segue ciò che si scrive, e quel che compare nell'eco descrive il campo", async () => {
    // La descrizione si risolve a mano, non con `toHaveAccessibleDescription`:
    // il calcolo di `dom-accessibility-api` attraversa il MathML di KaTeX e
    // jsdom non sa calcolare lo stile di un nodo `<math>` (stessa nota in
    // `campo-jme.test.tsx`).
    const { container } = montaggio();
    const campo = campoDi();
    // Senza graffe: per `userEvent` `{` apre un descrittore di tasto, e il
    // `\var` scritto a mano è già sorvegliato dal primo caso di questo blocco.
    await userEvent.type(campo, "vale \\(2+b\\)");

    const eco = ecoDi(container);
    expect(testoResoDa(eco)).toBe("2+b");
    expect(campo.getAttribute("aria-describedby")?.split(" ")).toContain("campo-test-eco");
  });
});

describe("CampoTestoMatematico: il campo resta quello di sempre", () => {
  it("l'etichetta comanda il campo, che è una textarea e non un input", () => {
    montaggio();
    expect(campoDi().tagName).toBe("TEXTAREA");
  });

  it("la barra dice a quale campo appartiene: in pagina ce n'è una per campo", () => {
    // Testo e suggerimento montano due barre identiche nella stessa colonna:
    // chiamarle entrambe «Strumenti matematici» lascerebbe chi naviga a voce
    // senza modo di distinguerle.
    montaggio();
    expect(screen.getByRole("group")).toHaveAccessibleName("Strumenti matematici per Testo");
  });

  it("i pulsanti non alterano un \\simplify{} già scritto", async () => {
    montaggio({ valoreIniziale: "\\simplify{2x+{a}}" });
    const campo = campoDi();
    selezionaNelCampo(campo, campo.value.length);

    await premi(R.zonaMatematica);
    selezionaNelCampo(campo, campo.value.length);
    await premi(R.radice);

    // Le graffe interne di `\simplify` sono JME (una sostituzione di
    // variabile), non LaTeX: nessun pulsante le tocca, le scappa o le
    // riordina.
    expect(campo.value).toBe("\\simplify{2x+{a}}\\(\\)\\sqrt{}");
  });
});
