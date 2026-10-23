import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({
  requireTeacher: vi.fn(),
}));
vi.mock("@/lib/esercizi/compiti", () => ({
  riepilogoPerModo: vi.fn(),
}));
vi.mock("@/lib/esercizi/classi", () => ({
  classiDelDocente: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireTeacher } from "@/lib/auth/require-role";
import { riepilogoPerModo } from "@/lib/esercizi/compiti";
import { classiDelDocente } from "@/lib/esercizi/classi";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { POST } from "@/app/api/esercizi/compiti/estrai/route";

const richiesta = (body: unknown) =>
  new Request("http://x/api/esercizi/compiti/estrai", { method: "POST", body: JSON.stringify(body) });

const corpoValido = {
  classeId: "c1",
  blocchi: [
    { tipo: "argomento", argomento: "Equazioni", quanti: 3 },
    { tipo: "scelti", esercizioIds: ["e1", "e2"] },
  ],
  seme: "s1",
};
const riepilogo = { blocchi: [], duplicatiTolti: 0, totale: 5, sufficiente: true, esercizi: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente1" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(classiDelDocente).mockResolvedValue([{ id: "c1", name: "2A", yearLevel: 2, studenti: 3, codice: null }] as never);
  vi.mocked(riepilogoPerModo).mockResolvedValue({ riepilogo } as never);
});

describe("POST /api/esercizi/compiti/estrai", () => {
  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST(richiesta(corpoValido))).status).toBe(401);
    expect(riepilogoPerModo).not.toHaveBeenCalled();
  });

  it("400 con un corpo non valido (blocco di tipo sconosciuto, quanti zero, seme mancante)", async () => {
    for (const corpo of [
      { ...corpoValido, blocchi: [{ tipo: "boh" }] },
      { ...corpoValido, blocchi: [{ tipo: "argomento", argomento: "X", quanti: 0 }] },
      { classeId: "c1", blocchi: [] },
    ]) {
      expect((await POST(richiesta(corpo))).status).toBe(400);
    }
    expect(riepilogoPerModo).not.toHaveBeenCalled();
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 7 });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("7");
  });

  it("404 se la classe non è del docente", async () => {
    const r = await POST(richiesta({ ...corpoValido, classeId: "altrui" }));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "non_insegni_questa_classe" });
    expect(riepilogoPerModo).not.toHaveBeenCalled();
  });

  it("200 con il riepilogo; l'anno mancante viene dalla classe, come docente della sessione", async () => {
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(riepilogo);
    expect(riepilogoPerModo).toHaveBeenCalledWith(
      [
        { tipo: "argomento", argomento: "Equazioni", anno: 2, quanti: 3 },
        { tipo: "scelti", esercizioIds: ["e1", "e2"] },
      ],
      { id: "docente1", admin: false },
      "s1",
      "CLASSE",
    );
  });

  it("modo STUDENTE: il riepilogo del caso peggiore sui bacini congelati, quello che l'assegnazione userà", async () => {
    const studente = { ...riepilogo, sufficiente: false };
    vi.mocked(riepilogoPerModo).mockResolvedValue({ riepilogo: studente, bacini: [{ count: 3, versionIds: ["v1"] }] } as never);
    const r = await POST(richiesta({ ...corpoValido, modo: "STUDENTE" }));
    expect(r.status).toBe(200);
    // Solo il riepilogo: i bacini congelati (id versione) non escono dalla rotta.
    expect(await r.json()).toEqual(studente);
    expect(vi.mocked(riepilogoPerModo).mock.calls[0]![3]).toBe("STUDENTE");
  });

  it("400 con un modo sconosciuto", async () => {
    expect((await POST(richiesta({ ...corpoValido, modo: "TUTTI" }))).status).toBe(400);
    expect(riepilogoPerModo).not.toHaveBeenCalled();
  });

  it("422 classe_senza_anno se la classe non ha anno e il blocco nemmeno", async () => {
    vi.mocked(classiDelDocente).mockResolvedValue([{ id: "c1", name: "X", yearLevel: null, studenti: 0, codice: null }] as never);
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: "classe_senza_anno" });
  });
});
