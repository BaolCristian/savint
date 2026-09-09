import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/require-role", () => ({
  requireTeacher: vi.fn(),
}));
vi.mock("@/lib/esercizi/batterie", () => ({
  argomentiDisponibili: vi.fn(),
}));
vi.mock("@/lib/esercizi/compiti", () => ({
  quantiCorrispondono: vi.fn(),
}));
vi.mock("@/lib/esercizi/classi", () => ({
  classiDelDocente: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireTeacher } from "@/lib/auth/require-role";
import { argomentiDisponibili } from "@/lib/esercizi/batterie";
import { quantiCorrispondono } from "@/lib/esercizi/compiti";
import { classiDelDocente } from "@/lib/esercizi/classi";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { GET } from "@/app/api/esercizi/argomenti/route";

const richiesta = (query: string) => new NextRequest(`http://x/api/esercizi/argomenti${query}`);

const classeConAnno = { id: "c1", name: "2A", yearLevel: 2, studenti: 10, codice: null };

beforeEach(() => {
  // Le asserzioni "not.toHaveBeenCalled" qui sotto contano le chiamate
  // dall'inizio dei mock, non solo nel test corrente: senza azzerarli fra
  // un test e l'altro, una chiamata legittima in un test precedente
  // (l'elenco che chiama argomentiDisponibili, il conteggio che chiama
  // quantiCorrispondono) farebbe fallire l'asserzione "mai chiamata" di un
  // test successivo che non c'entra nulla con quella chiamata.
  vi.clearAllMocks();
  vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente1" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(classiDelDocente).mockResolvedValue([classeConAnno] as never);
  vi.mocked(argomentiDisponibili).mockResolvedValue([]);
});

describe("GET /api/esercizi/argomenti", () => {
  it("401 se non autenticato", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
    const r = await GET(richiesta("?classeId=c1"));
    expect(r.status).toBe(401);
    expect(argomentiDisponibili).not.toHaveBeenCalled();
  });

  it("403 per ruolo sbagliato (studente)", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    const r = await GET(richiesta("?classeId=c1"));
    expect(r.status).toBe(403);
  });

  it("400 senza classeId", async () => {
    const r = await GET(richiesta(""));
    expect(r.status).toBe(400);
    expect(argomentiDisponibili).not.toHaveBeenCalled();
  });

  it("429 quando il rate limit scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 3 });
    const r = await GET(richiesta("?classeId=c1"));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("3");
  });

  // Il conteggio è letto mentre il docente sceglie: più chiamate per ogni
  // singola assegnazione, non una sola. Il tetto deve riflettere questo,
  // non essere quello (più basso) di una rotta di scrittura.
  it("il tetto e' più alto di quello di una rotta di scrittura di quest'area (30/60s)", async () => {
    await GET(richiesta("?classeId=c1"));
    const chiamata = vi.mocked(checkRateLimit).mock.calls[0]![0];
    expect(chiamata.max).toBeGreaterThan(30);
  });

  it("il tetto e' contato per docente", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente-vero" } } } as never);
    await GET(richiesta("?classeId=c1"));
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: expect.stringContaining("docente-vero") }),
    );
  });

  it("404, non 403, se il docente non insegna quella classe", async () => {
    vi.mocked(classiDelDocente).mockResolvedValue([] as never);
    const r = await GET(richiesta("?classeId=altra"));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "non_insegni_questa_classe" });
  });

  it("422 se la classe non ha un anno", async () => {
    vi.mocked(classiDelDocente).mockResolvedValue([{ ...classeConAnno, yearLevel: null }] as never);
    const r = await GET(richiesta("?classeId=c1"));
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: "classe_senza_anno" });
  });

  it("senza argomento restituisce l'elenco, filtrato per l'anno della classe", async () => {
    vi.mocked(argomentiDisponibili).mockResolvedValue([{ argomento: "Equazioni", quanti: 4 }]);
    const r = await GET(richiesta("?classeId=c1"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([{ argomento: "Equazioni", quanti: 4 }]);
    expect(argomentiDisponibili).toHaveBeenCalledWith(2);
    expect(quantiCorrispondono).not.toHaveBeenCalled();
  });

  it("con argomento restituisce il conteggio esatto, non l'elenco", async () => {
    vi.mocked(quantiCorrispondono).mockResolvedValue(7);
    const r = await GET(richiesta("?classeId=c1&argomento=Equazioni"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ quanti: 7 });
    expect(quantiCorrispondono).toHaveBeenCalledWith({ anno: 2, argomento: "Equazioni", difficoltaMax: undefined });
    expect(argomentiDisponibili).not.toHaveBeenCalled();
  });

  it("inoltra difficoltaMax al conteggio", async () => {
    vi.mocked(quantiCorrispondono).mockResolvedValue(2);
    const r = await GET(richiesta("?classeId=c1&argomento=Equazioni&difficoltaMax=2"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ quanti: 2 });
    expect(quantiCorrispondono).toHaveBeenCalledWith({ anno: 2, argomento: "Equazioni", difficoltaMax: 2 });
  });

  it("400 con un parametro fuori range", async () => {
    const r = await GET(richiesta("?classeId=c1&argomento=Equazioni&difficoltaMax=9"));
    expect(r.status).toBe(400);
    expect(quantiCorrispondono).not.toHaveBeenCalled();
  });

  // Non deve diventare un modo per sfogliare il banco esercizi: un
  // classeId inventato (o di un'altra classe) è respinto PRIMA di
  // qualunque interrogazione al banco, non dopo.
  it("non enumera il banco esercizi senza una classe reale del docente", async () => {
    const r = await GET(richiesta("?classeId=c-inventato"));
    expect(r.status).toBe(404);
    expect(argomentiDisponibili).not.toHaveBeenCalled();
    expect(quantiCorrispondono).not.toHaveBeenCalled();
  });
});
