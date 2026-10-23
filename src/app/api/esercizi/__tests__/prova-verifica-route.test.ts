import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({ requireStudent: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));
// Solo le funzioni che leggono e scrivono il database: tipi e costanti restano veri.
vi.mock("@/lib/esercizi/prova-verifica", async (originale) => ({
  ...(await originale<typeof import("@/lib/esercizi/prova-verifica")>()),
  entraNellaProva: vi.fn(),
  tempoProva: vi.fn(),
  salvaRisposta: vi.fn(),
  consegnaProva: vi.fn(),
  registraEventi: vi.fn(),
  puoVedereFormulario: vi.fn(),
}));
vi.mock("@/lib/esercizi/formulari", async (originale) => ({
  ...(await originale<typeof import("@/lib/esercizi/formulari")>()),
  leggiFormulario: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ prisma: { verifica: { findUnique: vi.fn() } } }));

import { requireStudent } from "@/lib/auth/require-role";
import { auth } from "@/lib/auth/config";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import {
  consegnaProva,
  entraNellaProva,
  puoVedereFormulario,
  registraEventi,
  salvaRisposta,
  tempoProva,
} from "@/lib/esercizi/prova-verifica";
import { leggiFormulario } from "@/lib/esercizi/formulari";
import { prisma } from "@/lib/db/client";
import { GET as GET_PROVA, POST as POST_PROVA } from "@/app/api/esercizi/verifiche/[id]/prova/route";
import { PUT as PUT_RISPOSTE } from "@/app/api/esercizi/verifiche/[id]/prova/risposte/route";
import { POST as POST_CONSEGNA } from "@/app/api/esercizi/verifiche/[id]/prova/consegna/route";
import { POST as POST_EVENTI } from "@/app/api/esercizi/verifiche/[id]/prova/eventi/route";
import { GET as GET_FORMULARIO } from "@/app/api/esercizi/verifiche/[id]/formulario/route";

const params = Promise.resolve({ id: "v1" });
const BASE = "http://x/api/esercizi/verifiche/v1";
const richiesta = (url: string, metodo: string, corpo?: unknown) =>
  new Request(url, {
    method: metodo,
    body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });

const STATO = {
  seed: "s", answered: true, submitted: 1, adviceDisplayed: false, revealed: false, score: 0, marks: 2,
  parts: [{ path: "p0", answered: true, score: 0, marks: 1, answer: "3" }],
};
const SCADENZA = new Date("2030-01-10T11:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireStudent).mockResolvedValue({ ok: true, session: { user: { id: "s1", role: "STUDENT" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe("POST/GET .../prova", () => {
  it("401 se non autenticato", async () => {
    vi.mocked(requireStudent).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await POST_PROVA(richiesta(`${BASE}/prova`, "POST"), { params })).status).toBe(401);
    expect(entraNellaProva).not.toHaveBeenCalled();
  });

  it("429 con la chiave per studente, 300 al minuto", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 2 });
    const r = await POST_PROVA(richiesta(`${BASE}/prova`, "POST"), { params });
    expect(r.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith({ key: "esercizi:prova:s1", windowSeconds: 60, max: 300 });
  });

  it("200 con la prova, date in ISO", async () => {
    vi.mocked(entraNellaProva).mockResolvedValue({
      ok: true,
      prova: {
        esercizi: [{ tentativoId: "t1", numero: 1, seed: "x", content: { advice: "" }, state: null }],
        scadenza: SCADENZA, oraServer: SCADENZA, calcolatrice: false, formulario: false, formularioTipo: null,
      },
    });
    const r = await POST_PROVA(richiesta(`${BASE}/prova`, "POST"), { params });
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.scadenza).toBe("2030-01-10T11:00:00.000Z");
    expect(corpo.esercizi[0].tentativoId).toBe("t1");
    expect(entraNellaProva).toHaveBeenCalledWith("v1", "s1", expect.any(Date));
  });

  it("i rifiuti: non_trovata 404, gli altri 409 con oraServer", async () => {
    vi.mocked(entraNellaProva).mockResolvedValue({ ok: false, motivo: "non_trovata" });
    expect((await POST_PROVA(richiesta(`${BASE}/prova`, "POST"), { params })).status).toBe(404);
    for (const motivo of ["non_iniziata", "chiusa", "consegnata", "tempo_scaduto"] as const) {
      vi.mocked(entraNellaProva).mockResolvedValue({ ok: false, motivo });
      const r = await POST_PROVA(richiesta(`${BASE}/prova`, "POST"), { params });
      expect(r.status).toBe(409);
      const corpo = await r.json();
      expect(corpo.error).toBe(motivo);
      expect(typeof corpo.oraServer).toBe("string");
    }
  });

  it("GET: il tempo, 404 senza prova", async () => {
    vi.mocked(tempoProva).mockResolvedValue({ scadenza: SCADENZA, oraServer: SCADENZA, consegnata: false });
    const r = await GET_PROVA(richiesta(`${BASE}/prova`, "GET"), { params });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ scadenza: SCADENZA.toISOString(), oraServer: SCADENZA.toISOString(), consegnata: false });
    vi.mocked(tempoProva).mockResolvedValue(null);
    expect((await GET_PROVA(richiesta(`${BASE}/prova`, "GET"), { params })).status).toBe(404);
  });
});

