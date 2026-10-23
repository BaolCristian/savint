import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({
  requireTeacher: vi.fn(),
}));
// Solo le due funzioni che leggono e scrivono il database: lo schema zod e
// le costanti restano quelli veri, così il 400 lo decide lo schema reale.
vi.mock("@/lib/esercizi/misure-pdp", async (originale) => ({
  ...(await originale<typeof import("@/lib/esercizi/misure-pdp")>()),
  misureDellaClasse: vi.fn(),
  salvaMisurePdp: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireTeacher } from "@/lib/auth/require-role";
import { misureDellaClasse, salvaMisurePdp } from "@/lib/esercizi/misure-pdp";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { GET, PUT } from "@/app/api/esercizi/classi/[id]/misure-pdp/route";

const params = Promise.resolve({ id: "c1" });
const URL_ROTTA = "http://x/api/esercizi/classi/c1/misure-pdp";
const get = () => new Request(URL_ROTTA);
const put = (corpo: unknown) =>
  new Request(URL_ROTTA, { method: "PUT", body: typeof corpo === "string" ? corpo : JSON.stringify(corpo) });

const MISURE = { tempoExtraPct: 30, menoEsercizi: false, calcolatrice: true, formulario: false };

beforeEach(() => {
  vi.mocked(misureDellaClasse).mockReset();
  vi.mocked(salvaMisurePdp).mockReset();
  vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente1", role: "TEACHER" } } } as never);
  vi.mocked(checkRateLimit).mockReset().mockResolvedValue({ allowed: true });
});

describe("GET /api/esercizi/classi/[id]/misure-pdp", () => {
  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await GET(get(), { params })).status).toBe(401);
    expect(misureDellaClasse).not.toHaveBeenCalled();
  });

  it("429 quando il rate limit scatta, con la chiave della rotta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 7 });
    const r = await GET(get(), { params });
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("7");
    expect(checkRateLimit).toHaveBeenCalledWith({ key: "esercizi:misure-pdp:docente1", windowSeconds: 60, max: 60 });
    expect(misureDellaClasse).not.toHaveBeenCalled();
  });

  // Mai 403: direbbe a un docente qualunque che quella classe esiste.
  it("404 per una classe che non è sua", async () => {
    vi.mocked(misureDellaClasse).mockResolvedValue(null);
    const r = await GET(get(), { params });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "non_trovata" });
  });

  it("200 con la mappa studente → misure, letta come chi chiede", async () => {
    vi.mocked(misureDellaClasse).mockResolvedValue(new Map([["s1", MISURE]]));
    const r = await GET(get(), { params });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ misure: { s1: MISURE } });
    expect(misureDellaClasse).toHaveBeenCalledWith("c1", { id: "docente1", admin: false });
  });
});

describe("PUT /api/esercizi/classi/[id]/misure-pdp", () => {
  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await PUT(put({ studentId: "s1", misure: MISURE }), { params })).status).toBe(401);
    expect(salvaMisurePdp).not.toHaveBeenCalled();
  });

  it("400 per un corpo non valido", async () => {
    for (const corpo of [
      "non json",
      { misure: MISURE },
      { studentId: "s1" },
      { studentId: "s1", misure: { ...MISURE, tempoExtraPct: 101 } },
      { studentId: "s1", misure: { ...MISURE, calcolatrice: "si" } },
    ]) {
      const r = await PUT(put(corpo), { params });
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "invalid_body" });
    }
    expect(salvaMisurePdp).not.toHaveBeenCalled();
  });

  it("404 per una classe che non è sua", async () => {
    vi.mocked(salvaMisurePdp).mockResolvedValue({ ok: false, motivo: "non_trovata" });
    const r = await PUT(put({ studentId: "s1", misure: MISURE }), { params });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "non_trovata" });
  });

  it("404 per uno studente non iscritto alla classe", async () => {
    vi.mocked(salvaMisurePdp).mockResolvedValue({ ok: false, motivo: "non_iscritto" });
    const r = await PUT(put({ studentId: "s9", misure: MISURE }), { params });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "non_iscritto" });
  });

  it("200 quando il salvataggio riesce, come chi chiede (ADMIN compreso)", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "adm1", role: "ADMIN" } } } as never);
    vi.mocked(salvaMisurePdp).mockResolvedValue({ ok: true });
    const r = await PUT(put({ studentId: "s1", misure: MISURE }), { params });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(salvaMisurePdp).toHaveBeenCalledWith("c1", "s1", { id: "adm1", admin: true }, MISURE);
  });
});
