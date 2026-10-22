import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/require-role", () => ({
  requireTeacher: vi.fn(),
}));
vi.mock("@/lib/esercizi/condivisione", () => ({
  leggiCondivisione: vi.fn(),
  impostaCondivisione: vi.fn(),
  docentiDellaScuola: vi.fn(),
  trasferisciProprieta: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireTeacher } from "@/lib/auth/require-role";
import {
  leggiCondivisione, impostaCondivisione, docentiDellaScuola, trasferisciProprieta,
} from "@/lib/esercizi/condivisione";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { GET, PUT } from "@/app/api/esercizi/condivisione/route";
import { POST as POST_PROPRIETARIO } from "@/app/api/esercizi/condivisione/proprietario/route";
import { GET as GET_DOCENTI } from "@/app/api/esercizi/docenti/route";

// Come `utenteDaSessione` traduce le sessioni qui sotto.
const docente = { id: "docente1", admin: false };
const admin = { id: "admin1", admin: true };

function sessione(role: "TEACHER" | "ADMIN" = "TEACHER") {
  const id = role === "ADMIN" ? "admin1" : "docente1";
  vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id, role } } } as never);
}

const stato = { persone: [], scuola: null, indiretti: [], proprietarioNome: "Rossi" };

beforeEach(() => {
  vi.clearAllMocks();
  sessione();
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe("GET /api/esercizi/condivisione", () => {
  const get = (q: string) => GET(new NextRequest(`http://x/api/esercizi/condivisione?${q}`));

  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await get("tipo=esercizio&id=e1")).status).toBe(401);
  });

  it("400 con una query non valida", async () => {
    expect((await get("tipo=esercizio")).status).toBe(400);
    expect((await get("tipo=quiz&id=e1")).status).toBe(400);
    expect((await get("tipo=argomento")).status).toBe(400);
    expect(leggiCondivisione).not.toHaveBeenCalled();
  });

  it("200 con lo stato dell'esercizio", async () => {
    vi.mocked(leggiCondivisione).mockResolvedValue(stato);
    const r = await get("tipo=esercizio&id=e1");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(stato);
    expect(leggiCondivisione).toHaveBeenCalledWith({ tipo: "esercizio", id: "e1" }, docente);
  });

  it("argomento con ownerId", async () => {
    sessione("ADMIN");
    vi.mocked(leggiCondivisione).mockResolvedValue(stato);
    await get("tipo=argomento&argomento=Frazioni&ownerId=u9");
    expect(leggiCondivisione).toHaveBeenCalledWith({ tipo: "argomento", argomento: "Frazioni", ownerId: "u9" }, admin);
  });

  it("404 quando chi chiede non può condividere", async () => {
    vi.mocked(leggiCondivisione).mockResolvedValue(null);
    const r = await get("tipo=contenitore&id=c1");
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "non_trovato" });
  });
});

describe("PUT /api/esercizi/condivisione", () => {
  const put = (body: unknown) =>
    PUT(new Request("http://x/api/esercizi/condivisione", { method: "PUT", body: JSON.stringify(body) }));
  const corpo = {
    risorsa: { tipo: "esercizio", id: "e1" },
    persone: [{ userId: "u2", ruolo: "EDITOR" }],
    scuola: "VISUALIZZATORE",
  };

  it("400 con un corpo non valido", async () => {
    expect((await put({ ...corpo, scuola: "PROPRIETARIO" })).status).toBe(400);
    expect((await put({ ...corpo, persone: [{ userId: "u2", ruolo: "PROPRIETARIO" }] })).status).toBe(400);
    expect((await put({ persone: [], scuola: null })).status).toBe(400);
    expect(impostaCondivisione).not.toHaveBeenCalled();
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 5 });
    const r = await put(corpo);
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("5");
    expect(impostaCondivisione).not.toHaveBeenCalled();
  });

  it("200 e passa risorsa, chi e nuova condivisione", async () => {
    vi.mocked(impostaCondivisione).mockResolvedValue({ ok: true });
    const r = await put(corpo);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(impostaCondivisione).toHaveBeenCalledWith(
      { tipo: "esercizio", id: "e1" }, docente,
      { persone: [{ userId: "u2", ruolo: "EDITOR" }], scuola: "VISUALIZZATORE" },
    );
  });

  it("404 per chi non è proprietario (un EDITOR compreso)", async () => {
    vi.mocked(impostaCondivisione).mockResolvedValue({ ok: false, motivo: "non_trovato" });
    expect((await put(corpo)).status).toBe(404);
  });

  it("422 con un destinatario non valido", async () => {
    vi.mocked(impostaCondivisione).mockResolvedValue({ ok: false, motivo: "destinatario_non_valido" });
    const r = await put({ ...corpo, risorsa: { tipo: "argomento", argomento: "Frazioni" }, scuola: null });
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: "destinatario_non_valido" });
  });
});

describe("POST /api/esercizi/condivisione/proprietario", () => {
  const post = (body: unknown) =>
    POST_PROPRIETARIO(new Request("http://x/api/esercizi/condivisione/proprietario", { method: "POST", body: JSON.stringify(body) }));
  const corpo = { risorsa: { tipo: "esercizio", id: "e1" }, nuovoProprietarioId: "u3" };

  it("403 per un TEACHER", async () => {
    vi.mocked(trasferisciProprieta).mockResolvedValue({ ok: false, motivo: "non_permesso" });
    const r = await post(corpo);
    expect(r.status).toBe(403);
  });

  it("400 con un corpo non valido", async () => {
    sessione("ADMIN");
    expect((await post({ risorsa: { tipo: "argomento", id: "x" }, nuovoProprietarioId: "u3" })).status).toBe(400);
    expect(trasferisciProprieta).not.toHaveBeenCalled();
  });

  it("200 per l'ADMIN", async () => {
    sessione("ADMIN");
    vi.mocked(trasferisciProprieta).mockResolvedValue({ ok: true });
    const r = await post(corpo);
    expect(r.status).toBe(200);
    expect(trasferisciProprieta).toHaveBeenCalledWith({ tipo: "esercizio", id: "e1" }, "u3", admin);
  });

  it("404 e 422 dai motivi del dominio", async () => {
    sessione("ADMIN");
    vi.mocked(trasferisciProprieta).mockResolvedValue({ ok: false, motivo: "non_trovato" });
    expect((await post(corpo)).status).toBe(404);
    vi.mocked(trasferisciProprieta).mockResolvedValue({ ok: false, motivo: "destinatario_non_valido" });
    expect((await post(corpo)).status).toBe(422);
  });
});

describe("GET /api/esercizi/docenti", () => {
  it("elenca i docenti escluso chi chiede", async () => {
    vi.mocked(docentiDellaScuola).mockResolvedValue([{ id: "u2", nome: "Bianchi", email: "b@x.it" }]);
    const r = await GET_DOCENTI();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ docenti: [{ id: "u2", nome: "Bianchi", email: "b@x.it" }] });
    expect(docentiDellaScuola).toHaveBeenCalledWith("docente1");
  });

  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await GET_DOCENTI()).status).toBe(401);
  });
});