describe("PUT .../prova/risposte", () => {
  const put = (corpo: unknown) => PUT_RISPOSTE(richiesta(`${BASE}/prova/risposte`, "PUT", corpo), { params });

  it("400 per un corpo non valido, compreso state.parts: [null]", async () => {
    for (const corpo of ["x", { tentativoId: "t1" }, { state: STATO }, { tentativoId: "t1", state: { ...STATO, parts: [null] } }]) {
      expect((await put(corpo)).status).toBe(400);
    }
    expect(salvaRisposta).not.toHaveBeenCalled();
  });

  it("200 senza score, maxScore né feedback", async () => {
    const salvato = new Date("2030-01-10T10:05:00Z");
    vi.mocked(salvaRisposta).mockResolvedValue({ ok: true, salvatoAt: salvato, scadenza: SCADENZA });
    const r = await put({ tentativoId: "t1", state: STATO });
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(Object.keys(corpo).sort()).toEqual(["oraServer", "salvatoAt", "scadenza"]);
    for (const chiave of ["score", "maxScore", "feedback"]) expect(corpo).not.toHaveProperty(chiave);
    expect(corpo.salvatoAt).toBe(salvato.toISOString());
    expect(salvaRisposta).toHaveBeenCalledWith("v1", "s1", "t1", STATO, expect.any(Date), "it");
  });

  it("invalid_state 400; consegnata 409 con oraServer; tempo_scaduto 409", async () => {
    vi.mocked(salvaRisposta).mockResolvedValue({ ok: false, motivo: "invalid_state" });
    expect((await put({ tentativoId: "t1", state: STATO })).status).toBe(400);
    vi.mocked(salvaRisposta).mockResolvedValue({ ok: false, motivo: "consegnata" });
    const r = await put({ tentativoId: "t1", state: STATO });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "consegnata", oraServer: expect.any(String) });
    vi.mocked(salvaRisposta).mockResolvedValue({ ok: false, motivo: "tempo_scaduto" });
    expect((await put({ tentativoId: "t1", state: STATO })).status).toBe(409);
  });
});

describe("POST .../prova/consegna", () => {
  it("200 { ok: true }; 404 senza prova", async () => {
    vi.mocked(consegnaProva).mockResolvedValue({ ok: true });
    const r = await POST_CONSEGNA(richiesta(`${BASE}/prova/consegna`, "POST"), { params });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    vi.mocked(consegnaProva).mockResolvedValue({ ok: false, motivo: "non_trovata" });
    expect((await POST_CONSEGNA(richiesta(`${BASE}/prova/consegna`, "POST"), { params })).status).toBe(404);
  });
});

describe("POST .../prova/eventi", () => {
  const post = (corpo: unknown) => POST_EVENTI(richiesta(`${BASE}/prova/eventi`, "POST", corpo), { params });
  const evento = { tipo: "USCITA", motivo: "SCHEDA", at: "2030-01-10T10:05:00.000Z" };

  it("204, con il limite a parte (60 al minuto)", async () => {
    vi.mocked(registraEventi).mockResolvedValue({ ok: true });
    const r = await post({ eventi: [evento, { tipo: "RIENTRO", at: "2030-01-10T10:06:00.000Z", durataMs: 60_000 }] });
    expect(r.status).toBe(204);
    expect(checkRateLimit).toHaveBeenCalledWith({ key: "esercizi:prova-eventi:s1", windowSeconds: 60, max: 60 });
  });

  it("400 per 51 eventi o un evento malformato", async () => {
    expect((await post({ eventi: Array(51).fill(evento) })).status).toBe(400);
    expect((await post({ eventi: [{ ...evento, tipo: "ALTRO" }] })).status).toBe(400);
    expect((await post({ eventi: [{ ...evento, at: "ieri" }] })).status).toBe(400);
    expect(registraEventi).not.toHaveBeenCalled();
  });
});

describe("GET .../formulario", () => {
  const get = () => GET_FORMULARIO(richiesta(`${BASE}/formulario`, "GET"), { params });

  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "s1", role: "STUDENT" } } as never);
    vi.mocked(prisma.verifica.findUnique).mockResolvedValue({ formularioFile: "00000000-0000-0000-0000-000000000000.pdf" } as never);
  });

  it("401 senza sessione", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect((await get()).status).toBe(401);
  });

  it("404 se non può vederlo o il file non c'è", async () => {
    vi.mocked(puoVedereFormulario).mockResolvedValue(false);
    expect((await get()).status).toBe(404);
    vi.mocked(puoVedereFormulario).mockResolvedValue(true);
    vi.mocked(leggiFormulario).mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });

  it("200 col tipo giusto, inline e senza cache", async () => {
    vi.mocked(puoVedereFormulario).mockResolvedValue(true);
    vi.mocked(leggiFormulario).mockResolvedValue({ byte: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), tipo: "application/pdf" });
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("application/pdf");
    expect(r.headers.get("Content-Disposition")).toBe("inline");
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]));
    expect(puoVedereFormulario).toHaveBeenCalledWith("v1", { id: "s1", role: "STUDENT" });
  });

  it("il docente passa col limite delle verifiche", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "d1", role: "TEACHER" } } as never);
    vi.mocked(puoVedereFormulario).mockResolvedValue(true);
    vi.mocked(leggiFormulario).mockResolvedValue({ byte: new Uint8Array([1]), tipo: "image/png" });
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("image/png");
    expect(checkRateLimit).toHaveBeenCalledWith({ key: "esercizi:verifiche:d1", windowSeconds: 60, max: 120 });
  });
});
