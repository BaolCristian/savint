import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({
  requireStudent: vi.fn(),
}));
vi.mock("@/lib/esercizi/tentativo", () => ({
  applicaRisposta: vi.fn(),
  completa: vi.fn(),
  abbandona: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireStudent } from "@/lib/auth/require-role";
import { applicaRisposta, completa, abbandona } from "@/lib/esercizi/tentativo";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { POST } from "@/app/api/esercizi/tentativi/[id]/risposta/route";
import { POST as POST_COMPLETA } from "@/app/api/esercizi/tentativi/[id]/completa/route";
import { POST as POST_ABBANDONA } from "@/app/api/esercizi/tentativi/[id]/abbandona/route";

const params = Promise.resolve({ id: "t1" });
const richiesta = (body: unknown) =>
  new Request("http://x/api/esercizi/tentativi/t1/risposta", { method: "POST", body: JSON.stringify(body) });
// Per i corpi che non si possono costruire con `JSON.stringify` (l'array
// innestato dell'attacco è così profondo che `JSON.stringify` stessa
// rischierebbe uno sforamento dello stack lato test): si scrive il testo
// JSON a mano e lo si passa come corpo grezzo. `request.json()` nella rotta
// lo legge con `JSON.parse`, nativo e non ricorsivo in JS: arriva intero a
// zod, che è il punto che deve fermarlo.
const richiestaGrezza = (corpoTesto: string) =>
  new Request("http://x/api/esercizi/tentativi/t1/risposta", { method: "POST", body: corpoTesto });

const corpoValido = { partPath: "p0", answer: "2", state: { seed: "s", answered: false, submitted: 0,
  adviceDisplayed: false, revealed: false, score: 0, marks: 2, parts: [] } };

beforeEach(() => {
  vi.mocked(requireStudent).mockResolvedValue({ ok: true, session: { user: { id: "u1" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe("POST risposta", () => {
  it("401 se non autenticato", async () => {
    vi.mocked(requireStudent).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST(richiesta(corpoValido), { params })).status).toBe(401);
  });

  it("400 con un corpo non valido", async () => {
    const r = await POST(richiesta({ partPath: 42 }), { params });
    expect(r.status).toBe(400);
  });

  it("404 se il tentativo non esiste", async () => {
    vi.mocked(applicaRisposta).mockResolvedValue({ ok: false, motivo: "non_trovato" });
    expect((await POST(richiesta(corpoValido), { params })).status).toBe(404);
  });

  it("403 se il tentativo e' di un altro", async () => {
    vi.mocked(applicaRisposta).mockResolvedValue({ ok: false, motivo: "non_tuo" });
    expect((await POST(richiesta(corpoValido), { params })).status).toBe(403);
  });

  it("409 se gia' completato", async () => {
    vi.mocked(applicaRisposta).mockResolvedValue({ ok: false, motivo: "gia_completato" });
    expect((await POST(richiesta(corpoValido), { params })).status).toBe(409);
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    expect((await POST(richiesta(corpoValido), { params })).status).toBe(429);
  });

  it("200 con il punteggio del server", async () => {
    vi.mocked(applicaRisposta).mockResolvedValue({ ok: true, score: 2, maxScore: 2, allCorrect: true, feedback: [] });
    const r = await POST(richiesta(corpoValido), { params });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ score: 2, maxScore: 2, allCorrect: true, feedback: [] });
  });

  // Fix round 1, finding 2: due modi con cui uno studente autenticato poteva
  // far cadere il processo con un corpo piccolo, invece di ricevere un 400.

  it("400 con un answer innestato a profondita' enorme, senza sforare lo stack", async () => {
    // ~120 KB, 60.000 livelli: prima dello schema a profondita' finita, lo
    // stesso schema ricorsivo che valida `answer` lanciava
    // `RangeError: Maximum call stack size exceeded` dentro `safeParse` — non
    // uno `ZodError`, quindi non veniva intercettato e usciva come eccezione
    // non gestita. Verificato separatamente che lo schema precedente
    // (ricostruito identico, fuori da questo file) lancia davvero a questa
    // profondita', e che quello attuale no.
    const profondo = "[".repeat(60_000) + "null" + "]".repeat(60_000);
    const corpo = `{"partPath":"p0","answer":${profondo},"state":${JSON.stringify(corpoValido.state)}}`;
    const r = await POST(richiestaGrezza(corpo), { params });
    expect(r.status).toBe(400);
  });

  // Onda finale, punto 4: la foglia stringa di `answer` non aveva un tetto.
  // Provato con una richiesta vera: 300.000 caratteri tornavano 200 e
  // finivano dentro lo `state` persistito del tentativo — a 120 richieste al
  // minuto, decine di MB al minuto da un solo account, rispediti al browser
  // al caricamento successivo.
  it("400 con una risposta lunghissima, e non arriva al dominio", async () => {
    const chiamateIniziali = vi.mocked(applicaRisposta).mock.calls.length;
    const corpo = { ...corpoValido, answer: "x".repeat(300_000) };
    const r = await POST(richiesta(corpo), { params });
    expect(r.status).toBe(400);
    expect(vi.mocked(applicaRisposta).mock.calls.length).toBe(chiamateIniziali);
  });

  it("400 anche se la stringa lunghissima e' annidata in un array (i gap di un gapfill)", async () => {
    const chiamateIniziali = vi.mocked(applicaRisposta).mock.calls.length;
    const corpo = { ...corpoValido, answer: ["2", "y".repeat(300_000)] };
    const r = await POST(richiesta(corpo), { params });
    expect(r.status).toBe(400);
    expect(vi.mocked(applicaRisposta).mock.calls.length).toBe(chiamateIniziali);
  });

  it("400 se la stringa lunghissima arriva dentro state.parts[].answer", async () => {
    const chiamateIniziali = vi.mocked(applicaRisposta).mock.calls.length;
    const corpo = {
      ...corpoValido,
      state: {
        ...corpoValido.state,
        parts: [{ path: "p0", answered: true, score: 0, marks: 2, answer: "z".repeat(300_000) }],
      },
    };
    const r = await POST(richiesta(corpo), { params });
    expect(r.status).toBe(400);
    expect(vi.mocked(applicaRisposta).mock.calls.length).toBe(chiamateIniziali);
  });

  it("una risposta di lunghezza plausibile passa comunque", async () => {
    vi.mocked(applicaRisposta).mockResolvedValue({ ok: true, score: 1, maxScore: 2, allCorrect: false, feedback: [] });
    const corpo = { ...corpoValido, answer: "(x^2 + 2*x + 1)/(x - 1)".repeat(4) };
    expect((await POST(richiesta(corpo), { params })).status).toBe(200);
  });

  it("400 con una voce nulla dentro state.parts (non arriva mai al motore)", async () => {
    const chiamateIniziali = vi.mocked(applicaRisposta).mock.calls.length;
    const corpo = { ...corpoValido, state: { ...corpoValido.state, parts: [null] } };
    const r = await POST(richiesta(corpo), { params });
    expect(r.status).toBe(400);
    // Lo schema deve fermarla in validazione, prima di arrivare al dominio:
    // nessuna nuova chiamata rispetto a prima di questa richiesta.
    expect(vi.mocked(applicaRisposta).mock.calls.length).toBe(chiamateIniziali);
  });

  it("400 se la ricostruzione lato server lancia comunque (stato malformato ma sintatticamente valido)", async () => {
    vi.mocked(applicaRisposta).mockRejectedValue(new Error("stato non ricostruibile"));
    const r = await POST(richiesta(corpoValido), { params });
    expect(r.status).toBe(400);
  });
});

describe("POST completa", () => {
  const paramsCompleta = Promise.resolve({ id: "t1" });
  const richiestaCompleta = () =>
    new Request("http://x/api/esercizi/tentativi/t1/completa", { method: "POST" });

  it("401 se non autenticato", async () => {
    vi.mocked(requireStudent).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST_COMPLETA(richiestaCompleta(), { params: paramsCompleta })).status).toBe(401);
  });

  it("404 se il tentativo non esiste", async () => {
    vi.mocked(completa).mockResolvedValue({ ok: false, motivo: "non_trovato" });
    expect((await POST_COMPLETA(richiestaCompleta(), { params: paramsCompleta })).status).toBe(404);
  });

  it("403 se il tentativo e' di un altro", async () => {
    vi.mocked(completa).mockResolvedValue({ ok: false, motivo: "non_tuo" });
    expect((await POST_COMPLETA(richiestaCompleta(), { params: paramsCompleta })).status).toBe(403);
  });

  it("200 con il punteggio del server", async () => {
    vi.mocked(completa).mockResolvedValue({ ok: true, score: 2, maxScore: 2 });
    const r = await POST_COMPLETA(richiestaCompleta(), { params: paramsCompleta });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ score: 2, maxScore: 2 });
  });

  // Onda finale, punto 9: la rotta sorella aveva un tetto di richieste,
  // questa no, eppure anche qui ogni chiamata faceva girare l'intero motore.
  it("429 quando il rate limit scatta", async () => {
    const chiamateIniziali = vi.mocked(completa).mock.calls.length;
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    const r = await POST_COMPLETA(richiestaCompleta(), { params: paramsCompleta });
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("30");
    // Il tetto si applica prima del dominio: nessuna chiusura tentata.
    expect(vi.mocked(completa).mock.calls.length).toBe(chiamateIniziali);
  });

  it("il tetto e' contato per studente, con una chiave diversa da quella delle risposte", async () => {
    vi.mocked(requireStudent).mockResolvedValue({ ok: true, session: { user: { id: "u-vero" } } } as never);
    vi.mocked(completa).mockResolvedValue({ ok: true, score: 1, maxScore: 1 });
    await POST_COMPLETA(richiestaCompleta(), { params: paramsCompleta });
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "esercizi:completa:u-vero" }),
    );
  });

  it("passa lo studente della sessione, non uno arbitrario", async () => {
    vi.mocked(requireStudent).mockResolvedValue({ ok: true, session: { user: { id: "u-vero" } } } as never);
    vi.mocked(completa).mockResolvedValue({ ok: true, score: 1, maxScore: 1 });
    await POST_COMPLETA(richiestaCompleta(), { params: paramsCompleta });
    expect(completa).toHaveBeenCalledWith("t1", "u-vero", "it");
  });
});

