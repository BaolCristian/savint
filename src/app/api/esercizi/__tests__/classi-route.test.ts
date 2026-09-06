import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({
  requireTeacher: vi.fn(),
}));
vi.mock("@/lib/esercizi/classi", () => ({
  dichiaraInsegnamento: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireTeacher } from "@/lib/auth/require-role";
import { dichiaraInsegnamento } from "@/lib/esercizi/classi";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { POST } from "@/app/api/esercizi/classi/insegnate/route";

const richiesta = (body: unknown) =>
  new Request("http://x/api/esercizi/classi/insegnate", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente1" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(dichiaraInsegnamento).mockResolvedValue(undefined);
});

describe("POST /api/esercizi/classi/insegnate", () => {
  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST(richiesta({ classeIds: ["c1"] }))).status).toBe(401);
    expect(dichiaraInsegnamento).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await POST(richiesta({ classeIds: ["c1"] }))).status).toBe(403);
    expect(dichiaraInsegnamento).not.toHaveBeenCalled();
  });

  it("400 con un corpo non valido (classeIds non e' un array di stringhe)", async () => {
    const r = await POST(richiesta({ classeIds: [42] }));
    expect(r.status).toBe(400);
    expect(dichiaraInsegnamento).not.toHaveBeenCalled();
  });

  it("400 se manca classeIds", async () => {
    const r = await POST(richiesta({}));
    expect(r.status).toBe(400);
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 5 });
    const r = await POST(richiesta({ classeIds: ["c1"] }));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("5");
    expect(dichiaraInsegnamento).not.toHaveBeenCalled();
  });

  it("200 e inoltra il docente della sessione con l'elenco di classi", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente-vero" } } } as never);
    const r = await POST(richiesta({ classeIds: ["c1", "c2"] }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(dichiaraInsegnamento).toHaveBeenCalledWith("docente-vero", ["c1", "c2"]);
  });

  it("accetta un elenco vuoto (il docente non insegna piu' nessuna classe)", async () => {
    const r = await POST(richiesta({ classeIds: [] }));
    expect(r.status).toBe(200);
    expect(dichiaraInsegnamento).toHaveBeenCalledWith("docente1", []);
  });
});
