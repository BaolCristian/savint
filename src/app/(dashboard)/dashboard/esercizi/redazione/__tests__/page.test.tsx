import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/redazione", () => ({
  elencoRedazione: vi.fn(),
}));
// Il pulsante "duplica" (ricomparso sulle righe modificabili, vedi sotto) è
// un client component che chiama `useRouter()`: senza questo mock la
// prova andrebbe in errore appena l'elenco include una riga modificabile,
// non solo nella prova che clicca il pulsante (stesso schema di
// `nuovo/__tests__/page.test.tsx`).
const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/esercizi/redazione", useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { elencoRedazione, type VoceRedazione } from "@/lib/esercizi/redazione";
import Page from "../page";

// Il ruolo e la proprietà di ogni voce (Task 3 della condivisione): di norma
// un esercizio della scuola su cui il docente è editor.
const ACCESSO = {
  ruolo: "EDITOR" as const, proprietarioId: null, proprietarioNome: null, accesso: "scuola" as const, commentiAperti: 0,
};

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(elencoRedazione).mockReset();
  push.mockReset();
});

async function rendi(parametri?: { importati?: string; saltati?: string }) {
  render(await Page(parametri ? { searchParams: Promise.resolve(parametri) } : {}));
}

// Task 8: l'elenco della redazione. Deve distinguere a vista modificabile
// da sola lettura, dire il perché per i secondi, e mostrare autore + data
// dell'ultima versione — perché qualunque docente può modificare qualunque
// esercizio, e quel rischio va reso visibile. Offre "duplica" SOLO sulle
// righe modificabili (vedi sotto): l'item I4 dell'onda di correzioni lo
// aveva tolto da entrambe le direzioni, una correzione eccessiva rispetto a
// quanto richiesto — restringerlo alle righe modificabili, non toglierlo.
describe("elenco della redazione", () => {
  it("chiama redirectUnlessTeacher", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([]);
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
  });

  // Con proprietà e ruoli la frase "qualunque docente può modificare
  // qualunque esercizio" non è più vera: sparisce.
  it("non dice più che qualunque docente può modificare qualunque esercizio", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([]);
    await rendi();
    expect(screen.queryByText("chiunquePuoModificare")).toBeNull();
  });

  // Le due direzioni della correzione, nello stesso test: I4 aveva tolto
  // "duplica" da ENTRAMBE — dalle righe di sola lettura (corretto, vedi il
  // test sotto: duplicare non cambia il verdetto di `daNumbas`) e da quelle
  // già modificabili (una correzione eccessiva: qui è il percorso più
  // battuto per partire da un esercizio che già funziona, non va perso).
  it("un esercizio modificabile mostra un link diretto all'editor, autore, data e il pulsante duplica", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([
      {
        id: "e1",
        titolo: "Equazione di primo grado",
        argomento: "equazioni",
        anno: 1,
        ultimaVersione: 3,
        modificabile: true,
        motivo: null,
        autoreNome: "Mario Rossi",
        aggiornatoIl: new Date("2026-01-15T10:30:00Z"), ...ACCESSO,
      },
    ]);
    await rendi();

    expect(screen.getByText("Equazione di primo grado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "apri" })).toHaveAttribute("href", "/dashboard/esercizi/redazione/e1");
    expect(screen.getByText(/Mario Rossi/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "duplica" })).toBeInTheDocument();
    // Il gap che questo task chiude: anche una riga già modificabile deve
    // portare il link all'anteprima, non solo un link diretto all'editor —
    // sono due cose diverse (vedere l'esercizio coi propri occhi contro
    // modificarlo).
    expect(screen.getByRole("link", { name: "anteprima" })).toHaveAttribute(
      "href", "/dashboard/esercizi/anteprima/e1",
    );
  });

  // Il motivo del dominio (`daNumbas`, SUGGERIMENTO_REPOSITORIO) chiude già
  // da sé con "il repository dei contenuti": questa pagina non lo ripete
  // più in un secondo paragrafo (era la stessa frase due volte).
  //
  // "Duplica" resta assente qui: `duplicaEsercizio` copia il contenuto
  // GREZZO dell'ultima versione (vedi redazione.ts) — per un esercizio non
  // rappresentabile il duplicato ha lo stesso identico contenuto, quindi
  // `daNumbas` lo rifiuta allo stesso identico modo, mai un duplicato
  // diventato modificabile. Offrirlo qui lascerebbe solo un'altra riga di
  // sola lettura.
  //
  // Item I5 (chiuso lato dominio): il motivo viene ora direttamente da
  // `elencoRedazione` (campo `motivo`), non più da una rilettura con
  // `caricaPerEditor` per ogni riga non modificabile — questa pagina non
  // chiama più quella funzione affatto.
  it("un esercizio non modificabile mostra solo il motivo del dominio, non un link all'editor né il pulsante duplica", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([
      {
        id: "e2",
        titolo: "Griglia complessa",
        argomento: "geometria",
        anno: 3,
        ultimaVersione: 2,
        modificabile: false,
        motivo:
          "Contiene un tipo di parte (gapfill) che l'editor non sa ricostruire. Può essere modificato solo intervenendo direttamente nel repository dei contenuti.",
        autoreNome: null,
        aggiornatoIl: new Date("2026-02-01T08:00:00Z"), ...ACCESSO,
      },
    ]);

    await rendi();

    expect(screen.getByText(/non sa ricostruire/)).toBeInTheDocument();
    expect(
      screen.queryAllByRole("link").find((a) => a.getAttribute("href") === "/dashboard/esercizi/redazione/e2"),
    ).toBeUndefined();
    expect(screen.queryByRole("button", { name: "duplica" })).toBeNull();
    // La frase "repository dei contenuti" compare una sola volta: prima
    // c'era anche in un secondo paragrafo statico (`soloRepository`), ora
    // rimosso.
    expect(screen.getAllByText(/repository dei contenuti/)).toHaveLength(1);
    // Il gap che questo task chiude: è precisamente su QUESTE righe — quelle
    // che l'editor rifiuta — che il link all'anteprima conta di più, perché
    // prima di questo task non c'era nessun altro modo per un docente di
    // vedere questo esercizio.
    expect(screen.getByRole("link", { name: "anteprima" })).toHaveAttribute(
      "href", "/dashboard/esercizi/anteprima/e2",
    );
  });

  it("un esercizio non modificabile senza un motivo dal dominio mostra il motivo generico", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([
      {
        id: "e3",
        titolo: "Esercizio senza versione",
        argomento: "geometria",
        anno: 3,
        ultimaVersione: 0,
        modificabile: false,
        motivo: null,
        autoreNome: null,
        aggiornatoIl: new Date("2026-02-01T08:00:00Z"), ...ACCESSO,
      },
    ]);

    await rendi();

    expect(screen.getByText("motivoGenerico")).toBeInTheDocument();
  });

  it("permette di restringere il catalogo per testo senza nascondere le azioni della riga", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([
      {
        id: "e1", titolo: "Equazioni", argomento: "algebra", anno: 1, ultimaVersione: 1,
        modificabile: true, motivo: null, autoreNome: "Mario", aggiornatoIl: new Date("2026-01-15T10:30:00Z"), ...ACCESSO,
      },
      {
        id: "e2", titolo: "Triangoli", argomento: "geometria", anno: 2, ultimaVersione: 1,
        modificabile: true, motivo: null, autoreNome: "Anna", aggiornatoIl: new Date("2026-01-15T10:30:00Z"), ...ACCESSO,
      },
    ]);

    await rendi();

    fireEvent.change(screen.getByRole("searchbox", { name: "catalog.search" }), { target: { value: "triangoli" } });
    expect(screen.getByText("Triangoli")).toBeInTheDocument();
    expect(screen.queryByText("Equazioni")).toBeNull();
    expect(screen.getByRole("link", { name: "apri" })).toHaveAttribute("href", "/dashboard/esercizi/redazione/e2");
  });

  // Il catalogo raggruppa per argomento: un riquadro per argomento, in ordine
  // alfabetico, col numero di esercizi; maiuscole e spazi non spezzano un gruppo.
  it("raggruppa gli esercizi per argomento", async () => {
    const voce = (id: string, titolo: string, argomento: string) => ({
      id, titolo, argomento, anno: 2, ultimaVersione: 1,
      modificabile: true, motivo: null, autoreNome: "Anna", aggiornatoIl: new Date("2026-01-15T10:30:00Z"), ...ACCESSO,
    });
    vi.mocked(elencoRedazione).mockResolvedValue([
      voce("e1", "Sconti", "percentuali"),
      voce("e2", "Area del cerchio", "geometria"),
      voce("e3", "Aumenti", "Percentuali "),
    ]);
    await rendi();

    const gruppi = screen.getAllByRole("region");
    expect(gruppi.map((g) => within(g).getByRole("heading").textContent)).toEqual(["geometria1", "percentuali2"]);
    expect(within(gruppi[1]).getByText("Sconti")).toBeInTheDocument();
    expect(within(gruppi[1]).getByText("Aumenti")).toBeInTheDocument();
    expect(within(gruppi[1]).getAllByText('catalog.classe:{"anno":2}')).toHaveLength(2);
  });

  // Nuovo compito, Task 7: dal catalogo si assegna un argomento intero
  // (intestazione del gruppo) o un esercizio (la sua riga). Solo ciò che
  // ha una versione salvata si può assegnare: una riga senza versione non
  // ha "Assegna", e un gruppo fatto solo di quelle non ha "Assegna questo
  // argomento".
  it("offre \"Assegna questo argomento\" sul gruppo e \"Assegna\" su ogni esercizio assegnabile", async () => {
    const voce = (id: string, titolo: string, argomento: string, ultimaVersione = 1) => ({
      id, titolo, argomento, anno: 2, ultimaVersione,
      modificabile: true, motivo: null, autoreNome: "Anna", aggiornatoIl: new Date("2026-01-15T10:30:00Z"), ...ACCESSO,
    });
    vi.mocked(elencoRedazione).mockResolvedValue([
      voce("e1", "Sconti", "percentuali"),
      voce("e2", "Bozza", "percentuali", 0),
      voce("e3", "Senza versione", "geometria", 0),
      voce("e4", "Due & tre", "equazioni di 1° grado"),
    ]);
    await rendi();

    const [equazioni, geometria, percentuali] = screen.getAllByRole("region");
    expect(within(percentuali!).getByRole("link", { name: "assegnaArgomento" })).toHaveAttribute(
      "href", "/dashboard/esercizi/compiti/nuovo?argomento=percentuali",
    );
    expect(within(percentuali!).getAllByRole("link", { name: "assegna" }).map((a) => a.getAttribute("href"))).toEqual([
      "/dashboard/esercizi/compiti/nuovo?esercizio=e1",
    ]);
    expect(within(geometria!).queryByRole("link", { name: "assegnaArgomento" })).toBeNull();
    expect(within(geometria!).queryByRole("link", { name: "assegna" })).toBeNull();
    // L'argomento va codificato: lo scrive a mano chi redige.
    expect(within(equazioni!).getByRole("link", { name: "assegnaArgomento" })).toHaveAttribute(
      "href", `/dashboard/esercizi/compiti/nuovo?argomento=${encodeURIComponent("equazioni di 1° grado")}`,
    );
  });

  // Il blocco argomento pesca per testo ESATTO: il link manda la grafia
  // grezza più frequente fra gli assegnabili del gruppo, non quella ripulita.
  it("\"Assegna questo argomento\" manda la grafia esatta più usata nel gruppo", async () => {
    const voce = (id: string, argomento: string, ultimaVersione = 1) => ({
      id, titolo: id, argomento, anno: 2, ultimaVersione,
      modificabile: true, motivo: null, autoreNome: "Anna", aggiornatoIl: new Date("2026-01-15T10:30:00Z"), ...ACCESSO,
    });
    vi.mocked(elencoRedazione).mockResolvedValue([
      voce("e1", "Percentuali"),
      voce("e2", "percentuali "),
      voce("e3", "percentuali "),
      // Non assegnabili: non contano.
      voce("e4", "Percentuali", 0),
      voce("e5", "Percentuali", 0),
    ]);
    await rendi();
    expect(screen.getByRole("link", { name: "assegnaArgomento" })).toHaveAttribute(
      "href", `/dashboard/esercizi/compiti/nuovo?argomento=${encodeURIComponent("percentuali ")}`,
    );
  });

  it("la barra della sezione ha la scheda Modelli", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([]);
    await rendi();
    expect(screen.getByRole("link", { name: "nav.models" })).toHaveAttribute("href", "/dashboard/esercizi/modelli");
  });

  it("senza esercizi mostra il messaggio vuoto", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([]);
    await rendi();
    expect(screen.getByText("nessunEsercizio")).toBeInTheDocument();
  });

  // Import da JSON: il pulsante accanto a "Nuovo esercizio", e l'avviso con
  // cui la pagina di import riporta qui il docente.
  it("offre il link alla pagina di import", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([]);
    await rendi();
    expect(screen.getByRole("link", { name: "importa" })).toHaveAttribute(
      "href", "/dashboard/esercizi/redazione/importa",
    );
  });

  it("dopo un import mostra l'avviso con i conteggi", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([]);
    await rendi({ importati: "3", saltati: "1" });
    expect(screen.getByRole("status")).toHaveTextContent('importati:{"importati":3,"saltati":1}');
  });

  it("senza parametri di import non mostra nessun avviso", async () => {
    vi.mocked(elencoRedazione).mockResolvedValue([]);
    await rendi();
    expect(screen.queryByRole("status")).toBeNull();
  });

  // Proprietà e ruoli (condivisione, Task 7): l'etichetta di ogni riga, le
  // azioni che il ruolo permette, il filtro "Di chi".
  describe("ruoli e condivisione", () => {
    const voce = (id: string, titolo: string, accesso: Partial<VoceRedazione>, argomento = "algebra"): VoceRedazione => ({
      id, titolo, argomento, anno: 2, ultimaVersione: 1, modificabile: true, motivo: null,
      autoreNome: "Anna", aggiornatoIl: new Date("2026-01-15T10:30:00Z"),
      ...ACCESSO, ...accesso,
    });

    it("una riga da visualizzatore non ha né Apri né Condividi, ma dice di chi è", async () => {
      vi.mocked(elencoRedazione).mockResolvedValue([
        voce("e1", "Sconti", { ruolo: "VISUALIZZATORE", proprietarioId: "u9", proprietarioNome: "Anna Neri" }),
      ]);
      await rendi();
      expect(screen.queryByRole("link", { name: "apri" })).toBeNull();
      expect(screen.queryByRole("button", { name: "condividi" })).toBeNull();
      expect(screen.getByRole("link", { name: "anteprima" })).toBeInTheDocument();
      expect(screen.getByText('catalog.roleViewer · catalog.ownedBy:{"nome":"Anna Neri"}')).toBeInTheDocument();
      // Niente "Condividi argomento": in questo gruppo non c'è niente di suo.
      expect(screen.queryByRole("button", { name: "condividiArgomento" })).toBeNull();
    });

    it("una riga propria ha Apri, Condividi e l'etichetta Tuo", async () => {
      vi.mocked(elencoRedazione).mockResolvedValue([
        voce("e1", "Sconti", { ruolo: "PROPRIETARIO", proprietarioId: "doc1", proprietarioNome: "Io", accesso: "privato" }),
        voce("e2", "Aumenti", { ruolo: "PROPRIETARIO", proprietarioId: "doc1", proprietarioNome: "Io", accesso: "scuola" }),
      ]);
      await rendi();
      expect(screen.getAllByRole("link", { name: "apri" })).toHaveLength(2);
      expect(screen.getAllByRole("button", { name: "condividi" })).toHaveLength(2);
      expect(screen.getByText("catalog.yoursPrivate")).toBeInTheDocument();
      expect(screen.getByText("catalog.yoursSchool")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "condividiArgomento" })).toBeInTheDocument();
    });

    // Commenti (Task 8): il contatore dei commenti aperti compare solo
    // quando ce n'è almeno uno, e porta all'anteprima dove si leggono.
    it("il contatore dei commenti aperti compare solo sopra lo zero", async () => {
      vi.mocked(elencoRedazione).mockResolvedValue([
        voce("e1", "Sconti", { ruolo: "PROPRIETARIO", proprietarioId: "doc1", proprietarioNome: "Io", accesso: "privato", commentiAperti: 2 }),
        voce("e2", "Aumenti", { ruolo: "PROPRIETARIO", proprietarioId: "doc1", proprietarioNome: "Io", accesso: "privato", commentiAperti: 0 }),
      ]);
      await rendi();
      const contatore = screen.getByRole("link", { name: 'contatore:{"n":2}' });
      expect(contatore).toHaveTextContent("2");
      expect(contatore).toHaveAttribute("href", "/dashboard/esercizi/anteprima/e1");
      expect(screen.queryByRole("link", { name: 'contatore:{"n":0}' })).toBeNull();
    });

    it("un editor ha Apri ma non Condividi; senza proprietario lo dice", async () => {
      vi.mocked(elencoRedazione).mockResolvedValue([
        voce("e1", "Sconti", { ruolo: "EDITOR", proprietarioId: null, proprietarioNome: null }),
      ]);
      await rendi();
      expect(screen.getByRole("link", { name: "apri" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "condividi" })).toBeNull();
      expect(screen.getByText("catalog.roleEditor · catalog.noOwner")).toBeInTheDocument();
    });

    it("il filtro Miei nasconde le righe con un ruolo diverso da proprietario", async () => {
      vi.mocked(elencoRedazione).mockResolvedValue([
        voce("e1", "Sconti", { ruolo: "PROPRIETARIO", proprietarioId: "doc1", proprietarioNome: "Io" }),
        voce("e2", "Aumenti", { ruolo: "COMMENTATORE", proprietarioId: "u9", proprietarioNome: "Anna Neri" }),
      ]);
      await rendi();
      const filtro = screen.getByRole("combobox", { name: "catalog.owner" });
      fireEvent.change(filtro, { target: { value: "miei" } });
      expect(screen.getByText("Sconti")).toBeInTheDocument();
      expect(screen.queryByText("Aumenti")).toBeNull();
      fireEvent.change(filtro, { target: { value: "condivisi" } });
      expect(screen.queryByText("Sconti")).toBeNull();
      expect(screen.getByText("Aumenti")).toBeInTheDocument();
      // "Di altri" è solo dell'amministratore.
      expect(within(filtro).queryByRole("option", { name: "catalog.others" })).toBeNull();
    });

    it("l'amministratore vede gli esercizi altrui come tali e li filtra con Di altri", async () => {
      vi.mocked(redirectUnlessTeacher).mockResolvedValue({ user: { id: "adm", role: "ADMIN" } } as never);
      vi.mocked(elencoRedazione).mockResolvedValue([
        voce("e1", "Sconti", { ruolo: "PROPRIETARIO", proprietarioId: "adm", proprietarioNome: "Admin" }),
        voce("e2", "Aumenti", { ruolo: "PROPRIETARIO", proprietarioId: "u9", proprietarioNome: "Anna Neri" }, "geometria"),
      ]);
      await rendi();
      expect(screen.getByText('catalog.ownedBy:{"nome":"Anna Neri"} · catalog.admin')).toBeInTheDocument();
      // Condividi su entrambe (l'amministratore condivide tutto), ma
      // "Condividi argomento" solo dove ha qualcosa di suo.
      expect(screen.getAllByRole("button", { name: "condividi" })).toHaveLength(2);
      expect(screen.getAllByRole("button", { name: "condividiArgomento" })).toHaveLength(1);
      fireEvent.change(screen.getByRole("combobox", { name: "catalog.owner" }), { target: { value: "altri" } });
      expect(screen.queryByText("Sconti")).toBeNull();
      expect(screen.getByText("Aumenti")).toBeInTheDocument();
    });
  });
});
