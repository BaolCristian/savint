import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({
  requireTeacher: vi.fn(),
}));
vi.mock("@/lib/esercizi/redazione", () => ({
  elencoRedazione: vi.fn(),
  creaEsercizio: vi.fn(),
  salvaNuovaVersione: vi.fn(),
  duplicaEsercizio: vi.fn(),
  caricaPerEditor: vi.fn(),
  verificaEsercizio: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireTeacher } from "@/lib/auth/require-role";
import {
  elencoRedazione, creaEsercizio, salvaNuovaVersione, duplicaEsercizio, caricaPerEditor, verificaEsercizio,
} from "@/lib/esercizi/redazione";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { GET, POST } from "@/app/api/esercizi/redazione/route";
import { GET as GET_ID, PUT } from "@/app/api/esercizi/redazione/[id]/route";
import { POST as POST_DUPLICA } from "@/app/api/esercizi/redazione/[id]/duplica/route";
import { POST as POST_VERIFICA } from "@/app/api/esercizi/redazione/verifica/route";

const params = Promise.resolve({ id: "es1" });

// Un editor valido minimo, sufficiente a passare esercizioEditorSchema (che
// NON è mockato qui: è il file "finito" di editor/modello.ts).
const editorValido = {
  meta: { titolo: "Equazione", descrizione: "", anno: 1, argomento: "equazioni", tag: [], difficolta: 1 },
  testo: "Risolvi \\(x+1=0\\)",
  suggerimento: "",
  variabili: [],
  condizione: "",
  parti: [{ tipo: "numerica", consegna: "\\(x=\\)", punti: 1, valore: "-1", tolleranza: { tipo: "esatta" } }],
};

beforeEach(() => {
  vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente1" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe("GET /api/esercizi/redazione", () => {
  const richiesta = () => new Request("http://x/api/esercizi/redazione", { method: "GET" });

  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await GET()).status).toBe(401);
    expect(elencoRedazione).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await GET()).status).toBe(403);
    expect(elencoRedazione).not.toHaveBeenCalled();
  });

  it("200 con l'elenco della redazione", async () => {
    const voce = { id: "e1", titolo: "T", argomento: "algebra", anno: 1, ultimaVersione: 2,
      modificabile: true, autoreNome: "Prof", aggiornatoIl: new Date("2026-01-01") };
    vi.mocked(elencoRedazione).mockResolvedValue([voce]);
    const r = await GET();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([{ ...voce, aggiornatoIl: voce.aggiornatoIl.toISOString() }]);
  });

  void richiesta;
});

describe("POST /api/esercizi/redazione (crea)", () => {
  const richiesta = (body: unknown) =>
    new Request("http://x/api/esercizi/redazione", { method: "POST", body: JSON.stringify(body) });
  const corpoValido = { editor: editorValido };

  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST(richiesta(corpoValido))).status).toBe(401);
    expect(creaEsercizio).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await POST(richiesta(corpoValido))).status).toBe(403);
    expect(creaEsercizio).not.toHaveBeenCalled();
  });

  it("400 con un corpo non valido (manca editor)", async () => {
    const r = await POST(richiesta({}));
    expect(r.status).toBe(400);
    expect(creaEsercizio).not.toHaveBeenCalled();
  });

  it("400 se l'editor non rispetta lo schema (es. un titolo vuoto)", async () => {
    const corpoRotto = { editor: { ...editorValido, meta: { ...editorValido.meta, titolo: "" } } };
    const r = await POST(richiesta(corpoRotto));
    expect(r.status).toBe(400);
    expect(creaEsercizio).not.toHaveBeenCalled();
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 15 });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("15");
    expect(creaEsercizio).not.toHaveBeenCalled();
  });

  it("il tetto e' contato per docente, con la chiave 'esercizi:redazione-crea:'", async () => {
    vi.mocked(creaEsercizio).mockResolvedValue({ ok: true, esercizioId: "e1", versione: 1 });
    await POST(richiesta(corpoValido));
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "esercizi:redazione-crea:docente1" }),
    );
  });

  it("passa il docente della sessione come authorId, non uno arbitrario", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente-vero" } } } as never);
    vi.mocked(creaEsercizio).mockResolvedValue({ ok: true, esercizioId: "e1", versione: 1 });
    await POST(richiesta(corpoValido));
    expect(creaEsercizio).toHaveBeenCalledWith(editorValido, "docente-vero");
  });

  it("201 con esercizioId e versione quando la creazione riesce", async () => {
    vi.mocked(creaEsercizio).mockResolvedValue({ ok: true, esercizioId: "e1", versione: 1 });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ esercizioId: "e1", versione: 1 });
  });

  // Il caso che questo task fallisce più facilmente (vedi il brief): il
  // dettaglio della verifica a venti semi — seme, fase, messaggio — deve
  // arrivare fino al corpo della risposta, con status 422. Appiattirlo su
  // "salvataggio non riuscito" toglierebbe al docente l'unica informazione
  // utile che il controllo produce.
  it("422 con il dettaglio della verifica (seme, fase, messaggio) nel corpo", async () => {
    vi.mocked(creaEsercizio).mockResolvedValue({
      ok: false,
      motivo: "verifica_fallita",
      dettaglio: { ok: false, seme: 14, fase: "risposta", messaggio: "la parte \"p0\" non ha una risposta corretta" },
    });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({
      error: "verifica_fallita",
      dettaglio: { ok: false, seme: 14, fase: "risposta", messaggio: "la parte \"p0\" non ha una risposta corretta" },
    });
  });
});