describe("POST abbandona", () => {
  const paramsAbbandona = Promise.resolve({ id: "t1" });
  const richiestaAbbandona = () =>
    new Request("http://x/api/esercizi/tentativi/t1/abbandona", { method: "POST" });

  it("401 se non autenticato", async () => {
    vi.mocked(requireStudent).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST_ABBANDONA(richiestaAbbandona(), { params: paramsAbbandona })).status).toBe(401);
  });

  it("404 se il tentativo non esiste", async () => {
    vi.mocked(abbandona).mockResolvedValue({ ok: false, motivo: "non_trovato" });
    expect((await POST_ABBANDONA(richiestaAbbandona(), { params: paramsAbbandona })).status).toBe(404);
  });

  // La verifica di proprietà: senza questo controllo uno studente potrebbe
  // distruggere il tentativo di un altro passandone semplicemente l'id.
  it("403 se il tentativo e' di un altro", async () => {
    vi.mocked(abbandona).mockResolvedValue({ ok: false, motivo: "non_tuo" });
    expect((await POST_ABBANDONA(richiestaAbbandona(), { params: paramsAbbandona })).status).toBe(403);
  });

  // Un tentativo già consegnato non deve poter tornare indietro: vedi il
  // commento su `abbandona` nel dominio.
  it("409 se gia' completato", async () => {
    vi.mocked(abbandona).mockResolvedValue({ ok: false, motivo: "gia_completato" });
    expect((await POST_ABBANDONA(richiestaAbbandona(), { params: paramsAbbandona })).status).toBe(409);
  });

  it("200 quando l'abbandono riesce", async () => {
    vi.mocked(abbandona).mockResolvedValue({ ok: true });
    const r = await POST_ABBANDONA(richiestaAbbandona(), { params: paramsAbbandona });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it("429 quando il rate limit scatta", async () => {
    const chiamateIniziali = vi.mocked(abbandona).mock.calls.length;
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
    const r = await POST_ABBANDONA(richiestaAbbandona(), { params: paramsAbbandona });
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("30");
    // Il tetto si applica prima del dominio: nessun abbandono tentato.
    expect(vi.mocked(abbandona).mock.calls.length).toBe(chiamateIniziali);
  });

  it("il tetto e' contato per studente, con una chiave propria", async () => {
    vi.mocked(requireStudent).mockResolvedValue({ ok: true, session: { user: { id: "u-vero" } } } as never);
    vi.mocked(abbandona).mockResolvedValue({ ok: true });
    await POST_ABBANDONA(richiestaAbbandona(), { params: paramsAbbandona });
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "esercizi:abbandona:u-vero" }),
    );
  });

  it("passa lo studente della sessione, non uno arbitrario", async () => {
    vi.mocked(requireStudent).mockResolvedValue({ ok: true, session: { user: { id: "u-vero" } } } as never);
    vi.mocked(abbandona).mockResolvedValue({ ok: true });
    await POST_ABBANDONA(richiestaAbbandona(), { params: paramsAbbandona });
    expect(abbandona).toHaveBeenCalledWith("t1", "u-vero");
  });
});
