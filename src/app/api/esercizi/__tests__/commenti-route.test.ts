import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({ requireTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/commenti", () => ({
  elencoCommenti: vi.fn(),
  scriviCommento: vi.fn(),
  risolviCommento: vi.fn(),
  eliminaCommento: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));

import { requireTeacher } from "@/lib/auth/require-role";
import { elencoCommenti, scriviCommento, risolviCommento, eliminaCommento } from "@/lib/esercizi/commenti";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { GET, POST } from "@/app/api/esercizi/redazione/[id]/commenti/route";
import { PATCH, DELETE } from "@/app/api/esercizi/commenti/[id]/route";

const docente = { id: "docente1", admin: false };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (corpo: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(corpo) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente1", role: "TEACHER" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe("GET/POST /api/esercizi/redazione/[id]/commenti", () => {
  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await GET(new Request("http://x"), params("e1"))).status).toBe(401);
  });

  it("GET: 404 se l'esercizio non si vede, altrimenti l'elenco", async () => {
    vi.mocked(elencoCommenti).mockResolvedValueOnce(null);
    expect((await GET(new Request("http://x"), params("e1"))).status).toBe(404);
    vi.mocked(elencoCommenti).mockResolvedValueOnce([]);
    const r = await GET(new Request("http://x"), params("e1"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ commenti: [] });
    expect(elencoCommenti).toHaveBeenLastCalledWith("e1", docente);
  });

  it("POST: 201 con l'id; gli esiti del dominio diventano 404/403/422", async () => {
    vi.mocked(scriviCommento).mockResolvedValueOnce({ ok: true, id: "c1" });
    const r = await POST(json({ testo: "ciao", parentId: "p1" }), params("e1"));
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ id: "c1" });
    expect(scriviCommento).toHaveBeenCalledWith("e1", docente, "ciao", "p1");
    for (const [motivo, status] of [["non_trovato", 404], ["non_permesso", 403], ["testo_non_valido", 422]] as const) {
      vi.mocked(scriviCommento).mockResolvedValueOnce({ ok: false, motivo });
      expect((await POST(json({ testo: "x" }), params("e1"))).status).toBe(status);
    }
  });

  it("POST: 400 su corpo non valido, 429 oltre il limite", async () => {
    expect((await POST(json({ testo: 3 }), params("e1"))).status).toBe(400);
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 5 });
    expect((await POST(json({ testo: "x" }), params("e1"))).status).toBe(429);
    expect(scriviCommento).not.toHaveBeenCalled();
  });
});

describe("PATCH/DELETE /api/esercizi/commenti/[id]", () => {
  it("PATCH risolve; 404/403 dal dominio; 400 senza booleano", async () => {
    vi.mocked(risolviCommento).mockResolvedValueOnce({ ok: true });
    expect((await PATCH(json({ risolto: true }), params("c1"))).status).toBe(200);
    expect(risolviCommento).toHaveBeenCalledWith("c1", docente, true);
    vi.mocked(risolviCommento).mockResolvedValueOnce({ ok: false, motivo: "non_trovato" });
    expect((await PATCH(json({ risolto: false }), params("c1"))).status).toBe(404);
    vi.mocked(risolviCommento).mockResolvedValueOnce({ ok: false, motivo: "non_permesso" });
    expect((await PATCH(json({ risolto: false }), params("c1"))).status).toBe(403);
    expect((await PATCH(json({ risolto: "si" }), params("c1"))).status).toBe(400);
  });

  it("DELETE elimina; 404 se non si vede; 429 oltre il limite", async () => {
    vi.mocked(eliminaCommento).mockResolvedValueOnce({ ok: true });
    expect((await DELETE(new Request("http://x"), params("c1"))).status).toBe(200);
    vi.mocked(eliminaCommento).mockResolvedValueOnce({ ok: false, motivo: "non_trovato" });
    expect((await DELETE(new Request("http://x"), params("c1"))).status).toBe(404);
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false });
    expect((await DELETE(new Request("http://x"), params("c1"))).status).toBe(429);
  });
});
