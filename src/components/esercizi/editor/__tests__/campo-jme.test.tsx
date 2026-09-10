import { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import { ecoDi, type EsitoEco } from "../eco-jme";
import { CampoJme } from "../campo-jme";

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
    // Il messaggio d'errore è tradotto, mai la chiave inglese del motore
    // (trappola 2): "Expected an expression" non deve mai comparire.
    "un errore di sintassi ha un messaggio senza parole inglesi",
    "2*",
    (esito) => {
      expect(esito.stato).toBe("errore");
      if (esito.stato === "errore") expect(esito.messaggio).not.toContain("Expected");
    },
  ],
];

describe("ecoDi", () => {
  it.each(CASI)("%s: ecoDi(%j)", (_descrizione, espressione, verifica) => {
    verifica(ecoDi(espressione));
  });
});

/** Un campo controllato vero: `CampoJme` non tiene il testo da sé, e senza
 * uno stato che retroagisce da `onChange` scrivere nel campo non
 * produrrebbe l'effetto di un campo controllato reale (stesso motivo dei
 * gemelli in `parte-numerica.test.tsx`). */
function CampoControllato({ valoreIniziale = "", tastierino }: { valoreIniziale?: string; tastierino?: boolean }) {
  const [valore, setValore] = useState(valoreIniziale);
  return <CampoJme id="campo-test" etichetta="Valore" valore={valore} onChange={setValore} tastierino={tastierino} />;
}

function montaggio(props?: { valoreIniziale?: string; tastierino?: boolean }) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <CampoControllato valoreIniziale={props?.valoreIniziale} tastierino={props?.tastierino} />
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

describe("CampoJme: l'eco e il tastierino", () => {
  it("mostra la formula resa quando l'espressione è valida", async () => {
    const { container } = montaggio();
    const campo = screen.getByLabelText("Valore");
    await userEvent.type(campo, "2*x");
    expect(container.querySelector(".katex")).not.toBeNull();
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
