import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({
  requireTeacher: vi.fn(),
}));
vi.mock("@/lib/esercizi/compiti", () => ({
  modificaDateCompito: vi.fn(),
  ritiraCompito: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireTeacher } from "@/lib/auth/require-role";
import { modificaDateCompito, ritiraCompito } from "@/lib/esercizi/compiti";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { PATCH, DELETE } from "@/app/api/esercizi/compiti/[id]/route";

const ctx = (id = "comp1") => ({ params: Promise.resolve({ id }) });
const patch = (body: unknown) =>
  new Request("http://x/api/esercizi/compiti/comp1", { method: "PATCH", body: JSON.stringify(body) });
const del = () => new Request("http://x/api/esercizi/compiti/comp1", { method: "DELETE" });

const corpoValido = { opensAt: null, dueAt: "2099-01-10T00:00:00.000Z" };

beforeEach(() => {
  vi.mocked(requireTeacher).mockReset().mockResolvedValue({ ok: true, session: { user: { id: "docente1" } } } as never);
  vi.mocked(checkRateLimit).mockReset().mockResolvedValue({ allowed: true });
  vi.mocked(modificaDateCompito).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(ritiraCompito).mockReset().mockResolvedValue({ ok: true });
});

describe("PATCH /api/esercizi/compiti/[id] (cambia le date)", () => {
  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await PATCH(patch(corpoValido), ctx())).status).toBe(401);
    expect(modificaDateCompito).not.toHaveBeenCalled();
  });

  it("429 quando il rate limit scatta, prima di toccare il dominio", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 7 });
    const r = await PATCH(patch(corpoValido), ctx());
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("7");
    expect(modificaDateCompito).not.toHaveBeenCalled();
  });

  it("il tetto è contato per docente", async () => {
    await PATCH(patch(corpoValido), ctx());
    expect(checkRateLimit).toHaveBeenCalledWith(expect.objectContaining({ key: expect.stringContaining("docente1") }));
  });

  it("400 con un corpo non valido", async () => {
    expect((await PATCH(patch({ dueAt: "non una data", opensAt: null }), ctx())).status).toBe(400);
    expect(modificaDateCompito).not.toHaveBeenCalled();
  });

  // Entrambe le chiavi sono obbligatorie: `null` toglie la data, una chiave
  // assente invece sarebbe ambigua (lasciala com'è? toglila?).
  it("400 se manca una delle due date", async () => {
    expect((await PATCH(patch({ dueAt: "2099-01-10T00:00:00.000Z" }), ctx())).status).toBe(400);
    expect(modificaDateCompito).not.toHaveBeenCalled();
  });

  it("400 col motivo quando la scadenza è prima dell'apertura", async () => {
    vi.mocked(modificaDateCompito).mockResolvedValue({ ok: false, motivo: "scadenza_prima_apertura" });
    const r = await PATCH(patch(corpoValido), ctx());
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "scadenza_prima_apertura" });
  });

  it("400 col motivo quando la scadenza è nel passato", async () => {
    vi.mocked(modificaDateCompito).mockResolvedValue({ ok: false, motivo: "scadenza_nel_passato" });
    const r = await PATCH(patch(corpoValido), ctx());
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "scadenza_nel_passato" });
  });

  it("404, non 403, per chi non ha titolo (o un compito inesistente o ritirato)", async () => {
    vi.mocked(modificaDateCompito).mockResolvedValue({ ok: false, motivo: "compito_non_trovato" });
    const r = await PATCH(patch(corpoValido), ctx());
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "compito_non_trovato" });
  });

  it("200 e inoltra al dominio l'id, il docente della sessione e le date come Date/null", async () => {
    const r = await PATCH(patch(corpoValido), ctx("comp9"));
    expect(r.status).toBe(200);
    expect(modificaDateCompito).toHaveBeenCalledWith("comp9", "docente1", {
      opensAt: null,
      dueAt: new Date("2099-01-10T00:00:00.000Z"),
    });
  });
});

describe("DELETE /api/esercizi/compiti/[id] (ritira)", () => {
  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await DELETE(del(), ctx())).status).toBe(401);
    expect(ritiraCompito).not.toHaveBeenCalled();
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 3 });
    const r = await DELETE(del(), ctx());
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("3");
    expect(ritiraCompito).not.toHaveBeenCalled();
  });

  it("404, non 403, per chi non ha titolo", async () => {
    vi.mocked(ritiraCompito).mockResolvedValue({ ok: false, motivo: "compito_non_trovato" });
    const r = await DELETE(del(), ctx());
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "compito_non_trovato" });
  });

  it("200 e passa al dominio l'id e il docente della sessione", async () => {
    const r = await DELETE(del(), ctx("comp7"));
    expect(r.status).toBe(200);
    expect(ritiraCompito).toHaveBeenCalledWith("comp7", "docente1");
  });
});