describe("GET /api/esercizi/redazione/[id]", () => {
  const richiesta = () => new Request("http://x/api/esercizi/redazione/es1", { method: "GET" });

  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await GET_ID(richiesta(), { params })).status).toBe(401);
    expect(caricaPerEditor).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await GET_ID(richiesta(), { params })).status).toBe(403);
    expect(caricaPerEditor).not.toHaveBeenCalled();
  });

  it("404 se l'esercizio non esiste", async () => {
    vi.mocked(caricaPerEditor).mockResolvedValue({ ok: false, motivo: "non_trovato", dettaglio: "nessun esercizio con id \"es1\"" });
    const r = await GET_ID(richiesta(), { params });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "non_trovato", dettaglio: "nessun esercizio con id \"es1\"" });
  });

  it("409 con il dettaglio se l'esercizio non e' rappresentabile", async () => {
    vi.mocked(caricaPerEditor).mockResolvedValue({ ok: false, motivo: "non_rappresentabile", dettaglio: "contiene gapfill" });
    const r = await GET_ID(richiesta(), { params });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "non_rappresentabile", dettaglio: "contiene gapfill" });
  });

  it("200 con editor, versione, autoreNome e aggiornatoIl", async () => {
    const aggiornatoIl = new Date("2026-02-01");
    vi.mocked(caricaPerEditor).mockResolvedValue({
      ok: true, editor: editorValido as never, versione: 3, autoreNome: "Prof", aggiornatoIl,
    });
    const r = await GET_ID(richiesta(), { params });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      editor: editorValido, versione: 3, autoreNome: "Prof", aggiornatoIl: aggiornatoIl.toISOString(),
    });
    expect(caricaPerEditor).toHaveBeenCalledWith("es1");
  });
});

describe("PUT /api/esercizi/redazione/[id] (salva)", () => {
  const richiesta = (body: unknown) =>
    new Request("http://x/api/esercizi/redazione/es1", { method: "PUT", body: JSON.stringify(body) });
  const corpoValido = { editor: editorValido };

  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await PUT(richiesta(corpoValido), { params })).status).toBe(401);
    expect(salvaNuovaVersione).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await PUT(richiesta(corpoValido), { params })).status).toBe(403);
    expect(salvaNuovaVersione).not.toHaveBeenCalled();
  });

  it("400 con un corpo non valido", async () => {
    const r = await PUT(richiesta({}), { params });
    expect(r.status).toBe(400);
    expect(salvaNuovaVersione).not.toHaveBeenCalled();
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 20 });
    const r = await PUT(richiesta(corpoValido), { params });
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("20");
    expect(salvaNuovaVersione).not.toHaveBeenCalled();
  });

  it("il tetto e' contato per docente, con la chiave 'esercizi:redazione-salva:'", async () => {
    vi.mocked(salvaNuovaVersione).mockResolvedValue({ ok: true, esercizioId: "es1", versione: 2 });
    await PUT(richiesta(corpoValido), { params });
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "esercizi:redazione-salva:docente1" }),
    );
  });

  it("404 se l'esercizio non esiste", async () => {
    vi.mocked(salvaNuovaVersione).mockResolvedValue({ ok: false, motivo: "non_trovato", dettaglio: "x" });
    const r = await PUT(richiesta(corpoValido), { params });
    expect(r.status).toBe(404);
  });

  // Stesso caso critico della POST di creazione, sul percorso di salvataggio.
  it("422 con il dettaglio della verifica (seme, fase, messaggio) nel corpo", async () => {
    vi.mocked(salvaNuovaVersione).mockResolvedValue({
      ok: false,
      motivo: "verifica_fallita",
      dettaglio: { ok: false, seme: 3, fase: "testo", messaggio: "la variabile \"zeta\" non e' dichiarata" },
    });
    const r = await PUT(richiesta(corpoValido), { params });
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({
      error: "verifica_fallita",
      dettaglio: { ok: false, seme: 3, fase: "testo", messaggio: "la variabile \"zeta\" non e' dichiarata" },
    });
  });

  // Item 2 del carry-over di revisione: due schede aperte sullo stesso
  // esercizio, la seconda a scrivere perde la corsa sul numero di versione.
  it("409 quando due salvataggi concorrenti collidono sul numero di versione", async () => {
    vi.mocked(salvaNuovaVersione).mockResolvedValue({
      ok: false,
      motivo: "versione_in_conflitto",
      dettaglio: "un altro salvataggio ha già scritto una versione nel frattempo; riprova",
    });
    const r = await PUT(richiesta(corpoValido), { params });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({
      error: "versione_in_conflitto",
      dettaglio: "un altro salvataggio ha già scritto una versione nel frattempo; riprova",
    });
  });

  it("200 con esercizioId e versione quando il salvataggio riesce", async () => {
    vi.mocked(salvaNuovaVersione).mockResolvedValue({ ok: true, esercizioId: "es1", versione: 2 });
    const r = await PUT(richiesta(corpoValido), { params });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ esercizioId: "es1", versione: 2 });
    expect(salvaNuovaVersione).toHaveBeenCalledWith("es1", editorValido);
  });
});

