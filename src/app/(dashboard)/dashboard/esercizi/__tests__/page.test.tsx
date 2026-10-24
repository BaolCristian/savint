import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/classi", () => ({ classiDelDocente: vi.fn() }));
vi.mock("@/lib/esercizi/compiti", () => ({ compitiDellaClasse: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/esercizi" }));
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
import Page from "../page";

const classe = { id: "c1", name: "2A", yearLevel: 2, studenti: 20, codice: null };

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(classiDelDocente).mockReset().mockResolvedValue([classe]);
  vi.mocked(compitiDellaClasse).mockReset().mockResolvedValue([]);
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

  // Nuovo compito, Task 7: la carta "Assegna esercizi" col suo modulo
  // (AssegnaForm) lascia il posto a un solo grande link verso la pagina
  // Nuovo compito, con la riga che ne spiega le tre zone. Nessun modulo
  // resta sulla Panoramica: c'e' un solo posto dove si da' un compito.
  it("al posto del modulo c'e' un grande link a Nuovo compito, con la riga che spiega le tre zone", async () => {
    const { container } = await rendi();
    const link = screen.getByRole("link", { name: /nuovoCompito\.titolo/ });
    expect(link).toHaveAttribute("href", "/dashboard/esercizi/compiti/nuovo");
    expect(screen.getByText("nuovoCompito.descrizione")).toBeInTheDocument();
    expect(container.querySelector("form")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText("assegnaTitolo")).toBeNull();
  });

  it("la barra della sezione ha la scheda Modelli", async () => {
    await rendi();
    expect(screen.getByRole("link", { name: "teacherExercisesUi.nav.models" })).toHaveAttribute(
      "href", "/dashboard/esercizi/modelli",
    );
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

  // In fondo le tappe per arrivare a un compito, nell'ordine in cui si
  // fanno: classi, esercizi, raccolte.
  it("l'ordine della pagina: prima si assegna, poi si legge cosa si e' gia' assegnato, in fondo le tappe per preparare il materiale", async () => {
    const { container } = await rendi();
    const testo = container.textContent ?? "";
    const ordine = posizioni(testo, ["nuovoCompito.titolo", "navCompiti", "navClassi", "navRedazione", "navContenitori"]);

    expect(ordine.every((p) => p >= 0)).toBe(true);
    expect(ordine).toEqual([...ordine].sort((a, b) => a - b));
  });
});

describe("i compiti gia' assegnati, sulla pagina invece che dietro un clic", () => {
  it("elenca i piu' recenti per classe — al massimo tre — con classe, scadenza e quanti esercizi, ciascuno collegato alle sue consegne", async () => {
    vi.mocked(compitiDellaClasse).mockResolvedValue([
      { id: "k4", tipo: "COMPITO", batteria: "equazioni (10)", dueAt: new Date("2026-09-20T00:00:00Z"), esercizi: 10 },
      { id: "k3", tipo: "COMPITO", batteria: "polinomi (4)", dueAt: null, esercizi: 4 },
      { id: "k2", tipo: "COMPITO", batteria: "Ripasso", dueAt: null, esercizi: 6 },
      { id: "k1", tipo: "COMPITO", batteria: "Il piu' vecchio", dueAt: null, esercizi: 2 },
    ]);
    await rendi();

    expect(compitiDellaClasse).toHaveBeenCalledWith("c1");
    const primo = screen.getByRole("link", { name: "equazioni (10) — 2A" });
    expect(primo).toHaveAttribute("href", "/dashboard/esercizi/compiti/k4");
    expect(screen.getByRole("link", { name: "Ripasso — 2A" })).toHaveAttribute("href", "/dashboard/esercizi/compiti/k2");
    expect(screen.queryByText(/Il piu' vecchio/)).toBeNull();

    // Scadenza e conteggio: le stesse chiavi della pagina dei compiti.
    expect(screen.getByText(/compiti\.compitoScadenza:/)).toBeInTheDocument();
    expect(screen.getAllByText(/compiti\.nessunaScadenza/)).toHaveLength(2);
    expect(screen.getByText(/compiti\.eserciziCount:\{"n":10\}/)).toBeInTheDocument();
  });

  it("una verifica fra i recenti ha l'etichetta «Verifica» e porta alla sua pagina", async () => {
    vi.mocked(compitiDellaClasse).mockResolvedValue([
      { id: "v1", tipo: "VERIFICA", batteria: "equazioni (5)", dueAt: null, esercizi: 5 },
      { id: "k1", tipo: "COMPITO", batteria: "Ripasso", dueAt: null, esercizi: 6 },
    ]);
    await rendi();
    expect(screen.getAllByText("compiti.etichettaVerifica")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "equazioni (5) — 2A" })).toHaveAttribute("href", "/dashboard/esercizi/verifiche/v1");
    expect(screen.getByRole("link", { name: "Ripasso — 2A" })).toHaveAttribute("href", "/dashboard/esercizi/compiti/k1");
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

describe("le tappe per arrivare a un compito", () => {
  it("senza classi la prima tappa dice «Inizia da qui»", async () => {
    vi.mocked(classiDelDocente).mockResolvedValue([]);
    await rendi();
    expect(screen.getByText("teacherExercisesUi.hub.startHere")).toBeInTheDocument();
  });

  it("con le classi gia' scelte la prima tappa dice quante sono, e non c'e' «Inizia da qui»", async () => {
    await rendi();
    expect(screen.queryByText("teacherExercisesUi.hub.startHere")).toBeNull();
    expect(screen.getByText(/teacherExercisesUi\.hub\.classesCount:\{"n":1\}/)).toBeInTheDocument();
  });

  it("la tappa Assegna porta al Nuovo compito", async () => {
    await rendi();
    expect(screen.getByRole("link", { name: "teacherExercisesUi.hub.stepAssignTitle" })).toHaveAttribute(
      "href", "/dashboard/esercizi/compiti/nuovo",
    );
  });

  it("una scadenza gia' passata e' in rosso, una futura no", async () => {
    vi.mocked(compitiDellaClasse).mockResolvedValue([
      { id: "k1", tipo: "COMPITO", batteria: "Vecchio", dueAt: new Date("2000-01-01T00:00:00Z"), esercizi: 1 },
      { id: "k2", tipo: "COMPITO", batteria: "Nuovo", dueAt: new Date("2999-01-01T00:00:00Z"), esercizi: 1 },
    ]);
    await rendi();
    const [passata, futura] = screen.getAllByText(/compiti\.compitoScadenza:/);
    expect(passata.className).toContain("text-destructive");
    expect(futura.className).not.toContain("text-destructive");
  });
});
