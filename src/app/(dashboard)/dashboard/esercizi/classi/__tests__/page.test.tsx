import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/classi", () => ({
  classiDisponibili: vi.fn(),
  classiDelDocente: vi.fn(),
  iscrittiDellaClasse: vi.fn(),
}));
vi.mock("@/lib/esercizi/compiti", () => ({ compitiDellaClasse: vi.fn() }));
// `page.tsx` prende `codice` da `classiDelDocente`, insieme al resto di
// "una classe come la vede il suo docente" (rilievo della revisione del
// Task 4: prima se lo rileggeva con una findMany, e la forma della tabella
// Classe era conosciuta in due posti). Il vecchio commento diceva (per
// `compitiDellaClasse`): `classiDelDocente` non lo espone nel suo contratto
// di dominio, che qui non si tocca (task 4).
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// Il traduttore restituisce chiave e valori: le asserzioni parlano di quale
// messaggio è stato scelto, non del testo italiano di quel messaggio.
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));
// Stesso schema del mock server-side qui sopra, per il modulo client
// "next-intl" (usato da CreaClasseForm e ClasseCodice, che traducono a
// runtime — stesso motivo di compito-form.tsx).
vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { classiDisponibili, classiDelDocente, iscrittiDellaClasse } from "@/lib/esercizi/classi";
import { compitiDellaClasse } from "@/lib/esercizi/compiti";
import Page from "../page";

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(classiDisponibili).mockReset();
  vi.mocked(classiDelDocente).mockReset();
  vi.mocked(compitiDellaClasse).mockReset().mockResolvedValue([]);
  vi.mocked(iscrittiDellaClasse).mockReset().mockResolvedValue({ ok: true, righe: [] });
});

async function rendi() {
  render(await Page());
}

