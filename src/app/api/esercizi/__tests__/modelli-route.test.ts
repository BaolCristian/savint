import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({
  requireTeacher: vi.fn(),
}));
vi.mock("@/lib/esercizi/batterie", () => ({
  eliminaModello: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireTeacher } from "@/lib/auth/require-role";
import { eliminaModello } from "@/lib/esercizi/batterie";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { DELETE } from "@/app/api/esercizi/modelli/[id]/route";

const params = Promise.resolve({ id: "mod1" });
const richiesta = () => new Request("http://x/api/esercizi/modelli/mod1", { method: "DELETE" });

beforeEach(() => {
  vi.mocked(eliminaModello).mockReset();
  vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente1", role: "TEACHER" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe("DELETE /api/esercizi/modelli/[id]", () => {
  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await DELETE(richiesta(), { params })).status).toBe(401);
    expect(eliminaModello).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await DELETE(richiesta(), { params })).status).toBe(403);
    expect(eliminaModello).not.toHaveBeenCalled();
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 7 });
    const r = await DELETE(richiesta(), { params });
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("7");
    expect(eliminaModello).not.toHaveBeenCalled();
  });

  // Decisioni, punto 1: per chi non l'ha creato (e non è ADMIN) la rotta
  // risponde 404, come per un modello che non esiste.
  it("404 se il modello non c'è o non è di chi chiede", async () => {
    vi.mocked(eliminaModello).mockResolvedValue({ ok: false, motivo: "non_trovato" });
    const r = await DELETE(richiesta(), { params });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "non_trovato" });
  });

  it("200 quando l'eliminazione riesce, con chi chiede come utente", async () => {
    vi.mocked(eliminaModello).mockResolvedValue({ ok: true });
    const r = await DELETE(richiesta(), { params });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(eliminaModello).toHaveBeenCalledWith("mod1", { id: "docente1", admin: false });
  });

  it("un ADMIN passa come admin", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "adm1", role: "ADMIN" } } } as never);
    vi.mocked(eliminaModello).mockResolvedValue({ ok: true });
    await DELETE(richiesta(), { params });
    expect(eliminaModello).toHaveBeenCalledWith("mod1", { id: "adm1", admin: true });
  });
});
