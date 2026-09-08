import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({
  requireTeacher: vi.fn(),
  requireStudent: vi.fn(),
}));
vi.mock("@/lib/esercizi/classi", () => ({
  creaClasse: vi.fn(),
  rigeneraCodice: vi.fn(),
  iscrivitiConCodice: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireTeacher, requireStudent } from "@/lib/auth/require-role";
import { creaClasse, rigeneraCodice, iscrivitiConCodice } from "@/lib/esercizi/classi";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { POST as POST_CREA } from "@/app/api/esercizi/classi/route";
import { POST as POST_CODICE } from "@/app/api/esercizi/classi/[id]/codice/route";
import { POST as POST_ISCRIZIONE } from "@/app/api/esercizi/classi/iscrizione/route";

const params = Promise.resolve({ id: "classe1" });

beforeEach(() => {
  vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente1" } } } as never);
  vi.mocked(requireStudent).mockResolvedValue({ ok: true, session: { user: { id: "studente1" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe("POST /api/esercizi/classi", () => {
  const richiesta = (body: unknown) =>
    new Request("http://x/api/esercizi/classi", { method: "POST", body: JSON.stringify(body) });
  const corpoValido = { nome: "2A", anno: 2 };

  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST_CREA(richiesta(corpoValido))).status).toBe(401);
    expect(creaClasse).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato (studente)", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await POST_CREA(richiesta(corpoValido))).status).toBe(403);
    expect(creaClasse).not.toHaveBeenCalled();
  });

  it("400 con un corpo non valido (nome mancante)", async () => {
    const r = await POST_CREA(richiesta({ anno: 2 }));
    expect(r.status).toBe(400);
    expect(creaClasse).not.toHaveBeenCalled();
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 8 });
    const r = await POST_CREA(richiesta(corpoValido));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("8");
    expect(creaClasse).not.toHaveBeenCalled();
  });

  it("409 se il nome e' gia' usato", async () => {
    vi.mocked(creaClasse).mockResolvedValue({ ok: false, motivo: "nome_gia_usato" });
    const r = await POST_CREA(richiesta(corpoValido));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "nome_gia_usato" });
  });

  it("201 con la classe creata (id, nome, codice)", async () => {
    vi.mocked(creaClasse).mockResolvedValue({ ok: true, classe: { id: "c1", nome: "2A", codice: "ABCDEF" } });
    const r = await POST_CREA(richiesta(corpoValido));
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ classe: { id: "c1", nome: "2A", codice: "ABCDEF" } });
  });

  it("accetta anno nullo", async () => {
    vi.mocked(creaClasse).mockResolvedValue({ ok: true, classe: { id: "c1", nome: "Libera", codice: "ABCDEF" } });
    await POST_CREA(richiesta({ nome: "Libera", anno: null }));
    expect(creaClasse).toHaveBeenCalledWith("docente1", { nome: "Libera", anno: null });
  });

  it("tratta anno assente come null, non come corpo invalido", async () => {
    vi.mocked(creaClasse).mockResolvedValue({ ok: true, classe: { id: "c1", nome: "Libera", codice: "ABCDEF" } });
    const r = await POST_CREA(richiesta({ nome: "Libera" }));
    expect(r.status).toBe(201);
    expect(creaClasse).toHaveBeenCalledWith("docente1", { nome: "Libera", anno: null });
  });

  it("passa il docente della sessione, non uno arbitrario", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente-vero" } } } as never);
    vi.mocked(creaClasse).mockResolvedValue({ ok: true, classe: { id: "c1", nome: "2A", codice: "ABCDEF" } });
    await POST_CREA(richiesta(corpoValido));
    expect(creaClasse).toHaveBeenCalledWith("docente-vero", { nome: "2A", anno: 2 });
  });

  it("il tetto e' per docente, con una chiave propria", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente-vero" } } } as never);
    vi.mocked(creaClasse).mockResolvedValue({ ok: true, classe: { id: "c1", nome: "2A", codice: "ABCDEF" } });
    await POST_CREA(richiesta(corpoValido));
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "esercizi:classi:docente-vero" }),
    );
  });
});

describe("POST /api/esercizi/classi/[id]/codice", () => {
  const richiesta = () =>
    new Request("http://x/api/esercizi/classi/classe1/codice", { method: "POST" });

  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST_CODICE(richiesta(), { params })).status).toBe(401);
    expect(rigeneraCodice).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato (studente)", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await POST_CODICE(richiesta(), { params })).status).toBe(403);
    expect(rigeneraCodice).not.toHaveBeenCalled();
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 15 });
    const r = await POST_CODICE(richiesta(), { params });
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("15");
    expect(rigeneraCodice).not.toHaveBeenCalled();
  });

  it("404 se la classe non esiste", async () => {
    vi.mocked(rigeneraCodice).mockResolvedValue({ ok: false, motivo: "non_trovata" });
    const r = await POST_CODICE(richiesta(), { params });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "non_trovata" });
  });

  // Il punto piu' delicato del brief: un docente che non insegna quella
  // classe riceve 404, non 403 — un 403 confermerebbe che la classe esiste,
  // stessa ragione della pagina delle consegne (compiti/[id]/page.tsx).
  it("404 (non 403) se il docente non insegna quella classe", async () => {
    vi.mocked(rigeneraCodice).mockResolvedValue({ ok: false, motivo: "non_insegni_questa_classe" });
    const r = await POST_CODICE(richiesta(), { params });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "non_insegni_questa_classe" });
  });

  it("200 con il nuovo codice", async () => {
    vi.mocked(rigeneraCodice).mockResolvedValue({ ok: true, codice: "ZYXWVU" });
    const r = await POST_CODICE(richiesta(), { params });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ codice: "ZYXWVU" });
  });

  it("passa l'id della classe e il docente della sessione, non uno arbitrario", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente-vero" } } } as never);
    vi.mocked(rigeneraCodice).mockResolvedValue({ ok: true, codice: "ZYXWVU" });
    await POST_CODICE(richiesta(), { params });
    expect(rigeneraCodice).toHaveBeenCalledWith("classe1", "docente-vero");
  });

  it("il tetto e' per docente, con una chiave propria (diversa dalla creazione)", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente-vero" } } } as never);
    vi.mocked(rigeneraCodice).mockResolvedValue({ ok: true, codice: "ZYXWVU" });
    await POST_CODICE(richiesta(), { params });
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "esercizi:classi-codice:docente-vero" }),
    );
  });
});

