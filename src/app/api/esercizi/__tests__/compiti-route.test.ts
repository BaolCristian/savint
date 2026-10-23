import { describe, it, expect, vi, beforeEach } from "vitest";

// Nuovo compito, Task 3: la rotta riceve i blocchi e delega ad
// `assegnaCompito`. Il vecchio corpo `{ batteriaId, classeId }` non è più
// accettato (il vecchio modulo dei compiti sparisce con il Task 7).
vi.mock("@/lib/auth/require-role", () => ({
  requireTeacher: vi.fn(),
}));
vi.mock("@/lib/esercizi/compiti", () => ({
  assegnaCompito: vi.fn(),
}));
vi.mock("@/lib/esercizi/classi", () => ({
  classiDelDocente: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireTeacher } from "@/lib/auth/require-role";
import { assegnaCompito } from "@/lib/esercizi/compiti";
import { classiDelDocente } from "@/lib/esercizi/classi";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { POST } from "@/app/api/esercizi/compiti/route";

const richiesta = (body: unknown) =>
  new Request("http://x/api/esercizi/compiti", { method: "POST", body: JSON.stringify(body) });

const corpoValido = {
  classeId: "c1",
  blocchi: [{ tipo: "argomento", argomento: "Equazioni", quanti: 3 }],
  modo: "CLASSE",
  seme: "s1",
  versioniViste: ["v1", "v2", "v3"],
};
const riepilogo = {
  blocchi: [{ etichetta: "Equazioni", richiesti: 3, disponibili: 2, nonDisponibili: [] }],
  duplicatiTolti: 0,
  totale: 3,
  sufficiente: false,
  esercizi: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente1" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(classiDelDocente).mockResolvedValue([{ id: "c1", name: "2A", yearLevel: 2, studenti: 3, codice: null }] as never);
  vi.mocked(assegnaCompito).mockResolvedValue({ ok: true, compitoId: "compito1" });
});

describe("POST /api/esercizi/compiti", () => {
  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST(richiesta(corpoValido))).status).toBe(401);
    expect(assegnaCompito).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato (studente)", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await POST(richiesta(corpoValido))).status).toBe(403);
    expect(assegnaCompito).not.toHaveBeenCalled();
  });

  it("400 con un corpo non valido, compreso il vecchio corpo { batteriaId, classeId }", async () => {
    for (const corpo of [
      { batteriaId: "b1", classeId: "c1" },
      { ...corpoValido, modo: "BOH" },
      { ...corpoValido, seme: "" },
      { ...corpoValido, salvaModello: { nome: "   " } },
    ]) {
      expect((await POST(richiesta(corpo))).status).toBe(400);
    }
    expect(assegnaCompito).not.toHaveBeenCalled();
  });

  it("429 quando il rate limit scatta, contato per docente", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 12 });
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("12");
    expect(checkRateLimit).toHaveBeenCalledWith(expect.objectContaining({ key: expect.stringContaining("docente1") }));
    expect(assegnaCompito).not.toHaveBeenCalled();
  });

  it("404, non 403, se la classe non è del docente", async () => {
    const r = await POST(richiesta({ ...corpoValido, classeId: "altrui" }));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "non_insegni_questa_classe" });
    expect(assegnaCompito).not.toHaveBeenCalled();
  });

  it("422 classe_senza_anno se un blocco argomento resta senza anno", async () => {
    vi.mocked(classiDelDocente).mockResolvedValue([{ id: "c1", name: "X", yearLevel: null, studenti: 0, codice: null }] as never);
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(422);
    expect(assegnaCompito).not.toHaveBeenCalled();
  });

  it("201 con il compitoId; inoltra tutto, con l'anno della classe e il docente della sessione", async () => {
    const corpo = {
      ...corpoValido,
      opensAt: "2026-11-10T00:00:00.000Z",
      dueAt: "2026-11-20T00:00:00.000Z",
      salvaModello: { nome: " Il mio modello " },
      modelloId: "m1",
    };
    const r = await POST(richiesta(corpo));
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ compitoId: "compito1" });
    expect(assegnaCompito).toHaveBeenCalledWith({
      classeId: "c1",
      teacherId: "docente1",
      blocchi: [{ tipo: "argomento", argomento: "Equazioni", anno: 2, quanti: 3 }],
      modo: "CLASSE",
      seme: "s1",
      versioniViste: ["v1", "v2", "v3"],
      opensAt: new Date("2026-11-10T00:00:00.000Z"),
      dueAt: new Date("2026-11-20T00:00:00.000Z"),
      salvaModello: { nome: "Il mio modello" },
      modelloId: "m1",
    });
  });

  it("409 estrazione_cambiata con il nuovo riepilogo nel corpo", async () => {
    vi.mocked(assegnaCompito).mockResolvedValue({ ok: false, motivo: "estrazione_cambiata", riepilogo } as never);
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "estrazione_cambiata", riepilogo });
  });

  it("409 esercizi_insufficienti con il riepilogo nel corpo", async () => {
    vi.mocked(assegnaCompito).mockResolvedValue({ ok: false, motivo: "esercizi_insufficienti", riepilogo } as never);
    const r = await POST(richiesta(corpoValido));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "esercizi_insufficienti", riepilogo });
  });

  it("gli altri rifiuti: 404 per classe e modello, 400 per date e blocchi", async () => {
    const casi: [string, number, unknown?][] = [
      ["classe_non_trovata", 404],
      ["non_insegni_questa_classe", 404],
      ["modello_non_trovato", 404],
      ["blocchi_non_validi", 400],
      ["date_non_valide", 400, "scadenza_nel_passato"],
    ];
    for (const [motivo, stato, dettaglio] of casi) {
      vi.mocked(assegnaCompito).mockResolvedValue({ ok: false, motivo, ...(dettaglio ? { dettaglio } : {}) } as never);
      const r = await POST(richiesta(corpoValido));
      expect(r.status).toBe(stato);
      expect(await r.json()).toEqual({ error: motivo, ...(dettaglio ? { dettaglio } : {}) });
    }
  });
});
