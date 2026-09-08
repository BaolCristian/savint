import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth/config", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", role: "STUDENT" } })) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/db/client", () => ({
  prisma: { esercizio: { findMany: vi.fn() }, compito: { findMany: vi.fn() } },
}));
vi.mock("@/lib/esercizi/compiti", () => ({ compitiDelloStudente: vi.fn() }));
// Il traduttore restituisce chiave e valori: così le asserzioni parlano di
// quale messaggio è stato scelto, non del testo italiano di quel messaggio.
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));
// Stesso schema, per il modulo client "next-intl" (usato dal form
// d'iscrizione con codice, che traduce l'esito solo noto a runtime — stesso
// motivo di compito-form.tsx).
vi.mock("next-intl", () => ({
  useTranslations: vi.fn(() => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

import { prisma } from "@/lib/db/client";
import { compitiDelloStudente } from "@/lib/esercizi/compiti";
import StudentHomePage from "../page";

function esercizioCon(tentativi: unknown[]) {
  return [{
    id: "01-prova", title: "Prova", yearLevel: 1, topic: "algebra", difficulty: 2,
    versions: [{ id: "v1", version: 1, tentativi }],
  }];
}

beforeEach(() => {
  vi.mocked(prisma.esercizio.findMany).mockReset();
  vi.mocked(prisma.compito.findMany).mockReset().mockResolvedValue([]);
  vi.mocked(compitiDelloStudente).mockReset().mockResolvedValue([]);
});

async function rendi() {
  render(await StudentHomePage());
}

describe("elenco degli esercizi dello studente", () => {
  // Onda finale, punto 6. L'elenco prendeva il tentativo più recente senza
  // guardarne lo stato: un tentativo CHIUSO veniva annunciato come "Tentativo
  // in corso", cosa che il dominio non prevede — `avviaORiprendi` riprende
  // solo quelli in corso, quindi toccando quella riga lo studente apre un
  // esercizio nuovo, non quello che l'etichetta gli prometteva.
  it("un tentativo completato non viene detto in corso", async () => {
    vi.mocked(prisma.esercizio.findMany).mockResolvedValue(
      esercizioCon([{ status: "COMPLETED", score: 2, maxScore: 2 }]) as never,
    );
    await rendi();
    expect(screen.getByText(/^ultimoTentativo:/)).toBeInTheDocument();
    expect(screen.queryByText(/^tentativoInCorso/)).toBeNull();
  });

  // Il massimo lo scrive il server solo quando arriva la prima risposta:
  // fino ad allora la colonna vale zero, e la riga diceva "Tentativo in
  // corso: 0/0" — un massimo che nessun esercizio ha mai avuto.
  it("un tentativo appena aperto non mostra 0/0", async () => {
    vi.mocked(prisma.esercizio.findMany).mockResolvedValue(
      esercizioCon([{ status: "IN_PROGRESS", score: 0, maxScore: 0 }]) as never,
    );
    await rendi();
    expect(screen.getByText("tentativoAperto")).toBeInTheDocument();
    expect(screen.queryByText(/0\/0/)).toBeNull();
  });

  it("un tentativo in corso con un massimo mostra il punteggio", async () => {
    vi.mocked(prisma.esercizio.findMany).mockResolvedValue(
      esercizioCon([{ status: "IN_PROGRESS", score: 1, maxScore: 2 }]) as never,
    );
    await rendi();
    expect(screen.getByText(/^tentativoInCorso:.*"score":1.*"maxScore":2/)).toBeInTheDocument();
  });

  it("senza tentativi non si dice nulla del tentativo", async () => {
    vi.mocked(prisma.esercizio.findMany).mockResolvedValue(esercizioCon([]) as never);
    await rendi();
    expect(screen.queryByText(/tentativo/i)).toBeNull();
    expect(screen.getByText("Prova")).toBeInTheDocument();
  });
});

// Task 7: i compiti della classe dello studente compaiono in cima, con la
// scadenza, e l'apertura di un esercizio del compito porta con sé il
// compitoId — vedi il commento gemello nel dominio (tentativo.ts) sul perché
// questo non è un dettaglio opzionale.
describe("i compiti dello studente", () => {
  beforeEach(() => {
    vi.mocked(prisma.esercizio.findMany).mockResolvedValue(esercizioCon([]) as never);
  });

  it("un compito senza opensAt si vede, sopra gli esercizi liberi", async () => {
    vi.mocked(compitiDelloStudente).mockResolvedValue([
      { id: "c1", batteria: "Batteria 1", dueAt: null, esercizi: [{ esercizioId: "e1", title: "Es 1" }], fatti: 0 },
    ] as never);
    vi.mocked(prisma.compito.findMany).mockResolvedValue([{ id: "c1", opensAt: null }] as never);

    await rendi();

    const batteria = screen.getByText("Batteria 1");
    const liberi = screen.getByText("Prova");
    expect(batteria.compareDocumentPosition(liberi) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("un compito con opensAt passato si vede", async () => {
    vi.mocked(compitiDelloStudente).mockResolvedValue([
      { id: "c1", batteria: "Batteria 1", dueAt: null, esercizi: [{ esercizioId: "e1", title: "Es 1" }], fatti: 0 },
    ] as never);
    vi.mocked(prisma.compito.findMany).mockResolvedValue([
      { id: "c1", opensAt: new Date(Date.now() - 86_400_000) },
    ] as never);

    await rendi();
    expect(screen.getByText("Batteria 1")).toBeInTheDocument();
  });

  it("un compito con opensAt futuro non si vede", async () => {
    vi.mocked(compitiDelloStudente).mockResolvedValue([
      { id: "c1", batteria: "Batteria 1", dueAt: null, esercizi: [{ esercizioId: "e1", title: "Es 1" }], fatti: 0 },
    ] as never);
    vi.mocked(prisma.compito.findMany).mockResolvedValue([
      { id: "c1", opensAt: new Date(Date.now() + 86_400_000) },
    ] as never);

    await rendi();
    expect(screen.queryByText("Batteria 1")).toBeNull();
  });

  // La scadenza passata non nasconde niente: si mostra e basta (punto aperto
  // della spec, deliberatamente non deciso qui).
  it("un compito scaduto resta visibile, con la scadenza mostrata", async () => {
    vi.mocked(compitiDelloStudente).mockResolvedValue([
      {
        id: "c1", batteria: "Batteria 1", dueAt: new Date("2020-01-01T00:00:00Z"),
        esercizi: [{ esercizioId: "e1", title: "Es 1" }], fatti: 0,
      },
    ] as never);
    vi.mocked(prisma.compito.findMany).mockResolvedValue([{ id: "c1", opensAt: null }] as never);

    await rendi();
    expect(screen.getByText("Batteria 1")).toBeInTheDocument();
    expect(screen.getByText(/compitoScadenza/)).toBeInTheDocument();
  });

  it("l'esercizio di un compito si apre con il compitoId nel link, quello libero no", async () => {
    vi.mocked(compitiDelloStudente).mockResolvedValue([
      { id: "c1", batteria: "Batteria 1", dueAt: null, esercizi: [{ esercizioId: "e1", title: "Es del compito" }], fatti: 0 },
    ] as never);
    vi.mocked(prisma.compito.findMany).mockResolvedValue([{ id: "c1", opensAt: null }] as never);

    await rendi();

    const linkCompito = screen.getByRole("link", { name: /Es del compito/ });
    expect(linkCompito).toHaveAttribute("href", "/studente/esercizio/e1?compitoId=c1");

    const linkLibero = screen.getByRole("link", { name: /Prova/ });
    expect(linkLibero).toHaveAttribute("href", "/studente/esercizio/01-prova");
  });
});

// Task 4: un campo per iscriversi con un codice, nell'area studente. La
// spec (task 4, design doc) chiede che un codice sbagliato dica solo "non
// valido" — senza distinguere un codice mai esistito da uno di un'altra
// scuola, perché la distinzione insegnerebbe a un estraneo quali codici
// esistono davvero. La rotta (`api/esercizi/classi/iscrizione/route.ts`,
// task 3) appiattisce già i due casi sullo stesso `codice_sconosciuto`: qui
// si verifica che il form non li separi di nuovo nel testo.
describe("iscrizione a una classe con un codice", () => {
  beforeEach(() => {
    vi.mocked(prisma.esercizio.findMany).mockResolvedValue(esercizioCon([]) as never);
  });

  it("c'è un campo per il codice", async () => {
    await rendi();
    expect(screen.getByLabelText("campo")).toBeInTheDocument();
  });

  // Onda finale, punto 4 (terzo fix): il box del codice non aveva un
  // titolo suo, e si leggeva come parte della sezione degli esercizi
  // (nessun heading fra "I tuoi esercizi" e il campo del codice). Un
  // titolo proprio lo separa visivamente e per la struttura ad heading
  // della pagina (screen reader inclusi).
  it("il box del codice ha un titolo proprio", async () => {
    await rendi();
    expect(screen.getByRole("heading", { name: "titolo" })).toBeInTheDocument();
  });

  it("un codice inesistente e uno di un'altra scuola dicono la stessa cosa: non valido", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "codice_sconosciuto" }), { status: 404 }),
    ) as typeof fetch;

    await rendi();
    fireEvent.change(screen.getByLabelText("campo"), { target: { value: "ZZZZZZ" } });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    expect(await screen.findByText("erroreNonValido")).toBeInTheDocument();
    // Nessuna parola diversa per "esisteva ma non per te": la spec vieta
    // proprio quella distinzione.
    expect(screen.queryByText(/sconosciuto|inesistente/i)).toBeNull();
  });

  it("un'iscrizione già esistente ha un messaggio diverso da un codice non valido", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "gia_iscritto" }), { status: 409 }),
    ) as typeof fetch;

    await rendi();
    fireEvent.change(screen.getByLabelText("campo"), { target: { value: "AB3XQ7" } });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    expect(await screen.findByText("erroreGiaIscritto")).toBeInTheDocument();
    expect(screen.queryByText("erroreNonValido")).toBeNull();
  });

  it("un codice valido iscrive e lo dice", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ classe: { id: "c1", nome: "1A" } }), { status: 201 }),
    ) as typeof fetch;

    await rendi();
    fireEvent.change(screen.getByLabelText("campo"), { target: { value: "AB3XQ7" } });
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/esercizi/classi/iscrizione",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const body = JSON.parse((vi.mocked(global.fetch).mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ codice: "AB3XQ7" });
    expect(await screen.findByText(`successo:${JSON.stringify({ classe: "1A" })}`)).toBeInTheDocument();
  });
});