// La rotta che iscrive uno studente con un codice: a differenza delle due
// sopra, sta dietro requireStudent, non requireTeacher — e' l'unica delle
// quattro rotte del task che appartiene allo studente, non al docente.
describe("POST /api/esercizi/classi/iscrizione", () => {
  const richiesta = (body: unknown) =>
    new Request("http://x/api/esercizi/classi/iscrizione", { method: "POST", body: JSON.stringify(body) });
  const corpoValido = { codice: "ABCDEF" };

  it("401 se non autenticato", async () => {
    vi.mocked(requireStudent).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST_ISCRIZIONE(richiesta(corpoValido))).status).toBe(401);
    expect(iscrivitiConCodice).not.toHaveBeenCalled();
  });

  // Il verso che questa rotta deve avere ribaltato rispetto alle altre due:
  // qui e' un DOCENTE a dover essere respinto con 403, uno STUDENTE a dover
  // passare.
  it("403 per ruolo sbagliato (docente)", async () => {
    vi.mocked(requireStudent).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await POST_ISCRIZIONE(richiesta(corpoValido))).status).toBe(403);
    expect(iscrivitiConCodice).not.toHaveBeenCalled();
  });

  it("400 con un corpo non valido (codice mancante)", async () => {
    const r = await POST_ISCRIZIONE(richiesta({}));
    expect(r.status).toBe(400);
    expect(iscrivitiConCodice).not.toHaveBeenCalled();
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 20 });
    const r = await POST_ISCRIZIONE(richiesta(corpoValido));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("20");
    expect(iscrivitiConCodice).not.toHaveBeenCalled();
  });

  it("404 se il codice e' sconosciuto", async () => {
    vi.mocked(iscrivitiConCodice).mockResolvedValue({ ok: false, motivo: "codice_sconosciuto" });
    const r = await POST_ISCRIZIONE(richiesta(corpoValido));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "codice_sconosciuto" });
  });

  // La fuga d'informazione che il brief vieta esplicitamente: il dominio
  // appiattisce gia' "codice mai esistito" e "codice di una classe
  // archiviata" sullo stesso motivo `codice_sconosciuto` (vedi classi.ts e
  // classi.test.ts, task 2). Qui si prova che la rotta non aggiunge NIENTE
  // sopra a quel motivo — nessun id, nessun nome di classe, nessun indizio
  // che permetterebbe a chi prova codici a caso di distinguere un codice
  // mai esistito da uno che punta a una classe reale. Il corpo della
  // risposta e' esattamente { error: "codice_sconosciuto" }, non un
  // sottoinsieme: qualunque campo in piu' sarebbe gia' una fuga.
  it("il rifiuto per codice sconosciuto non porta nessuna informazione oltre al motivo", async () => {
    vi.mocked(iscrivitiConCodice).mockResolvedValue({ ok: false, motivo: "codice_sconosciuto" });
    const r = await POST_ISCRIZIONE(richiesta(corpoValido));
    const corpo = await r.json();
    expect(Object.keys(corpo)).toEqual(["error"]);
  });

  it("409 se lo studente e' gia' iscritto", async () => {
    vi.mocked(iscrivitiConCodice).mockResolvedValue({ ok: false, motivo: "gia_iscritto" });
    const r = await POST_ISCRIZIONE(richiesta(corpoValido));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "gia_iscritto" });
  });

  it("201 con la classe a cui si e' iscritto", async () => {
    vi.mocked(iscrivitiConCodice).mockResolvedValue({ ok: true, classe: { id: "c1", nome: "2A" } });
    const r = await POST_ISCRIZIONE(richiesta(corpoValido));
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ classe: { id: "c1", nome: "2A" } });
  });

  it("passa lo studente della sessione, non uno arbitrario", async () => {
    vi.mocked(requireStudent).mockResolvedValue({ ok: true, session: { user: { id: "studente-vero" } } } as never);
    vi.mocked(iscrivitiConCodice).mockResolvedValue({ ok: true, classe: { id: "c1", nome: "2A" } });
    await POST_ISCRIZIONE(richiesta(corpoValido));
    expect(iscrivitiConCodice).toHaveBeenCalledWith("studente-vero", "ABCDEF");
  });

  it("il tetto e' per studente, con una chiave propria", async () => {
    vi.mocked(requireStudent).mockResolvedValue({ ok: true, session: { user: { id: "studente-vero" } } } as never);
    vi.mocked(iscrivitiConCodice).mockResolvedValue({ ok: true, classe: { id: "c1", nome: "2A" } });
    await POST_ISCRIZIONE(richiesta(corpoValido));
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "esercizi:classi-iscrizione:studente-vero" }),
    );
  });
});