describe("POST /api/esercizi/redazione/[id]/duplica", () => {
  const richiesta = () => new Request("http://x/api/esercizi/redazione/es1/duplica", { method: "POST" });

  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST_DUPLICA(richiesta(), { params })).status).toBe(401);
    expect(duplicaEsercizio).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await POST_DUPLICA(richiesta(), { params })).status).toBe(403);
    expect(duplicaEsercizio).not.toHaveBeenCalled();
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 5 });
    const r = await POST_DUPLICA(richiesta(), { params });
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("5");
    expect(duplicaEsercizio).not.toHaveBeenCalled();
  });

  it("il tetto e' contato per docente, con la chiave 'esercizi:redazione-duplica:'", async () => {
    vi.mocked(duplicaEsercizio).mockResolvedValue({ ok: true, esercizioId: "e2", versione: 1 });
    await POST_DUPLICA(richiesta(), { params });
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "esercizi:redazione-duplica:docente1" }),
    );
  });

  it("404 se l'esercizio originale non esiste", async () => {
    vi.mocked(duplicaEsercizio).mockResolvedValue({ ok: false, motivo: "non_trovato", dettaglio: "x" });
    const r = await POST_DUPLICA(richiesta(), { params });
    expect(r.status).toBe(404);
  });

  it("201 con l'id e la versione del duplicato, passando il docente della sessione", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente-vero" } } } as never);
    vi.mocked(duplicaEsercizio).mockResolvedValue({ ok: true, esercizioId: "e2", versione: 1 });
    const r = await POST_DUPLICA(richiesta(), { params });
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ esercizioId: "e2", versione: 1 });
    expect(duplicaEsercizio).toHaveBeenCalledWith("es1", "docente-vero");
  });
});

describe("POST /api/esercizi/redazione/verifica", () => {
  const richiesta = (body: unknown) =>
    new Request("http://x/api/esercizi/redazione/verifica", { method: "POST", body: JSON.stringify(body) });
  const corpoValido = { editor: editorValido };

  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST_VERIFICA(richiesta(corpoValido))).status).toBe(401);
    expect(verificaEsercizio).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await POST_VERIFICA(richiesta(corpoValido))).status).toBe(403);
    expect(verificaEsercizio).not.toHaveBeenCalled();
  });

  it("400 con un corpo non valido", async () => {
    const r = await POST_VERIFICA(richiesta({}));
    expect(r.status).toBe(400);
    expect(verificaEsercizio).not.toHaveBeenCalled();
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 8 });
    const r = await POST_VERIFICA(richiesta(corpoValido));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("8");
    expect(verificaEsercizio).not.toHaveBeenCalled();
  });

  it("il tetto e' contato per docente, con una chiave propria ('esercizi:redazione-verifica:')", async () => {
    vi.mocked(verificaEsercizio).mockReturnValue({ ok: true });
    await POST_VERIFICA(richiesta(corpoValido));
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "esercizi:redazione-verifica:docente1" }),
    );
  });

  it("200 { ok: true } quando l'esercizio passa la verifica", async () => {
    vi.mocked(verificaEsercizio).mockReturnValue({ ok: true });
    const r = await POST_VERIFICA(richiesta(corpoValido));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(verificaEsercizio).toHaveBeenCalledWith(editorValido);
  });

  // Lo stesso caso critico, sul percorso "controlla senza salvare": qui non
  // c'e' un `EsitoRedazione` di mezzo, ma il dettaglio deve comunque
  // arrivare nel corpo, con lo stesso status e la stessa forma delle altre
  // due rotte — cosi' il modulo puo' riusare lo stesso codice per mostrarlo.
  it("422 con il dettaglio della verifica (seme, fase, messaggio) nel corpo", async () => {
    vi.mocked(verificaEsercizio).mockReturnValue({ ok: false, seme: 7, fase: "risposta", messaggio: "la parte \"p0\" non ha una risposta corretta" });
    const r = await POST_VERIFICA(richiesta(corpoValido));
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({
      error: "verifica_fallita",
      dettaglio: { ok: false, seme: 7, fase: "risposta", messaggio: "la parte \"p0\" non ha una risposta corretta" },
    });
  });
});
