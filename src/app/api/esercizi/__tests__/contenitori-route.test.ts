import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({
  requireTeacher: vi.fn(),
}));
vi.mock("@/lib/esercizi/contenitori", () => ({
  creaContenitore: vi.fn(),
  aggiungiEsercizi: vi.fn(),
  togliEsercizio: vi.fn(),
  eliminaContenitore: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireTeacher } from "@/lib/auth/require-role";
import { creaContenitore, aggiungiEsercizi, togliEsercizio, eliminaContenitore } from "@/lib/esercizi/contenitori";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { POST } from "@/app/api/esercizi/contenitori/route";
import {
  POST as POST_ESERCIZI,
  DELETE as DELETE_ESERCIZI,
} from "@/app/api/esercizi/contenitori/[id]/esercizi/route";
import { DELETE as DELETE_CONTENITORE } from "@/app/api/esercizi/contenitori/[id]/route";

const params = Promise.resolve({ id: "cont1" });

beforeEach(() => {
  vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente1" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe("POST /api/esercizi/contenitori", () => {
  const richiesta = (body: unknown) =>
    new Request("http://x/api/esercizi/contenitori", { method: "POST", body: JSON.stringify(body) });

  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST(richiesta({ name: "Equazioni" }))).status).toBe(401);
    expect(creaContenitore).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await POST(richiesta({ name: "Equazioni" }))).status).toBe(403);
  });

  it("400 se manca name", async () => {
    const r = await POST(richiesta({ description: "x" }));
    expect(r.status).toBe(400);
    expect(creaContenitore).not.toHaveBeenCalled();
  });

  it("400 se name e' vuoto", async () => {
    const r = await POST(richiesta({ name: "" }));
    expect(r.status).toBe(400);
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 8 });
    const r = await POST(richiesta({ name: "Equazioni" }));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("8");
  });

  it("201 con l'id del contenitore creato", async () => {
    vi.mocked(creaContenitore).mockResolvedValue({ id: "cont1" });
    const r = await POST(richiesta({ name: "Equazioni", description: "primo grado" }));
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ id: "cont1" });
    expect(creaContenitore).toHaveBeenCalledWith("docente1", "Equazioni", "primo grado");
  });

  it("crea senza description quando omessa", async () => {
    vi.mocked(creaContenitore).mockResolvedValue({ id: "cont1" });
    await POST(richiesta({ name: "Equazioni" }));
    expect(creaContenitore).toHaveBeenCalledWith("docente1", "Equazioni", undefined);
  });
});

describe("POST /api/esercizi/contenitori/[id]/esercizi", () => {
  const richiesta = (body: unknown) =>
    new Request("http://x/api/esercizi/contenitori/cont1/esercizi", { method: "POST", body: JSON.stringify(body) });

  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST_ESERCIZI(richiesta({ esercizioIds: ["e1"] }), { params })).status).toBe(401);
    expect(aggiungiEsercizi).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await POST_ESERCIZI(richiesta({ esercizioIds: ["e1"] }), { params })).status).toBe(403);
  });

  it("400 con un corpo non valido", async () => {
    const r = await POST_ESERCIZI(richiesta({ esercizioIds: "e1" }), { params });
    expect(r.status).toBe(400);
    expect(aggiungiEsercizi).not.toHaveBeenCalled();
  });

  it("400 con un elenco vuoto", async () => {
    const r = await POST_ESERCIZI(richiesta({ esercizioIds: [] }), { params });
    expect(r.status).toBe(400);
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 3 });
    const r = await POST_ESERCIZI(richiesta({ esercizioIds: ["e1"] }), { params });
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("3");
  });

  it("200 col numero di righe davvero aggiunte", async () => {
    vi.mocked(aggiungiEsercizi).mockResolvedValue(2);
    const r = await POST_ESERCIZI(richiesta({ esercizioIds: ["e1", "e2"] }), { params });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ aggiunti: 2 });
    expect(aggiungiEsercizi).toHaveBeenCalledWith("cont1", ["e1", "e2"]);
  });
});

describe("DELETE /api/esercizi/contenitori/[id]/esercizi", () => {
  const richiesta = (body: unknown) =>
    new Request("http://x/api/esercizi/contenitori/cont1/esercizi", { method: "DELETE", body: JSON.stringify(body) });

  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await DELETE_ESERCIZI(richiesta({ esercizioId: "e1" }), { params })).status).toBe(401);
    expect(togliEsercizio).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await DELETE_ESERCIZI(richiesta({ esercizioId: "e1" }), { params })).status).toBe(403);
  });

  it("400 se manca esercizioId", async () => {
    const r = await DELETE_ESERCIZI(richiesta({}), { params });
    expect(r.status).toBe(400);
    expect(togliEsercizio).not.toHaveBeenCalled();
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 4 });
    const r = await DELETE_ESERCIZI(richiesta({ esercizioId: "e1" }), { params });
    expect(r.status).toBe(429);
  });

  it("200 quando la rimozione riesce", async () => {
    vi.mocked(togliEsercizio).mockResolvedValue(undefined);
    const r = await DELETE_ESERCIZI(richiesta({ esercizioId: "e1" }), { params });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(togliEsercizio).toHaveBeenCalledWith("cont1", "e1");
  });
});

describe("DELETE /api/esercizi/contenitori/[id]", () => {
  const richiesta = () => new Request("http://x/api/esercizi/contenitori/cont1", { method: "DELETE" });

  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await DELETE_CONTENITORE(richiesta(), { params })).status).toBe(401);
    expect(eliminaContenitore).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await DELETE_CONTENITORE(richiesta(), { params })).status).toBe(403);
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 6 });
    const r = await DELETE_CONTENITORE(richiesta(), { params });
    expect(r.status).toBe(429);
  });

  it("409 se una regola di batteria lo usa ancora", async () => {
    vi.mocked(eliminaContenitore).mockResolvedValue({ ok: false, motivo: "in_uso" });
    const r = await DELETE_CONTENITORE(richiesta(), { params });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "in_uso" });
  });

  it("200 quando la cancellazione riesce", async () => {
    vi.mocked(eliminaContenitore).mockResolvedValue({ ok: true });
    const r = await DELETE_CONTENITORE(richiesta(), { params });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(eliminaContenitore).toHaveBeenCalledWith("cont1");
  });
});
