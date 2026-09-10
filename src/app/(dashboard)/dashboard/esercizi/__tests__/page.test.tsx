import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/classi", () => ({ classiDelDocente: vi.fn() }));
vi.mock("@/lib/esercizi/compiti", () => ({ compitiDellaClasse: vi.fn() }));
vi.mock("@/lib/esercizi/redazione", () => ({ elencoRedazione: vi.fn() }));
// Il modulo di assegnazione ha i suoi test (assegna-form.test.tsx): qui
// interessa che la pagina lo MONTI nel posto giusto, non come si comporta.
vi.mock("../assegna-form", () => ({ AssegnaForm: () => <div data-testid="assegna-form" /> }));
// getTranslations restituisce la CHIAVE (con il namespace davanti quando non
// e' quello di base), cosi' le asserzioni parlano di chiavi e non di frasi.
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "it"),
  getTranslations: vi.fn(async (namespace: string) => (chiave: string, valori?: Record<string, unknown>) => {
    const piena = namespace === "esercizi" ? chiave : `${namespace.replace(/^esercizi\./, "")}.${chiave}`;
    return valori ? `${piena}:${JSON.stringify(valori)}` : piena;
  }),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { classiDelDocente } from "@/lib/esercizi/classi";
import { compitiDellaClasse } from "@/lib/esercizi/compiti";
import { elencoRedazione } from "@/lib/esercizi/redazione";
import Page from "../page";

const classe = { id: "c1", name: "2A", yearLevel: 2, studenti: 20, codice: null };

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(classiDelDocente).mockReset().mockResolvedValue([classe]);
  vi.mocked(compitiDellaClasse).mockReset().mockResolvedValue([]);
  vi.mocked(elencoRedazione).mockReset().mockResolvedValue([]);
});

async function rendi() {
  return render(await Page());
}

function posizioni(testo: string, chiavi: string[]) {
  return chiavi.map((k) => testo.indexOf(k));
}

// Task 4: la pagina d'ingresso smette di essere cinque riquadri pari.
// L'azione di assegnare viene prima, sola e più grande. Poi (onda della
// gerarchia del pannello) quello che si e' gia' assegnato, come elenco; in
// fondo, piu' piccoli, i tre posti dove si prepara il materiale.
// "Batterie" sparisce del tutto dalla navigazione del docente (resta
// raggiungibile solo per chi ne conosce già l'indirizzo — non è questa
// pagina a doverlo dire).
describe("hub della sezione esercizi del docente", () => {
  it("chiama redirectUnlessTeacher", async () => {
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
  });

  it("mostra il blocco per assegnare, con dentro il modulo vero, senza una frase-istruzione sopra", async () => {
    await rendi();
    const titolo = screen.getByText("assegnaTitolo");
    expect(titolo.closest("a")).toBeNull();
    // Il modulo c'e' davvero: senza questa asserzione la prova passerebbe
    // anche se la sezione fosse rimasta l'intestazione vuota del Task 4.
    expect(screen.getByTestId("assegna-form")).toBeInTheDocument();
    // "Scegli la classe, l'argomento, quanti esercizi ed entro quando"
    // non si stampa piu': lo dicono le etichette del modulo, nello stesso
    // ordine. Una riga di prosa sopra un modulo che dice la stessa cosa
    // era una riga in piu' da leggere prima di cominciare.
    expect(screen.queryByText("assegnaDescrizione")).toBeNull();
  });

  it("collega classi, raccolte (contenitori), compiti assegnati e i miei esercizi (redazione)", async () => {
    await rendi();
    expect(screen.getByRole("link", { name: "navClassi" })).toHaveAttribute(
      "href", "/dashboard/esercizi/classi",
    );
    expect(screen.getByRole("link", { name: "navContenitori" })).toHaveAttribute(
      "href", "/dashboard/esercizi/contenitori",
    );
    expect(screen.getByRole("link", { name: "navCompiti" })).toHaveAttribute(
      "href", "/dashboard/esercizi/compiti",
    );
    expect(screen.getByRole("link", { name: "navRedazione" })).toHaveAttribute(
      "href", "/dashboard/esercizi/redazione",
    );
  });

  it("non collega più batterie da questa pagina", async () => {
    await rendi();
    expect(screen.queryByRole("link", { name: /batterie/i })).toBeNull();
    expect(screen.queryByText("navBatterie")).toBeNull();
    expect(screen.queryByRole("link", { name: "navBatterie" })).toBeNull();
  });

  it("l'ordine della pagina: prima si assegna, poi si legge cosa si e' gia' assegnato, in fondo dove si prepara il materiale", async () => {
    const { container } = await rendi();
    const testo = container.textContent ?? "";
    const ordine = posizioni(testo, ["assegnaTitolo", "navCompiti", "navRedazione", "navClassi", "navContenitori"]);

    expect(ordine.every((p) => p >= 0)).toBe(true);
    expect(ordine).toEqual([...ordine].sort((a, b) => a - b));
  });
});

describe("i compiti gia' assegnati, sulla pagina invece che dietro un clic", () => {
  it("elenca i piu' recenti per classe — al massimo tre — con classe, scadenza e quanti esercizi, ciascuno collegato alle sue consegne", async () => {
    vi.mocked(compitiDellaClasse).mockResolvedValue([
      { id: "k4", batteria: "Assegnazione diretta: equazioni", dueAt: new Date("2026-09-20T00:00:00Z"), esercizi: 10 },
      { id: "k3", batteria: "Assegnazione diretta: polinomi", dueAt: null, esercizi: 4 },
      { id: "k2", batteria: "Ripasso", dueAt: null, esercizi: 6 },
      { id: "k1", batteria: "Il piu' vecchio", dueAt: null, esercizi: 2 },
    ]);
    await rendi();

    expect(compitiDellaClasse).toHaveBeenCalledWith("c1");
    const primo = screen.getByRole("link", { name: "Assegnazione diretta: equazioni — 2A" });
    expect(primo).toHaveAttribute("href", "/dashboard/esercizi/compiti/k4");
    expect(screen.getByRole("link", { name: "Ripasso — 2A" })).toHaveAttribute("href", "/dashboard/esercizi/compiti/k2");
    expect(screen.queryByText(/Il piu' vecchio/)).toBeNull();

    // Scadenza e conteggio: le stesse chiavi della pagina dei compiti.
    expect(screen.getByText(/compiti\.compitoScadenza:/)).toBeInTheDocument();
    expect(screen.getAllByText(/compiti\.nessunaScadenza/)).toHaveLength(2);
    expect(screen.getByText(/compiti\.eserciziCount:\{"n":10\}/)).toBeInTheDocument();
  });

  it("con classi ma senza compiti dice che non ce ne sono ancora", async () => {
    await rendi();
    expect(screen.getByText("compiti.nessunCompito")).toBeInTheDocument();
  });

  it("senza classi dichiarate non c'e' ne' l'elenco ne' il link ai compiti — restano i tre posti dove si prepara", async () => {
    vi.mocked(classiDelDocente).mockResolvedValue([]);
    await rendi();

    expect(compitiDellaClasse).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "navCompiti" })).toBeNull();
    expect(screen.queryByText("compiti.nessunCompito")).toBeNull();
    expect(screen.getByRole("link", { name: "navClassi" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "navRedazione" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "navContenitori" })).toBeInTheDocument();
  });
});
