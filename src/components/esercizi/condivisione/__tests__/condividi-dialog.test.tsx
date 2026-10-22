import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import messaggiIt from "@/messages/it.json";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { CondividiDialog, type TestiCondivisione } from "../condividi-dialog";

// I testi veri (it.json): la finestra li riceve già tradotti dalla pagina,
// con i segnaposto `{nome}` / `{dettaglio}` / `{titolo}` ancora da riempire.
const T = messaggiIt.esercizi.condivisione as unknown as TestiCondivisione;

const DOCENTI = [
  { id: "u2", nome: "Mario Rossi", email: "rossi@scuola.it" },
  { id: "u3", nome: "Anna Bianchi", email: "bianchi@scuola.it" },
];

type Stato = {
  persone: { userId: string; nome: string; email: string; ruolo: string }[];
  scuola: string | null;
  indiretti: { nome: string; via: "raccolta" | "argomento"; dettaglio: string; ruolo: string }[];
  proprietarioNome: string | null;
};

const VUOTO: Stato = { persone: [], scuola: null, indiretti: [], proprietarioNome: "Io Docente" };

/** Un fetch finto: GET dello stato e dei docenti, PUT/POST rispondono ok. */
function finto(stato: Stato = VUOTO, risposte: { put?: number; post?: number } = {}) {
  const f = vi.fn(async (url: string, opzioni?: RequestInit) => {
    const metodo = opzioni?.method ?? "GET";
    if (url.includes("/api/esercizi/docenti")) return new Response(JSON.stringify({ docenti: DOCENTI }));
    if (url.includes("/condivisione/proprietario")) {
      return new Response(JSON.stringify({ ok: true }), { status: risposte.post ?? 200 });
    }
    if (metodo === "PUT") {
      const status = risposte.put ?? 200;
      return new Response(JSON.stringify(status === 200 ? { ok: true } : { error: "destinatario_non_valido" }), { status });
    }
    return new Response(JSON.stringify(stato));
  });
  global.fetch = f as never;
  return f;
}

function chiamate(f: ReturnType<typeof finto>, metodo: string) {
  return f.mock.calls.filter(([, o]) => ((o as RequestInit | undefined)?.method ?? "GET") === metodo);
}

async function apri(props: Partial<Parameters<typeof CondividiDialog>[0]> = {}) {
  render(
    <CondividiDialog
      risorsa={{ tipo: "esercizio", id: "e1" }}
      titolo="Equazioni di primo grado"
      testi={T}
      {...props}
    />,
  );
  const argomento = props.risorsa?.tipo === "argomento";
  await userEvent.click(screen.getByRole("button", { name: argomento ? T.condividiArgomento : T.condividi }));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  refresh.mockReset();
});

