import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({
  requireTeacher: vi.fn(),
}));
vi.mock("@/lib/esercizi/batterie", () => ({
  creaBatteria: vi.fn(),
  eliminaBatteria: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireTeacher } from "@/lib/auth/require-role";
import { creaBatteria, eliminaBatteria } from "@/lib/esercizi/batterie";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { POST } from "@/app/api/esercizi/batterie/route";
import { DELETE } from "@/app/api/esercizi/batterie/[id]/route";

const params = Promise.resolve({ id: "batt1" });

beforeEach(() => {
  vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente1" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe("POST /api/esercizi/batterie", () => {
  const corpoValido = { name: "Batteria 1", regole: [{ contenitoreId: "cont1", count: 5 }] };
  const richiesta = (body: unknown) =>
    new Request("http://x/api/esercizi/batterie", { method: "POST", body: JSON.stringify(body) });

  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST(richiesta(corpoValido))).status).toBe(401);
    expect(creaBatteria).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await POST(richiesta(corpoValido))).status).toBe(403);
  });

  it("400 se manca name", async () => {
    const r = await POST(richiesta({ regole: corpoValido.regole }));
    expect(r.status).toBe(400);
    expect(creaBatteria).not.toHaveBeenCalled();
  });

  it("400 se regole e' vuoto", async () => {
    const r = await POST(richiesta({ name: "Batteria 1", regole: [] }));
    expect(r.status).toBe(400);
  });

  it("400 se una regola ha count non positivo", async () => {
    const r = await POST(richiesta({ name: "Batteria 1", regole: [{ contenitoreId: "cont1", count: 0 }] }));
    expect(r.status).toBe(400);
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 9 });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("9");
  });

  it("201 con l'id della batteria creata", async () => {
    vi.mocked(creaBatteria).mockResolvedValue({ ok: true, id: "batt1" });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ id: "batt1" });
    expect(creaBatteria).toHaveBeenCalledWith("docente1", "Batteria 1", corpoValido.regole, undefined);
  });

  it("inoltra la description quando presente", async () => {
    vi.mocked(creaBatteria).mockResolvedValue({ ok: true, id: "batt1" });
    await POST(richiesta({ ...corpoValido, description: "prime prove" }));
    expect(creaBatteria).toHaveBeenCalledWith("docente1", "Batteria 1", corpoValido.regole, "prime prove");
  });

  // Fix round finale, item 5: un contenitore inesistente in una regola è un
  // rifiuto del dominio (`contenitore_non_trovato`), non un errore che
  // arriva alla rotta senza forma — deve diventare un 4xx col motivo, mai un
  // 500.
  it("404 quando una regola nomina un contenitore inesistente", async () => {
    vi.mocked(creaBatteria).mockResolvedValue({
      ok: false, motivo: "contenitore_non_trovato", dettaglio: { contenitoreId: "cont1" },
    });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "contenitore_non_trovato", dettaglio: { contenitoreId: "cont1" } });
  });
});

describe("DELETE /api/esercizi/batterie/[id]", () => {
  const richiesta = () => new Request("http://x/api/esercizi/batterie/batt1", { method: "DELETE" });

  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await DELETE(richiesta(), { params })).status).toBe(401);
    expect(eliminaBatteria).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await DELETE(richiesta(), { params })).status).toBe(403);
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 7 });
    const r = await DELETE(richiesta(), { params });
    expect(r.status).toBe(429);
  });

  it("409 se ha gia' dei compiti assegnati", async () => {
    vi.mocked(eliminaBatteria).mockResolvedValue({ ok: false, motivo: "in_uso" });
    const r = await DELETE(richiesta(), { params });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "in_uso" });
  });

  it("200 quando la cancellazione riesce", async () => {
    vi.mocked(eliminaBatteria).mockResolvedValue({ ok: true });
    const r = await DELETE(richiesta(), { params });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(eliminaBatteria).toHaveBeenCalledWith("batt1");
  });
});