describe("pagina delle classi del docente", () => {
  it("chiama redirectUnlessTeacher", async () => {
    vi.mocked(classiDisponibili).mockResolvedValue([]);
    vi.mocked(classiDelDocente).mockResolvedValue([]);
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
  });

  it("mostra una casella per ciascuna classe disponibile, spuntando quelle già insegnate", async () => {
    vi.mocked(classiDisponibili).mockResolvedValue([
      { id: "c1", name: "1A", yearLevel: 1 },
      { id: "c2", name: "2B", yearLevel: 2 },
    ]);
    vi.mocked(classiDelDocente).mockResolvedValue([
      { id: "c1", name: "1A", yearLevel: 1, studenti: 20, codice: null },
    ] as never);

    await rendi();

    const cb1 = screen.getByRole("checkbox", { name: /1A/ });
    const cb2 = screen.getByRole("checkbox", { name: /2B/ });
    expect(cb1).toBeChecked();
    expect(cb2).not.toBeChecked();
  });

  it("senza classi disponibili non mostra il modulo", async () => {
    vi.mocked(classiDisponibili).mockResolvedValue([]);
    vi.mocked(classiDelDocente).mockResolvedValue([]);
    await rendi();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText("nessunaClasse")).toBeInTheDocument();
  });

  it("salvare chiama dichiaraInsegnamento via l'API con le classi selezionate", async () => {
    vi.mocked(classiDisponibili).mockResolvedValue([
      { id: "c1", name: "1A", yearLevel: 1 },
      { id: "c2", name: "2B", yearLevel: 2 },
    ]);
    vi.mocked(classiDelDocente).mockResolvedValue([
      { id: "c1", name: "1A", yearLevel: 1, studenti: 20, codice: null },
    ] as never);
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;

    await rendi();
    fireEvent.click(screen.getByRole("checkbox", { name: /2B/ }));
    fireEvent.click(screen.getByRole("button", { name: "salva" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/esercizi/classi/insegnate",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const body = JSON.parse((vi.mocked(global.fetch).mock.calls[0]![1] as RequestInit).body as string);
    expect(new Set(body.classeIds)).toEqual(new Set(["c1", "c2"]));
    expect(await screen.findByText("salvato")).toBeInTheDocument();
  });

  it("un errore di salvataggio mostra il messaggio d'errore", async () => {
    vi.mocked(classiDisponibili).mockResolvedValue([{ id: "c1", name: "1A", yearLevel: 1 }]);
    vi.mocked(classiDelDocente).mockResolvedValue([]);
    global.fetch = vi.fn(async () => new Response(null, { status: 500 })) as typeof fetch;

    await rendi();
    fireEvent.click(screen.getByRole("button", { name: "salva" }));

    expect(await screen.findByText("erroreSalvataggio")).toBeInTheDocument();
  });

  // Fix round finale, item 7: la spec chiede che dichiarare una classe (senza
  // approvazione) sia detto in chiaro nell'interfaccia, non solo deciso nel
  // dominio — perché dà accesso alle consegne e ai punteggi degli studenti.
  it("dichiara in chiaro cosa significa dichiarare una classe", async () => {
    vi.mocked(classiDisponibili).mockResolvedValue([{ id: "c1", name: "1A", yearLevel: 1 }]);
    vi.mocked(classiDelDocente).mockResolvedValue([]);
    await rendi();
    expect(screen.getByText("significato")).toBeInTheDocument();
  });

  // Fix round finale, item 2 (seconda parte): togliere la spunta a una
  // classe che ha già dei compiti assegnati deve avvisare, nominandoli,
  // prima di applicare la modifica — non sparire in silenzio, come con due
  // schede aperte che salvano l'elenco stale.
  describe("togliere la spunta a una classe con compiti assegnati", () => {
    beforeEach(() => {
      vi.mocked(classiDisponibili).mockResolvedValue([{ id: "c1", name: "1A", yearLevel: 1 }]);
      vi.mocked(classiDelDocente).mockResolvedValue([
        { id: "c1", name: "1A", yearLevel: 1, studenti: 20, codice: null },
      ] as never);
    });

    it("chiede conferma nominando il compito, e NON toglie subito la spunta", async () => {
      vi.mocked(compitiDellaClasse).mockResolvedValue([
        { id: "comp1", batteria: "Verifica 1", dueAt: null, esercizi: 3 },
      ]);
      await rendi();

      const casella = screen.getByRole("checkbox", { name: /1A/ });
      expect(casella).toBeChecked();
      fireEvent.click(casella);

      // Prima del fix: nessun dialogo — la casella si scopriva subito.
      expect(await screen.findByRole("alertdialog")).toHaveTextContent("Verifica 1");
      expect(casella).toBeChecked();
    });

    it("annullare la conferma lascia la classe spuntata", async () => {
      vi.mocked(compitiDellaClasse).mockResolvedValue([
        { id: "comp1", batteria: "Verifica 1", dueAt: null, esercizi: 3 },
      ]);
      await rendi();

      fireEvent.click(screen.getByRole("checkbox", { name: /1A/ }));
      await screen.findByRole("alertdialog");
      fireEvent.click(screen.getByRole("button", { name: "annulla" }));

      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(screen.getByRole("checkbox", { name: /1A/ })).toBeChecked();
    });

    it("confermare toglie davvero la spunta", async () => {
      vi.mocked(compitiDellaClasse).mockResolvedValue([
        { id: "comp1", batteria: "Verifica 1", dueAt: null, esercizi: 3 },
      ]);
      await rendi();

      fireEvent.click(screen.getByRole("checkbox", { name: /1A/ }));
      await screen.findByRole("alertdialog");
      fireEvent.click(screen.getByRole("button", { name: "confermaRimozioneAzione" }));

      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(screen.getByRole("checkbox", { name: /1A/ })).not.toBeChecked();
    });

    it("una classe senza compiti si toglie subito, senza conferma", async () => {
      vi.mocked(compitiDellaClasse).mockResolvedValue([]);
      await rendi();

      fireEvent.click(screen.getByRole("checkbox", { name: /1A/ }));

      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(screen.getByRole("checkbox", { name: /1A/ })).not.toBeChecked();
    });
  });

  // Task 4: creare una classe dà un nome e un anno a `creaClasse` (rotta
  // POST già esistente, task 3), poi ricarica — la nuova classe compare fra
  // quelle insegnate (creaClasse dichiara da sé che il creatore la
  // insegna) grazie a `router.refresh()`, non a stato locale del form.
  describe("creare una classe", () => {
    it("manda nome e anno all'API e ricarica dopo il successo", async () => {
      vi.mocked(classiDisponibili).mockResolvedValue([]);
      vi.mocked(classiDelDocente).mockResolvedValue([]);
      global.fetch = vi.fn(async () =>
        new Response(JSON.stringify({ classe: { id: "c9", nome: "3B", codice: "AB3XQ7" } }), { status: 201 }),
      ) as typeof fetch;

      await rendi();
      fireEvent.change(screen.getByLabelText("creaNome"), { target: { value: "3B" } });
      fireEvent.change(screen.getByLabelText("creaAnno"), { target: { value: "3" } });
      fireEvent.click(screen.getByRole("button", { name: "creaSubmit" }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/esercizi/classi",
          expect.objectContaining({ method: "POST" }),
        );
      });
      const body = JSON.parse((vi.mocked(global.fetch).mock.calls[0]![1] as RequestInit).body as string);
      expect(body).toEqual({ nome: "3B", anno: 3 });
      expect(await screen.findByText("creaSuccesso")).toBeInTheDocument();
    });

    it("un nome già usato mostra l'errore dedicato, non quello generico", async () => {
      vi.mocked(classiDisponibili).mockResolvedValue([]);
      vi.mocked(classiDelDocente).mockResolvedValue([]);
      global.fetch = vi.fn(async () =>
        new Response(JSON.stringify({ error: "nome_gia_usato" }), { status: 409 }),
      ) as typeof fetch;

      await rendi();
      fireEvent.change(screen.getByLabelText("creaNome"), { target: { value: "3B" } });
      fireEvent.click(screen.getByRole("button", { name: "creaSubmit" }));

      expect(await screen.findByText("creaErroreNomeUsato")).toBeInTheDocument();
      expect(screen.queryByText("creaErroreGenerico")).toBeNull();
    });

    it("un errore diverso mostra il messaggio generico", async () => {
      vi.mocked(classiDisponibili).mockResolvedValue([]);
      vi.mocked(classiDelDocente).mockResolvedValue([]);
      global.fetch = vi.fn(async () => new Response(null, { status: 500 })) as typeof fetch;

      await rendi();
      fireEvent.change(screen.getByLabelText("creaNome"), { target: { value: "3B" } });
      fireEvent.click(screen.getByRole("button", { name: "creaSubmit" }));

      expect(await screen.findByText("creaErroreGenerico")).toBeInTheDocument();
    });
  });

  // Task 4: il codice va mostrato grande e leggibile (si detta ad alta
  // voce), e la sua rigenerazione deve chiedere una conferma che nomini
  // ESPLICITAMENTE le due cose che contano — il vecchio codice smette di
  // funzionare, gli iscritti restano — perché è la paura che frena chi
  // rigenera (design doc). Le prove qui verificano che la CHIAVE giusta sia
  // scelta con i valori giusti, non il testo italiano (stesso principio del
  // resto del file): la prosa esatta è verificata a mano, vedi il report.
  describe("codice della classe e sua rigenerazione", () => {
    beforeEach(() => {
      vi.mocked(classiDisponibili).mockResolvedValue([{ id: "c1", name: "1A", yearLevel: 1 }]);
      vi.mocked(classiDelDocente).mockResolvedValue([
        { id: "c1", name: "1A", yearLevel: 1, studenti: 2, codice: "AB3XQ7" },
      ] as never);
    });

    it("mostra il codice, grande e leggibile", async () => {
      await rendi();
      const codice = await screen.findByText("AB3 XQ7");
      expect(codice.className).toMatch(/text-4xl|text-5xl/);
    });

    it("una classe senza codice (solo da gruppo Google) non mostra rigenerazione", async () => {
      // Una classe nata da un gruppo Google non ha mai avuto un codice:
      // niente da rigenerare, quindi niente bottone.
      vi.mocked(classiDelDocente).mockResolvedValue([
        { id: "c1", name: "1A", yearLevel: 1, studenti: 2, codice: null },
      ]);
      await rendi();
      expect(screen.queryByRole("button", { name: "rigenera" })).toBeNull();
    });

    it("rigenerare chiede conferma nominando la classe, PRIMA di sostituire il codice", async () => {
      global.fetch = vi.fn(async () => new Response(JSON.stringify({ codice: "ZZZZZZ" }), { status: 200 })) as typeof fetch;
      await rendi();

      await screen.findByText("AB3 XQ7");
      fireEvent.click(screen.getByRole("button", { name: "rigenera" }));

      const dialogo = await screen.findByRole("alertdialog");
      expect(dialogo).toHaveTextContent(`rigeneraTitolo:${JSON.stringify({ classe: "1A" })}`);
      expect(dialogo).toHaveTextContent("rigeneraDescrizione");
      // Non ancora sostituito: la conferma non è stata data.
      expect(global.fetch).not.toHaveBeenCalled();
      expect(screen.getByText("AB3 XQ7")).toBeInTheDocument();
    });

    it("confermare rigenera davvero sostituisce il codice mostrato", async () => {
      global.fetch = vi.fn(async () => new Response(JSON.stringify({ codice: "ZZZZZZ" }), { status: 200 })) as typeof fetch;
      await rendi();

      fireEvent.click(screen.getByRole("button", { name: "rigenera" }));
      await screen.findByRole("alertdialog");
      fireEvent.click(screen.getByRole("button", { name: "rigeneraAzione" }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/esercizi/classi/c1/codice",
          expect.objectContaining({ method: "POST" }),
        );
      });
      expect(await screen.findByText("ZZZ ZZZ")).toBeInTheDocument();
      expect(screen.queryByText("AB3 XQ7")).toBeNull();
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it("annullare la conferma lascia il vecchio codice, senza chiamare l'API", async () => {
      global.fetch = vi.fn() as typeof fetch;
      await rendi();

      fireEvent.click(screen.getByRole("button", { name: "rigenera" }));
      await screen.findByRole("alertdialog");
      fireEvent.click(screen.getByRole("button", { name: "annulla" }));

      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(screen.getByText("AB3 XQ7")).toBeInTheDocument();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("un errore di rigenerazione mostra un messaggio, senza perdere il vecchio codice", async () => {
      global.fetch = vi.fn(async () => new Response(null, { status: 500 })) as typeof fetch;
      await rendi();

      fireEvent.click(screen.getByRole("button", { name: "rigenera" }));
      await screen.findByRole("alertdialog");
      fireEvent.click(screen.getByRole("button", { name: "rigeneraAzione" }));

      expect(await screen.findByText("rigeneraErrore")).toBeInTheDocument();
      expect(screen.getByText("AB3 XQ7")).toBeInTheDocument();
    });
  });

  // Task 4: "Show where each enrolled student came from — group or code":
  // è ciò che spiega al docente perché un ragazzo c'è o non c'è (design
  // doc). `iscrittiDellaClasse` (dominio, già rivisto) è la fonte.
  describe("elenco degli iscritti, con la provenienza", () => {
    beforeEach(() => {
      vi.mocked(classiDisponibili).mockResolvedValue([{ id: "c1", name: "1A", yearLevel: 1 }]);
      vi.mocked(classiDelDocente).mockResolvedValue([
        { id: "c1", name: "1A", yearLevel: 1, studenti: 2, codice: "AB3XQ7" },
      ] as never);
    });

    it("mostra ciascuno studente con la sua provenienza, gruppo o codice", async () => {
      vi.mocked(iscrittiDellaClasse).mockResolvedValue({
        ok: true,
        righe: [
          { studentId: "s1", nome: "Mario Rossi", origine: "GRUPPO", dal: new Date("2026-09-01") },
          { studentId: "s2", nome: "Anna Bianchi", origine: "CODICE", dal: new Date("2026-09-02") },
        ],
      });
      await rendi();

      expect(await screen.findByText("Mario Rossi")).toBeInTheDocument();
      expect(screen.getByText("Anna Bianchi")).toBeInTheDocument();
      expect(screen.getByText("origineGruppo")).toBeInTheDocument();
      expect(screen.getByText("origineCodice")).toBeInTheDocument();
    });

    it("uno studente senza nome mostra un'etichetta di riserva, non un vuoto", async () => {
      vi.mocked(iscrittiDellaClasse).mockResolvedValue({
        ok: true,
        righe: [{ studentId: "s1", nome: null, origine: "GRUPPO", dal: new Date("2026-09-01") }],
      });
      await rendi();
      expect(await screen.findByText("iscrittoSenzaNome")).toBeInTheDocument();
    });

    it("senza iscritti mostra il messaggio di elenco vuoto", async () => {
      vi.mocked(iscrittiDellaClasse).mockResolvedValue({ ok: true, righe: [] });
      await rendi();
      expect(await screen.findByText("iscrittiVuoto")).toBeInTheDocument();
    });
  });
});