describe("CondividiDialog", () => {
  it("carica lo stato, aggiunge un collega come Editor, apre alla scuola e invia il PUT", async () => {
    const f = finto();
    const dialogo = await apri();

    expect(within(dialogo).getByText("Condividi «Equazioni di primo grado»")).toBeInTheDocument();
    // Lo stato e i docenti vengono letti all'apertura, con la risorsa in query.
    await waitFor(() => expect(f).toHaveBeenCalledWith(expect.stringContaining("/api/esercizi/condivisione?tipo=esercizio&id=e1")));
    expect(await within(dialogo).findByText("Io Docente")).toBeInTheDocument();

    await userEvent.type(within(dialogo).getByLabelText(T.aggiungiColleghi), "ross");
    expect(within(dialogo).queryByRole("button", { name: /^Anna Bianchi/ })).toBeNull();
    await userEvent.click(within(dialogo).getByRole("button", { name: /^Mario Rossi/ }));

    await userEvent.selectOptions(within(dialogo).getByLabelText("Ruolo di Mario Rossi"), "EDITOR");
    await userEvent.selectOptions(within(dialogo).getByLabelText(T.accessoGenerale), "scuola");
    await userEvent.selectOptions(within(dialogo).getByLabelText(T.ruoloScuola), "VISUALIZZATORE");
    await userEvent.click(within(dialogo).getByRole("button", { name: T.salva }));

    await waitFor(() => expect(chiamate(f, "PUT")).toHaveLength(1));
    const [url, opzioni] = chiamate(f, "PUT")[0]!;
    expect(String(url)).toContain("/api/esercizi/condivisione");
    expect(JSON.parse(String((opzioni as RequestInit).body))).toEqual({
      risorsa: { tipo: "esercizio", id: "e1" },
      persone: [{ userId: "u2", ruolo: "EDITOR" }],
      scuola: "VISUALIZZATORE",
    });
    // Salvato: la finestra si chiude e la pagina rilegge le etichette.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refresh).toHaveBeenCalled();
  });

  it("chi ha già accesso si può togliere, e chi c'è già non torna tra i suggerimenti", async () => {
    const f = finto({ ...VUOTO, persone: [{ userId: "u3", nome: "Anna Bianchi", email: "bianchi@scuola.it", ruolo: "COMMENTATORE" }], scuola: "EDITOR" });
    const dialogo = await apri();

    expect(await within(dialogo).findByLabelText("Ruolo di Anna Bianchi")).toHaveValue("COMMENTATORE");
    expect(within(dialogo).getByLabelText(T.accessoGenerale)).toHaveValue("scuola");
    await userEvent.type(within(dialogo).getByLabelText(T.aggiungiColleghi), "a");
    expect(within(dialogo).queryByRole("button", { name: /^Anna Bianchi/ })).toBeNull();

    await userEvent.click(within(dialogo).getByRole("button", { name: "Rimuovi Anna Bianchi" }));
    await userEvent.selectOptions(within(dialogo).getByLabelText(T.accessoGenerale), "solo");
    await userEvent.click(within(dialogo).getByRole("button", { name: T.salva }));

    await waitFor(() => expect(chiamate(f, "PUT")).toHaveLength(1));
    expect(JSON.parse(String((chiamate(f, "PUT")[0]![1] as RequestInit).body))).toMatchObject({ persone: [], scuola: null });
  });

  // Il proprietario deve capire perché togliere la condivisione diretta non
  // basta: gli accessi da raccolte e argomento restano.
  it("elenca gli accessi che arrivano da raccolte e argomento", async () => {
    finto({
      ...VUOTO,
      indiretti: [
        { nome: "Mario Rossi", via: "raccolta", dettaglio: "Equazioni", ruolo: "VISUALIZZATORE" },
        { nome: "Anna Bianchi", via: "argomento", dettaglio: "algebra", ruolo: "EDITOR" },
      ],
    });
    const dialogo = await apri();
    expect(await within(dialogo).findByText("Mario Rossi lo vede anche tramite la raccolta «Equazioni»")).toBeInTheDocument();
    expect(within(dialogo).getByText("Anna Bianchi lo vede anche tramite l'argomento «algebra»")).toBeInTheDocument();
  });

  it("per un argomento legge con ?tipo=argomento e non offre il cambio di proprietario", async () => {
    const f = finto();
    const dialogo = await apri({ risorsa: { tipo: "argomento", argomento: "algebra" }, titolo: "algebra", admin: true });
    await waitFor(() => expect(f).toHaveBeenCalledWith(expect.stringContaining("/api/esercizi/condivisione?tipo=argomento&argomento=algebra")));
    expect(within(dialogo).getByText(T.spiegazioneArgomento)).toBeInTheDocument();
    expect(within(dialogo).queryByLabelText(T.nuovoProprietario)).toBeNull();
  });

  it("un rifiuto del server resta nella finestra come messaggio", async () => {
    finto(VUOTO, { put: 422 });
    const dialogo = await apri();
    await within(dialogo).findByText("Io Docente");
    await userEvent.click(within(dialogo).getByRole("button", { name: T.salva }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(T.erroreDestinatario);
    expect(refresh).not.toHaveBeenCalled();
  });

  describe("amministratore", () => {
    it("un docente non vede il campo Proprietario", async () => {
      finto();
      const dialogo = await apri();
      await within(dialogo).findByText("Io Docente");
      expect(within(dialogo).queryByLabelText(T.nuovoProprietario)).toBeNull();
    });

    it("sceglie un nuovo proprietario: vede l'avviso e al salvataggio parte il POST", async () => {
      const f = finto();
      const dialogo = await apri({ admin: true });
      await within(dialogo).findByText("Io Docente");
      expect(within(dialogo).queryByText(T.notaTrasferimento)).toBeNull();

      await userEvent.selectOptions(within(dialogo).getByLabelText(T.nuovoProprietario), "u3");
      expect(within(dialogo).getByText(T.notaTrasferimento)).toBeInTheDocument();
      await userEvent.click(within(dialogo).getByRole("button", { name: T.salva }));

      await waitFor(() => expect(chiamate(f, "POST")).toHaveLength(1));
      const [url, opzioni] = chiamate(f, "POST")[0]!;
      expect(String(url)).toContain("/api/esercizi/condivisione/proprietario");
      expect(JSON.parse(String((opzioni as RequestInit).body))).toEqual({
        risorsa: { tipo: "esercizio", id: "e1" }, nuovoProprietarioId: "u3",
      });
      await waitFor(() => expect(refresh).toHaveBeenCalled());
    });
  });
});
