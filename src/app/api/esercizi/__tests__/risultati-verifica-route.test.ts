import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({
  requireTeacher: vi.fn(),
}));
vi.mock("@/lib/esercizi/risultati-verifica", () => ({
  risultatiVerifica: vi.fn(),
  dettaglioRisposta: vi.fn(),
  modificaPunti: vi.fn(),
  pubblicaRisultati: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireTeacher } from "@/lib/auth/require-role";
import { dettaglioRisposta, modificaPunti, pubblicaRisultati, risultatiVerifica } from "@/lib/esercizi/risultati-verifica";
import { GET } from "@/app/api/esercizi/verifiche/[id]/risultati/route";
import { PUT } from "@/app/api/esercizi/verifiche/[id]/punti/route";
import { POST } from "@/app/api/esercizi/verifiche/[id]/azioni/route";

// Modalità verifica, Task 11: le rotte dei risultati. Il dominio è finto:
// qui si controllano autenticazione, corpi e traduzione degli esiti.
const params = Promise.resolve({ id: "v1" });
const BASE = "http://x/api/esercizi/verifiche/v1";
const richiesta = (url: string, metodo: string, corpo?: unknown) =>
  new Request(url, {
    method: metodo,
    body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente1", role: "TEACHER" } } } as never);
});

describe("GET /api/esercizi/verifiche/[id]/risultati", () => {
  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    expect((await GET(richiesta(`${BASE}/risultati`, "GET"), { params })).status).toBe(401);
    expect(risultatiVerifica).not.toHaveBeenCalled();
  });

  it("404 per un docente estraneo, 409 durante la prova", async () => {
    vi.mocked(risultatiVerifica).mockResolvedValueOnce({ ok: false, motivo: "non_trovata" });
    const r = await GET(richiesta(`${BASE}/risultati`, "GET"), { params });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "non_trovata" });
    expect(risultatiVerifica).toHaveBeenCalledWith("v1", "docente1");

    vi.mocked(risultatiVerifica).mockResolvedValueOnce({ ok: false, motivo: "stato_non_valido" });
    expect((await GET(richiesta(`${BASE}/risultati`, "GET"), { params })).status).toBe(409);
  });

  it("200 con i risultati e le date in ISO", async () => {
    vi.mocked(risultatiVerifica).mockResolvedValue({
      ok: true,
      risultati: {
        stato: "CHIUSA",
        totalePieno: 4,
        colonne: [{ posizione: 0, punti: 4 }],
        righe: [{
          studentId: "s1", nome: "S1", stato: "consegnato", recupero: false, menoEsercizi: false, celle: [null],
          ottenuto: 0, totaleStudente: 0, finale: 0, percentuale: 0, uscite: 1, secondiFuori: 0,
          eventi: [{ tipo: "USCITA", motivo: "SCHEDA", at: new Date("2030-01-10T10:00:00Z"), durataMs: null }], pubblicata: false,
        }],
      },
    });
    const r = await GET(richiesta(`${BASE}/risultati`, "GET"), { params });
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.totalePieno).toBe(4);
    expect(corpo.righe[0].eventi[0].at).toBe("2030-01-10T10:00:00.000Z");
  });

  it("?tentativo= ⇒ il dettaglio della risposta; null ⇒ 404", async () => {
    vi.mocked(dettaglioRisposta).mockResolvedValueOnce({ seed: "s", content: {}, state: null, punti: 1, puntiMax: 2, manuale: false });
    const r = await GET(richiesta(`${BASE}/risultati?tentativo=t1`, "GET"), { params });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ seed: "s", content: {}, state: null, punti: 1, puntiMax: 2, manuale: false });
    expect(dettaglioRisposta).toHaveBeenCalledWith("v1", "docente1", "t1");
    expect(risultatiVerifica).not.toHaveBeenCalled();

    vi.mocked(dettaglioRisposta).mockResolvedValueOnce(null);
    expect((await GET(richiesta(`${BASE}/risultati?tentativo=t2`, "GET"), { params })).status).toBe(404);
  });
});

describe("PUT /api/esercizi/verifiche/[id]/punti", () => {
  it("400 per un corpo non valido", async () => {
    for (const corpo of ["x", {}, { tentativoId: "t1" }, { tentativoId: "", punti: 1 }, { tentativoId: "t1", punti: "1" }]) {
      expect((await PUT(richiesta(`${BASE}/punti`, "PUT", corpo), { params })).status).toBe(400);
    }
    expect(modificaPunti).not.toHaveBeenCalled();
  });

  it("passa punti o null al dominio e traduce gli esiti", async () => {
    vi.mocked(modificaPunti).mockResolvedValueOnce({ ok: true });
    expect((await PUT(richiesta(`${BASE}/punti`, "PUT", { tentativoId: "t1", punti: 1.25 }), { params })).status).toBe(200);
    expect(modificaPunti).toHaveBeenCalledWith("v1", "docente1", "t1", 1.25);

    vi.mocked(modificaPunti).mockResolvedValueOnce({ ok: true });
    await PUT(richiesta(`${BASE}/punti`, "PUT", { tentativoId: "t1", punti: null }), { params });
    expect(modificaPunti).toHaveBeenLastCalledWith("v1", "docente1", "t1", null);

    for (const [motivo, status] of [["non_trovata", 404], ["stato_non_valido", 409], ["valore_non_valido", 400]] as const) {
      vi.mocked(modificaPunti).mockResolvedValueOnce({ ok: false, motivo });
      expect((await PUT(richiesta(`${BASE}/punti`, "PUT", { tentativoId: "t1", punti: 1 }), { params })).status).toBe(status);
    }
  });
});

describe("POST .../azioni pubblica", () => {
  it("pubblica tutti o solo alcuni studenti", async () => {
    vi.mocked(pubblicaRisultati).mockResolvedValue({ ok: true });
    expect((await POST(richiesta(`${BASE}/azioni`, "POST", { azione: "pubblica" }), { params })).status).toBe(200);
    expect(pubblicaRisultati).toHaveBeenLastCalledWith("v1", "docente1", undefined);
    expect((await POST(richiesta(`${BASE}/azioni`, "POST", { azione: "pubblica", studentIds: ["s1"] }), { params })).status).toBe(200);
    expect(pubblicaRisultati).toHaveBeenLastCalledWith("v1", "docente1", ["s1"]);
  });

  it("404 per un docente estraneo, 409 a verifica in corso", async () => {
    vi.mocked(pubblicaRisultati).mockResolvedValueOnce({ ok: false, motivo: "non_trovata" });
    expect((await POST(richiesta(`${BASE}/azioni`, "POST", { azione: "pubblica" }), { params })).status).toBe(404);
    vi.mocked(pubblicaRisultati).mockResolvedValueOnce({ ok: false, motivo: "stato_non_valido" });
    expect((await POST(richiesta(`${BASE}/azioni`, "POST", { azione: "pubblica" }), { params })).status).toBe(409);
  });
});
