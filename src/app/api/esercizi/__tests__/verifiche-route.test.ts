import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({
  requireTeacher: vi.fn(),
}));
// Solo le funzioni che leggono e scrivono il database: i tipi e il resto del
// modulo restano veri.
vi.mock("@/lib/esercizi/verifiche", async (originale) => ({
  ...(await originale<typeof import("@/lib/esercizi/verifiche")>()),
  monitoraggioVerifica: vi.fn(),
  modificaVerificaPreparata: vi.fn(),
  avviaVerifica: vi.fn(),
  chiudiVerifica: vi.fn(),
  aggiungiMinuti: vi.fn(),
  avviaRecupero: vi.fn(),
  chiudiRecupero: vi.fn(),
  misureDellaVerifica: vi.fn(),
  salvaMisureVerifica: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireTeacher } from "@/lib/auth/require-role";
import {
  aggiungiMinuti,
  avviaRecupero,
  avviaVerifica,
  chiudiRecupero,
  chiudiVerifica,
  misureDellaVerifica,
  modificaVerificaPreparata,
  monitoraggioVerifica,
  salvaMisureVerifica,
  type Monitoraggio,
} from "@/lib/esercizi/verifiche";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { GET, PATCH } from "@/app/api/esercizi/verifiche/[id]/route";
import { POST } from "@/app/api/esercizi/verifiche/[id]/azioni/route";
import { GET as GET_MISURE, PUT as PUT_MISURE } from "@/app/api/esercizi/verifiche/[id]/misure/route";

const params = Promise.resolve({ id: "v1" });
const BASE = "http://x/api/esercizi/verifiche/v1";
const richiesta = (url: string, metodo: string, corpo?: unknown) =>
  new Request(url, {
    method: metodo,
    body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
const azione = (corpo: unknown) => POST(richiesta(`${BASE}/azioni`, "POST", corpo), { params });

const MISURE = { tempoExtraPct: 30, menoEsercizi: false, calcolatrice: true, formulario: false };
const non401 = () =>
  vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente1", role: "TEACHER" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

describe("GET /api/esercizi/verifiche/[id]", () => {
  it("401 se non autenticato", async () => {
    non401();
    expect((await GET(richiesta(BASE, "GET"), { params })).status).toBe(401);
    expect(monitoraggioVerifica).not.toHaveBeenCalled();
  });

  it("429 con la chiave per docente, 120 al minuto", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 3 });
    const r = await GET(richiesta(BASE, "GET"), { params });
    expect(r.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith({ key: "esercizi:verifiche:docente1", windowSeconds: 60, max: 120 });
  });

  it("404 per un docente estraneo (o una verifica che non c'è)", async () => {
    vi.mocked(monitoraggioVerifica).mockResolvedValue(null);
    const r = await GET(richiesta(BASE, "GET"), { params });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "non_trovata" });
    expect(monitoraggioVerifica).toHaveBeenCalledWith("v1", "docente1");
  });

  it("200 con le date in ISO", async () => {
    const avvio = new Date("2030-01-10T10:00:00Z");
    const m: Monitoraggio = {
      verifica: {
        compitoId: "v1", classeId: "c1", assignedById: "docente1", createdAt: avvio, durataMinuti: 60,
        avvioProgrammatoAt: null, avviataAt: avvio, chiusaAt: null, pubblicataAt: null, minutiExtra: 0,
        calcolatrice: "SOLO_PDP", formulario: "NESSUNO", formularioFile: null, layout: [], stato: "IN_CORSO",
      },
      titolo: "T",
      classe: "3B",
      oraServer: new Date("2030-01-10T10:05:00Z"),
      conTempoResiduo: 1,
      recuperiAperti: 0,
      righe: [{
        studentId: "s1", nome: "S1", stato: "in_corso", recupero: false, risposti: 0, totale: 3,
        scadenza: new Date("2030-01-10T11:00:00Z"), secondiResidui: 3300, tempoExtraPct: 0, minutiExtra: 0,
        uscite: 0, secondiFuori: 0, ultimoSalvataggioAt: null, recuperabile: false,
      }],
    };
    vi.mocked(monitoraggioVerifica).mockResolvedValue(m);
    const r = await GET(richiesta(BASE, "GET"), { params });
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.oraServer).toBe("2030-01-10T10:05:00.000Z");
    expect(corpo.verifica.avviataAt).toBe("2030-01-10T10:00:00.000Z");
    expect(corpo.righe[0].scadenza).toBe("2030-01-10T11:00:00.000Z");
  });
});

describe("PATCH /api/esercizi/verifiche/[id]", () => {
  it("401 se non autenticato", async () => {
    non401();
    expect((await PATCH(richiesta(BASE, "PATCH", { durataMinuti: 50 }), { params })).status).toBe(401);
  });

  it("400 per un corpo non valido", async () => {
    for (const corpo of ["x", { durataMinuti: "50" }, { calcolatrice: "SEMPRE" }, { avvioProgrammatoAt: "domani" }, { formularioFile: "../x.pdf" }]) {
      expect((await PATCH(richiesta(BASE, "PATCH", corpo), { params })).status).toBe(400);
    }
    expect(modificaVerificaPreparata).not.toHaveBeenCalled();
  });

  it("passa i campi al dominio e traduce gli esiti", async () => {
    vi.mocked(modificaVerificaPreparata).mockResolvedValue({ ok: true });
    const r = await PATCH(
      richiesta(BASE, "PATCH", { durataMinuti: 50, avvioProgrammatoAt: "2030-01-10T10:00:00.000Z", formularioFile: null }),
      { params },
    );
    expect(r.status).toBe(200);
    expect(modificaVerificaPreparata).toHaveBeenCalledWith("v1", "docente1", {
      durataMinuti: 50,
      avvioProgrammatoAt: new Date("2030-01-10T10:00:00.000Z"),
      formularioFile: null,
    });

    vi.mocked(modificaVerificaPreparata).mockResolvedValue({ ok: false, motivo: "stato_non_valido" });
    const conflitto = await PATCH(richiesta(BASE, "PATCH", { durataMinuti: 50 }), { params });
    expect(conflitto.status).toBe(409);
    expect(await conflitto.json()).toEqual({ error: "stato_non_valido" });

    vi.mocked(modificaVerificaPreparata).mockResolvedValue({ ok: false, motivo: "non_trovata" });
    expect((await PATCH(richiesta(BASE, "PATCH", { durataMinuti: 50 }), { params })).status).toBe(404);
  });
});

