import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import type { VariabileEditor } from "@/lib/esercizi/editor/modello";
import { PannelloVariabili } from "../pannello-variabili";

function montaggio(props: { variabili: VariabileEditor[]; condizione?: string }) {
  const onChange = vi.fn();
  const onChangeCondizione = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <PannelloVariabili
        variabili={props.variabili}
        onChange={onChange}
        condizione={props.condizione ?? ""}
        onChangeCondizione={onChangeCondizione}
      />
    </NextIntlClientProvider>,
  );
  return { ...utils, onChange, onChangeCondizione };
}

const DUE_VARIABILI: VariabileEditor[] = [
  { nome: "a", definizione: "random(1..10)", descrizione: "un intero" },
  { nome: "b", definizione: "a+1", descrizione: "" },
];

describe("PannelloVariabili", () => {
  it("nessun assistente per le formule: una definizione non è una formula", () => {
    // `random(1..10)`, `a+1`, `random(-9..9 except 0)`: sono definizioni,
    // non matematica da disegnare, e un editor visuale di formule le
    // distruggerebbe. Lo stesso vale per la condizione. Senza questa riga
    // niente impedirebbe che il pulsante ricomparisse qui.
    montaggio({ variabili: DUE_VARIABILI, condizione: "a <> b" });
    expect(
      screen.queryAllByRole("button", { name: messaggiIt.esercizi.redazione.campoJme.scriviFormula }),
    ).toHaveLength(0);
  });

  it("mostra una riga per variabile, con nome, definizione e descrizione", () => {
    montaggio({ variabili: DUE_VARIABILI });
    expect(screen.getAllByLabelText(messaggiIt.esercizi.redazione.variabili.nome)).toHaveLength(2);
    expect(screen.getAllByLabelText(messaggiIt.esercizi.redazione.variabili.definizione)).toHaveLength(2);
    expect(screen.getAllByLabelText(messaggiIt.esercizi.redazione.variabili.descrizione)).toHaveLength(2);
    expect(screen.getByDisplayValue("a")).toBeInTheDocument();
    expect(screen.getByDisplayValue("random(1..10)")).toBeInTheDocument();
    expect(screen.getByDisplayValue("a+1")).toBeInTheDocument();
  });

  it("spiega che fuori da simplify si usa \\var{nome} e dentro si usa {nome}, con un esempio di entrambi", () => {
    const { container } = montaggio({ variabili: [] });
    expect(container.textContent).toContain("\\var{a}");
    expect(container.textContent).toContain("\\simplify{{a}x + {b}}");
  });

  it("dice che l'ordine delle variabili non conta", () => {
    montaggio({ variabili: [] });
    expect(screen.getByText(messaggiIt.esercizi.redazione.variabili.spiegazioneOrdine)).toBeInTheDocument();
  });

  it("mostra il campo condizione e chiama onChangeCondizione quando lo si modifica", async () => {
    const { onChangeCondizione } = montaggio({ variabili: [], condizione: "" });
    const campo = screen.getByLabelText(messaggiIt.esercizi.redazione.variabili.condizione);
    await userEvent.type(campo, "a");
    expect(onChangeCondizione).toHaveBeenCalledWith("a");
  });

  it("aggiunge una riga vuota quando si preme «aggiungi variabile»", async () => {
    const { onChange } = montaggio({ variabili: DUE_VARIABILI });
    await userEvent.click(screen.getByRole("button", { name: messaggiIt.esercizi.redazione.variabili.aggiungi }));
    expect(onChange).toHaveBeenCalledWith([...DUE_VARIABILI, { nome: "", definizione: "", descrizione: "" }]);
  });

  it("rimuove la riga giusta quando si preme «rimuovi variabile»", async () => {
    const { onChange } = montaggio({ variabili: DUE_VARIABILI });
    const bottoni = screen.getAllByRole("button", { name: messaggiIt.esercizi.redazione.variabili.rimuovi });
    await userEvent.click(bottoni[0]!);
    expect(onChange).toHaveBeenCalledWith([DUE_VARIABILI[1]]);
  });

  it("modificare il nome di una riga chiama onChange con solo quella riga aggiornata", async () => {
    const { onChange } = montaggio({ variabili: DUE_VARIABILI });
    const campiNome = screen.getAllByLabelText(messaggiIt.esercizi.redazione.variabili.nome);
    await userEvent.type(campiNome[1]!, "!");
    const ultimaChiamata = onChange.mock.calls.at(-1)![0] as VariabileEditor[];
    expect(ultimaChiamata[0]).toEqual(DUE_VARIABILI[0]);
    expect(ultimaChiamata[1]!.nome).toBe("b!");
  });

  it("mostra un errore accanto alla riga con un nome non valido, non sulle altre righe", () => {
    const variabili: VariabileEditor[] = [
      { nome: "1a", definizione: "1", descrizione: "" },
      { nome: "b", definizione: "2", descrizione: "" },
    ];
    montaggio({ variabili });
    expect(screen.getByText(messaggiIt.esercizi.redazione.variabili.erroreNome)).toBeInTheDocument();
    // Una sola voce d'errore: la seconda riga (nome valido) non ne mostra nessuna.
    expect(screen.getAllByText(messaggiIt.esercizi.redazione.variabili.erroreNome)).toHaveLength(1);
  });

  it("mostra un errore quando il nome c'è ma la definizione è vuota", () => {
    const variabili: VariabileEditor[] = [{ nome: "a", definizione: "", descrizione: "" }];
    montaggio({ variabili });
    expect(screen.getByText(messaggiIt.esercizi.redazione.variabili.erroreDefinizione)).toBeInTheDocument();
  });

  it("i due campi sbagliati della stessa riga si segnalano allo stesso modo: entrambi marcati come non validi", () => {
    // `aria-invalid` non è solo per le tecnologie assistive: è ciò che
    // accende il bordo rosso di `input.tsx`
    // (`aria-invalid:border-destructive`). Senza questo test, un campo può
    // perdere il bordo mentre il suo messaggio d'errore resta, e la riga
    // segnala i suoi due errori in due modi diversi senza che nulla lo dica.
    const variabili: VariabileEditor[] = [{ nome: "1a", definizione: "", descrizione: "" }];
    montaggio({ variabili });
    expect(screen.getByLabelText(messaggiIt.esercizi.redazione.variabili.nome)).toBeInvalid();
    expect(screen.getByLabelText(messaggiIt.esercizi.redazione.variabili.definizione)).toBeInvalid();
  });

  it("una riga valida non marca nessuno dei suoi campi come sbagliato", () => {
    montaggio({ variabili: [DUE_VARIABILI[0]!] });
    expect(screen.getByLabelText(messaggiIt.esercizi.redazione.variabili.nome)).toBeValid();
    expect(screen.getByLabelText(messaggiIt.esercizi.redazione.variabili.definizione)).toBeValid();
  });

  it("non mostra nessun errore su una riga appena aggiunta, ancora vuota", () => {
    const variabili: VariabileEditor[] = [{ nome: "", definizione: "", descrizione: "" }];
    montaggio({ variabili });
    expect(screen.queryByText(messaggiIt.esercizi.redazione.variabili.erroreNome)).toBeNull();
    expect(screen.queryByText(messaggiIt.esercizi.redazione.variabili.erroreDefinizione)).toBeNull();
  });
});
