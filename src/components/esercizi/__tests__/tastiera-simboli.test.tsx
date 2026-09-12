import { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import { InputParte, type PartePubblica } from "@/components/esercizi/player/parti";
import { CampoJme } from "@/components/esercizi/editor/campo-jme";
import { CampoTestoMatematico } from "@/components/esercizi/editor/campo-testo-matematico";

/** `useTastieraSimboli` è un hook solo, condiviso da TRE superfici in
 * produzione: lo studente che risponde, il docente che scrive la risposta
 * attesa, il docente che scrive il testo dell'esercizio. Il ramo che
 * *avvolge* la selezione (`\( \)`, `\simplify{}`) è provato in
 * `campo-testo-matematico.test.tsx`; il ramo che la **sostituisce** — la
 * riga `valore.slice(0, inizio) + inserisci + valore.slice(fine)` — non lo
 * era da nessuna parte, benché sia il comportamento che ogni tasto usa.
 *
 * Un difetto lì (per esempio `slice(inizio)` al posto di `slice(fine)`, cioè
 * un inserimento che non consuma più ciò che era selezionato) passerebbe
 * l'intera suite e si vedrebbe per la prima volta sotto le dita di uno
 * studente durante una verifica. Questa tabella lo prende su tutte e tre le
 * superfici insieme, montandole per davvero: il gesto è lo stesso — si
 * seleziona un tratto e si preme un tasto — e si asserisce il valore che
 * resta nel campo, non l'esistenza di un nodo.
 *
 * Verificato per mutazione: `valore.slice(fine)` → `valore.slice(inizio)` in
 * `tastiera-simboli.tsx` fa cadere tutte e tre le righe. */

const T = messaggiIt.esercizi;
const CAMPO_TESTO = messaggiIt.esercizi.redazione.campoTesto;

const base = { path: "p0", promptHtml: "<p>Domanda</p>", marks: 1, type: "jme" } as const;

/** Il campo dello studente: `InputParte` non tiene il testo da sé. */
function RispostaStudente({ valoreIniziale }: { valoreIniziale: string }) {
  const [valore, setValore] = useState<string>(valoreIniziale);
  return (
    <InputParte
      parte={{ ...base } as PartePubblica}
      valore={valore}
      onChange={(v) => setValore(String(v))}
      disabilitato={false}
    />
  );
}

/** Il campo della risposta attesa, dove il docente usa la stessa tastiera. */
function RispostaAttesa({ valoreIniziale }: { valoreIniziale: string }) {
  const [valore, setValore] = useState(valoreIniziale);
  return <CampoJme id="risposta" etichetta="Risposta" valore={valore} onChange={setValore} tastierino />;
}

/** Il testo dell'esercizio: una `Textarea`, non un `Input` — è la superficie
 * per cui l'hook ha un parametro di tipo. */
function TestoEsercizio({ valoreIniziale }: { valoreIniziale: string }) {
  const [valore, setValore] = useState(valoreIniziale);
  return <CampoTestoMatematico id="testo" etichetta="Testo" valore={valore} onChange={setValore} variabili={[]} />;
}

/** Le tre superfici, una per riga: il componente da montare, il nome del
 * tasto da premere e ciò che deve restare nel campo. Il valore iniziale è
 * lo stesso per tutte e tre — `1+xyz+2`, con `xyz` da selezionare — perché
 * la differenza fra le righe dev'essere solo la superficie. */
const SUPERFICI: Array<[string, (props: { valoreIniziale: string }) => React.ReactElement, string, string]> = [
  ["lo studente che risponde", RispostaStudente, T.tastoPotenza, "1+^+2"],
  ["il docente che scrive la risposta attesa", RispostaAttesa, T.tastoPotenza, "1+^+2"],
  ["il docente che scrive il testo dell'esercizio", TestoEsercizio, CAMPO_TESTO.frazione, "1+\\frac{}{}+2"],
];

describe("useTastieraSimboli: l'inserimento sostituisce la selezione, su tutte e tre le superfici", () => {
  it.each(SUPERFICI)("%s", async (_descrizione, Superficie, nomeTasto, atteso) => {
    render(
      <NextIntlClientProvider locale="it" messages={messaggiIt}>
        <Superficie valoreIniziale="1+xyz+2" />
      </NextIntlClientProvider>,
    );

    const campo = screen.getByRole("textbox") as HTMLInputElement | HTMLTextAreaElement;
    expect(campo.value).toBe("1+xyz+2");
    // «xyz» selezionato: il gesto naturale di chi vuole rifare quel pezzo.
    campo.setSelectionRange(2, 5);

    await userEvent.click(screen.getByRole("button", { name: nomeTasto }));

    // Ciò che era selezionato è sparito, e al suo posto c'è l'inserimento:
    // esattamente ciò che succede digitando con del testo selezionato.
    expect(campo.value).toBe(atteso);
    expect(campo.value).not.toContain("xyz");
  });
});