describe("POST /api/esercizi/verifiche/[id]/azioni", () => {
  it("401 se non autenticato", async () => {
    non401();
    expect((await azione({ azione: "avvia" })).status).toBe(401);
    expect(avviaVerifica).not.toHaveBeenCalled();
  });

  it("400 per un corpo non valido", async () => {
    for (const corpo of [
      "non json",
      {},
      { azione: "boh" },
      { azione: "minuti" },
      { azione: "minuti", minuti: "5" },
      { azione: "recupero" },
      { azione: "recupero", studentIds: "s1" },
      { azione: "chiudiRecupero", studentIds: [1] },
    ]) {
      const r = await azione(corpo);
      expect(r.status).toBe(400);
    }
    expect(aggiungiMinuti).not.toHaveBeenCalled();
    expect(avviaRecupero).not.toHaveBeenCalled();
  });

  it("pubblica: con studentIds vuoto ⇒ 400 (l'azione è collegata nel Task 11, vedi risultati-verifica-route.test.ts)", async () => {
    expect((await azione({ azione: "pubblica", studentIds: [] })).status).toBe(400);
  });

  it("chiama l'azione giusta e traduce gli esiti", async () => {
    vi.mocked(avviaVerifica).mockResolvedValue({ ok: true });
    expect((await azione({ azione: "avvia" })).status).toBe(200);
    expect(avviaVerifica).toHaveBeenCalledWith("v1", "docente1");

    vi.mocked(chiudiVerifica).mockResolvedValue({ ok: false, motivo: "stato_non_valido" });
    const r = await azione({ azione: "chiudi" });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "stato_non_valido" });

    vi.mocked(aggiungiMinuti).mockResolvedValue({ ok: false, motivo: "valore_non_valido" });
    expect((await azione({ azione: "minuti", minuti: 500, studentId: "s1" })).status).toBe(400);
    expect(aggiungiMinuti).toHaveBeenCalledWith("v1", "docente1", 500, "s1");

    vi.mocked(avviaRecupero).mockResolvedValue({ ok: false, motivo: "studenti_non_validi" });
    expect((await azione({ azione: "recupero", studentIds: ["s1"] })).status).toBe(400);
    expect(avviaRecupero).toHaveBeenCalledWith("v1", "docente1", ["s1"]);

    vi.mocked(chiudiRecupero).mockResolvedValue({ ok: false, motivo: "non_trovata" });
    expect((await azione({ azione: "chiudiRecupero", studentIds: ["s1"] })).status).toBe(404);
  });
});

describe("GET/PUT /api/esercizi/verifiche/[id]/misure", () => {
  const URL_MISURE = `${BASE}/misure`;

  it("401 se non autenticato", async () => {
    non401();
    expect((await GET_MISURE(richiesta(URL_MISURE, "GET"), { params })).status).toBe(401);
    expect((await PUT_MISURE(richiesta(URL_MISURE, "PUT", { studentId: "s1", misure: MISURE }), { params })).status).toBe(401);
  });

  it("GET: 404 per un docente estraneo, 200 con l'elenco", async () => {
    vi.mocked(misureDellaVerifica).mockResolvedValue(null);
    expect((await GET_MISURE(richiesta(URL_MISURE, "GET"), { params })).status).toBe(404);
    const elenco = [{ studentId: "s1", nome: "S1", misure: MISURE, personalizzate: false }];
    vi.mocked(misureDellaVerifica).mockResolvedValue(elenco);
    const r = await GET_MISURE(richiesta(URL_MISURE, "GET"), { params });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ studenti: elenco });
  });

  it("PUT: 400 per un corpo non valido, 409 dopo l'avvio, 200 quando salva", async () => {
    for (const corpo of ["x", { studentId: "s1" }, { studentId: "s1", misure: { ...MISURE, tempoExtraPct: 101 } }]) {
      expect((await PUT_MISURE(richiesta(URL_MISURE, "PUT", corpo), { params })).status).toBe(400);
    }
    expect(salvaMisureVerifica).not.toHaveBeenCalled();

    vi.mocked(salvaMisureVerifica).mockResolvedValue({ ok: false, motivo: "stato_non_valido" });
    expect((await PUT_MISURE(richiesta(URL_MISURE, "PUT", { studentId: "s1", misure: MISURE }), { params })).status).toBe(409);

    vi.mocked(salvaMisureVerifica).mockResolvedValue({ ok: true });
    const r = await PUT_MISURE(richiesta(URL_MISURE, "PUT", { studentId: "s1", misure: MISURE }), { params });
    expect(r.status).toBe(200);
    expect(salvaMisureVerifica).toHaveBeenCalledWith("v1", "docente1", "s1", MISURE);
  });
});
