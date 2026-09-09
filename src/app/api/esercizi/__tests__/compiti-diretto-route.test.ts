import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({
  requireTeacher: vi.fn(),
}));
vi.mock("@/lib/esercizi/compiti", () => ({
  assegnaDiretto: vi.fn(),
}));
vi.mock("@/lib/esercizi/classi", () => ({
  classiDelDocente: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireTeacher } from "@/lib/auth/require-role";
import { assegnaDiretto } from "@/lib/esercizi/compiti";
import { classiDelDocente } from "@/lib/esercizi/classi";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { POST } from "@/app/api/esercizi/compiti/diretto/route";

const richiesta = (body: unknown) =>
  new Request("http://x/api/esercizi/compiti/diretto", { method: "POST", body: JSON.stringify(body) });

const corpoValido = { classeId: "c1", argomento: "Equazioni", quanti: 5 };
const classeConAnno = { id: "c1", name: "2A", yearLevel: 2, studenti: 10, codice: null };

beforeEach(() => {
  // Azzera le chiamate registrate dal test precedente: alcune asserzioni
  // qui sotto controllano "mai chiamata", e senza questo conterebbero
  // anche le chiamate di test precedenti che invocano legittimamente
  // assegnaDiretto.
  vi.clearAllMocks();
  vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente1" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(classiDelDocente).mockResolvedValue([classeConAnno] as never);
});

describe("POST /api/esercizi/compiti/diretto", () => {
  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST(richiesta(corpoValido))).status).toBe(401);
    expect(assegnaDiretto).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato (studente)", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await POST(richiesta(corpoValido))).status).toBe(403);
    expect(assegnaDiretto).not.toHaveBeenCalled();
  });

  it("400 con un corpo non valido", async () => {
    const r = await POST(richiesta({ classeId: "c1" }));
    expect(r.status).toBe(400);
    expect(assegnaDiretto).not.toHaveBeenCalled();
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 9 });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("9");
    expect(assegnaDiretto).not.toHaveBeenCalled();
  });

  it("404, non 403, se il docente non insegna quella classe", async () => {
    // Stessa ragione di compiti/route.ts: un 403 confermerebbe che la
    // classe esiste a chi non ha titolo per saperlo. classiDelDocente
    // restituisce solo le classi di QUESTO docente: se classeId non
    // compare, la classe non esiste o non è sua — stessa risposta.
    vi.mocked(classiDelDocente).mockResolvedValue([] as never);
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "non_insegni_questa_classe" });
    expect(assegnaDiretto).not.toHaveBeenCalled();
  });

  it("422 se la classe non ha un anno", async () => {
    vi.mocked(classiDelDocente).mockResolvedValue([{ ...classeConAnno, yearLevel: null }] as never);
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: "classe_senza_anno" });
    expect(assegnaDiretto).not.toHaveBeenCalled();
  });

  it("l'anno passato al dominio viene sempre dalla classe, mai dal corpo della richiesta", async () => {
    vi.mocked(assegnaDiretto).mockResolvedValue({ ok: true, compitoId: "x" });
    // Un client che tenta di dichiarare un anno diverso da quello vero
    // della classe: il campo non esiste nello schema del corpo, quindi
    // safeParse lo scarta silenziosamente (comportamento normale di zod
    // senza .strict()) — ciò che conta è che il valore usato sia SEMPRE
    // quello di classeConAnno.yearLevel (2), mai 99.
    await POST(richiesta({ ...corpoValido, anno: 99 }));
    expect(assegnaDiretto).toHaveBeenCalledWith(
      expect.objectContaining({ filtro: expect.objectContaining({ anno: 2 }) }),
    );
  });

  it("passa il docente della sessione come teacherId, non uno arbitrario", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente-vero" } } } as never);
    vi.mocked(assegnaDiretto).mockResolvedValue({ ok: true, compitoId: "x" });
    await POST(richiesta(corpoValido));
    expect(assegnaDiretto).toHaveBeenCalledWith(
      expect.objectContaining({ teacherId: "docente-vero", classeId: "c1" }),
    );
  });

  it("il tetto e' contato per docente", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente-vero" } } } as never);
    vi.mocked(assegnaDiretto).mockResolvedValue({ ok: true, compitoId: "x" });
    await POST(richiesta(corpoValido));
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: expect.stringContaining("docente-vero") }),
    );
  });

  it("inoltra difficoltaMax, opensAt e dueAt opzionali", async () => {
    vi.mocked(assegnaDiretto).mockResolvedValue({ ok: true, compitoId: "x" });
    const corpo = {
      ...corpoValido,
      difficoltaMax: 2,
      opensAt: "2026-09-10T00:00:00.000Z",
      dueAt: "2026-09-20T00:00:00.000Z",
    };
    await POST(richiesta(corpo));
    expect(assegnaDiretto).toHaveBeenCalledWith({
      classeId: "c1",
      teacherId: "docente1",
      filtro: { anno: 2, argomento: "Equazioni", difficoltaMax: 2 },
      quanti: 5,
      opensAt: new Date("2026-09-10T00:00:00.000Z"),
      dueAt: new Date("2026-09-20T00:00:00.000Z"),
    });
  });

  it("404 se batteria_non_trovata (difensivo)", async () => {
    vi.mocked(assegnaDiretto).mockResolvedValue({ ok: false, motivo: "batteria_non_trovata" });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(404);
  });

  it("400 scadenza_prima_apertura", async () => {
    vi.mocked(assegnaDiretto).mockResolvedValue({ ok: false, motivo: "scadenza_prima_apertura" });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(400);
  });

  it("400 scadenza_nel_passato", async () => {
    vi.mocked(assegnaDiretto).mockResolvedValue({ ok: false, motivo: "scadenza_nel_passato" });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(400);
  });

  // Il caso che conta di più: il dettaglio (quale contenitore/argomento,
  // quanti richiesti, quanti disponibili) deve arrivare fino al corpo
  // della risposta. Un'implementazione distratta appiattisce
  // `esito.motivo` su un messaggio generico e perde `dettaglio`.
  it("409 con il dettaglio della capienza insufficiente nel corpo", async () => {
    vi.mocked(assegnaDiretto).mockResolvedValue({
      ok: false,
      motivo: "esercizi_insufficienti",
      dettaglio: { contenitore: "Equazioni", richiesti: 10, disponibili: 4 },
    });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({
      error: "esercizi_insufficienti",
      dettaglio: { contenitore: "Equazioni", richiesti: 10, disponibili: 4 },
    });
  });

  it("201 con il compitoId quando l'assegnazione riesce", async () => {
    vi.mocked(assegnaDiretto).mockResolvedValue({ ok: true, compitoId: "compito1" });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ compitoId: "compito1" });
  });
});
