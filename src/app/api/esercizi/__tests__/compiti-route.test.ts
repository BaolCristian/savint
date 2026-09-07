import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({
  requireTeacher: vi.fn(),
}));
vi.mock("@/lib/esercizi/compiti", () => ({
  assegna: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireTeacher } from "@/lib/auth/require-role";
import { assegna } from "@/lib/esercizi/compiti";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { POST } from "@/app/api/esercizi/compiti/route";

const richiesta = (body: unknown) =>
  new Request("http://x/api/esercizi/compiti", { method: "POST", body: JSON.stringify(body) });

const corpoValido = { batteriaId: "b1", classeId: "c1" };

beforeEach(() => {
  vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente1" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe("POST /api/esercizi/compiti", () => {
  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST(richiesta(corpoValido))).status).toBe(401);
    expect(assegna).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato (studente)", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await POST(richiesta(corpoValido))).status).toBe(403);
    expect(assegna).not.toHaveBeenCalled();
  });

  it("400 con un corpo non valido", async () => {
    const r = await POST(richiesta({ batteriaId: 42 }));
    expect(r.status).toBe(400);
    expect(assegna).not.toHaveBeenCalled();
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 12 });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("12");
    expect(assegna).not.toHaveBeenCalled();
  });

  it("404 se la batteria non esiste", async () => {
    vi.mocked(assegna).mockResolvedValue({ ok: false, motivo: "batteria_non_trovata" });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "batteria_non_trovata" });
  });

  it("404 se la classe non esiste", async () => {
    vi.mocked(assegna).mockResolvedValue({ ok: false, motivo: "classe_non_trovata" });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "classe_non_trovata" });
  });

  it("403 se il docente non insegna quella classe", async () => {
    vi.mocked(assegna).mockResolvedValue({ ok: false, motivo: "non_insegni_questa_classe" });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "non_insegni_questa_classe" });
  });

  // Il caso che conta di più: il dettaglio (quale contenitore, quanti
  // richiesti, quanti disponibili) deve arrivare fino al corpo della
  // risposta. Un'implementazione distratta appiattisce `esito.motivo` su un
  // messaggio generico e perde `dettaglio` — il docente saprebbe solo che
  // l'assegnazione è fallita, non perché né come rimediare.
  it("409 con il dettaglio della capienza insufficiente nel corpo", async () => {
    vi.mocked(assegna).mockResolvedValue({
      ok: false,
      motivo: "esercizi_insufficienti",
      dettaglio: { contenitore: "Equazioni", richiesti: 5, disponibili: 3 },
    });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({
      error: "esercizi_insufficienti",
      dettaglio: { contenitore: "Equazioni", richiesti: 5, disponibili: 3 },
    });
  });

  it("201 con il compitoId quando l'assegnazione riesce", async () => {
    vi.mocked(assegna).mockResolvedValue({ ok: true, compitoId: "compito1" });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ compitoId: "compito1" });
  });

  it("passa il docente della sessione come assignedById, non uno arbitrario", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente-vero" } } } as never);
    vi.mocked(assegna).mockResolvedValue({ ok: true, compitoId: "x" });
    await POST(richiesta(corpoValido));
    expect(assegna).toHaveBeenCalledWith("b1", "c1", "docente-vero", expect.anything());
  });

  it("il tetto e' contato per docente", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente-vero" } } } as never);
    vi.mocked(assegna).mockResolvedValue({ ok: true, compitoId: "x" });
    await POST(richiesta(corpoValido));
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: expect.stringContaining("docente-vero") }),
    );
  });

  it("accetta opensAt e dueAt opzionali e li inoltra come Date", async () => {
    vi.mocked(assegna).mockResolvedValue({ ok: true, compitoId: "x" });
    const corpo = { ...corpoValido, opensAt: "2026-09-10T00:00:00.000Z", dueAt: "2026-09-20T00:00:00.000Z" };
    await POST(richiesta(corpo));
    expect(assegna).toHaveBeenCalledWith(
      "b1", "c1", "docente1",
      expect.objectContaining({ opensAt: new Date("2026-09-10T00:00:00.000Z"), dueAt: new Date("2026-09-20T00:00:00.000Z") }),
    );
  });
});
